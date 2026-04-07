import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentConfig, RunResult } from "../src/types.js";
import { resetStore } from "../src/store.js";
import { resetSession, getRunHistory } from "../src/session.js";
import { resetWidgetState } from "../src/widget.js";
vi.mock("fs", async (orig) => {
	const a = await orig<typeof import("fs")>();
	return { ...a, writeFileSync: vi.fn(), existsSync: vi.fn(() => true), mkdirSync: vi.fn() };
});
vi.mock("../src/spawn.js", () => ({ spawnAndCollect: vi.fn() }));
import { createRunner, createSessionRunner } from "../src/run-factory.js";
import { spawnAndCollect } from "../src/spawn.js";
const agent: AgentConfig = { name: "scout", description: "", systemPrompt: "find", filePath: "/a.md" };
const ok: RunResult = { id: 1, agent: "scout", output: "done", usage: { inputTokens: 10, outputTokens: 5, turns: 1 } };
const mock = () => (spawnAndCollect as ReturnType<typeof vi.fn>);
const ctx = () => ({ hasUI: false, ui: { setWidget: vi.fn() }, sessionManager: { getBranch: () => [] } });
type EvtFn = (e: Record<string, string | undefined>) => void;

describe("onEvent integration", () => {
	beforeEach(() => { vi.clearAllMocks(); resetStore(); resetSession(); resetWidgetState(); });

	it("passes onEvent callback to spawnAndCollect in createRunner", async () => {
		mock().mockResolvedValue(ok);
		await createRunner(false, ctx())(agent, "task");
		const lastCall = mock().mock.calls[0];
		expect(typeof lastCall[5]).toBe("function");
	});

	it("passes onEvent callback to spawnAndCollect in createSessionRunner", async () => {
		mock().mockResolvedValue(ok);
		await createSessionRunner("/tmp/s.json", ctx())(agent, "task");
		const lastCall = mock().mock.calls[0];
		expect(typeof lastCall[5]).toBe("function");
	});

	it("onEvent updates widget on tool_start/tool_end", async () => {
		const c = ctx();
		c.hasUI = true;
		mock().mockImplementation((_c: string, _a: string[], _i: number, _n: string, _s: unknown, onEvt: EvtFn) => {
			onEvt({ type: "tool_start", toolName: "Bash" });
			onEvt({ type: "tool_end", toolName: "Bash" });
			onEvt({ type: "message", text: "hello" });
			return Promise.resolve(ok);
		});
		await createRunner(false, c)(agent, "task");
		expect(c.ui.setWidget).toHaveBeenCalled();
	});

	it("collects events in history for createRunner", async () => {
		mock().mockImplementation((_c: string, _a: string[], _i: number, _n: string, _s: unknown, onEvent: EvtFn) => {
			onEvent({ type: "tool_start", toolName: "Read" });
			return Promise.resolve(ok);
		});
		await createRunner(false, ctx())(agent, "task");
		const hist = getRunHistory();
		expect(hist[hist.length - 1].events).toHaveLength(1);
		expect(hist[hist.length - 1].events?.[0].toolName).toBe("Read");
	});

	it("collects events in history for createSessionRunner", async () => {
		mock().mockImplementation((_c: string, _a: string[], _i: number, _n: string, _s: unknown, onEvent: EvtFn) => {
			onEvent({ type: "message", text: "hi" });
			return Promise.resolve(ok);
		});
		await createSessionRunner("/tmp/s.json", ctx())(agent, "task");
		const hist = getRunHistory();
		expect(hist[hist.length - 1].events).toHaveLength(1);
		expect(hist[hist.length - 1].events?.[0].text).toBe("hi");
	});

	it("calls onUpdate on tool_start event in createRunner", async () => {
		const onUpdate = vi.fn();
		mock().mockImplementation((_c: string, _a: string[], _i: number, _n: string, _s: unknown, onEvt: EvtFn) => {
			onEvt({ type: "tool_start", toolName: "Bash" });
			return Promise.resolve(ok);
		});
		await createRunner(false, ctx(), onUpdate)(agent, "task");
		expect(onUpdate).toHaveBeenCalledWith({ content: [{ type: "text", text: "→ Bash" }] });
	});

	it("calls onUpdate on message event in createRunner", async () => {
		const onUpdate = vi.fn();
		mock().mockImplementation((_c: string, _a: string[], _i: number, _n: string, _s: unknown, onEvt: EvtFn) => {
			onEvt({ type: "message", text: "progress update" });
			return Promise.resolve(ok);
		});
		await createRunner(false, ctx(), onUpdate)(agent, "task");
		expect(onUpdate).toHaveBeenCalledWith({ content: [{ type: "text", text: "progress update" }] });
	});

	it("calls onUpdate on tool_start event in createSessionRunner", async () => {
		const onUpdate = vi.fn();
		mock().mockImplementation((_c: string, _a: string[], _i: number, _n: string, _s: unknown, onEvt: EvtFn) => {
			onEvt({ type: "tool_start", toolName: "Write" });
			return Promise.resolve(ok);
		});
		await createSessionRunner("/tmp/s.json", ctx(), onUpdate)(agent, "task");
		expect(onUpdate).toHaveBeenCalledWith({ content: [{ type: "text", text: "→ Write" }] });
	});

	it("calls onUpdate on message event in createSessionRunner", async () => {
		const onUpdate = vi.fn();
		mock().mockImplementation((_c: string, _a: string[], _i: number, _n: string, _s: unknown, onEvt: EvtFn) => {
			onEvt({ type: "message", text: "session message" });
			return Promise.resolve(ok);
		});
		await createSessionRunner("/tmp/s.json", ctx(), onUpdate)(agent, "task");
		expect(onUpdate).toHaveBeenCalledWith({ content: [{ type: "text", text: "session message" }] });
	});

	it("accumulates multiple texts in onUpdate calls", async () => {
		const onUpdate = vi.fn();
		mock().mockImplementation((_c: string, _a: string[], _i: number, _n: string, _s: unknown, onEvt: EvtFn) => {
			onEvt({ type: "tool_start", toolName: "Bash" });
			onEvt({ type: "message", text: "output" });
			return Promise.resolve(ok);
		});
		await createRunner(false, ctx(), onUpdate)(agent, "task");
		expect(onUpdate).toHaveBeenCalledTimes(2);
		expect(onUpdate.mock.calls[1][0].content[0].text).toBe("→ Bash\noutput");
	});

	it("uses empty string when toolName is undefined on tool_start", async () => {
		const onUpdate = vi.fn();
		mock().mockImplementation((_c: string, _a: string[], _i: number, _n: string, _s: unknown, onEvt: EvtFn) => {
			onEvt({ type: "tool_start", toolName: undefined });
			return Promise.resolve(ok);
		});
		await createRunner(false, ctx(), onUpdate)(agent, "task");
		expect(onUpdate).toHaveBeenCalledWith({ content: [{ type: "text", text: "→ " }] });
	});
});
