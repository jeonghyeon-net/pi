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
import { createRunner, createSessionRunner, errorMsg } from "../src/run-factory.js";
import { spawnAndCollect } from "../src/spawn.js";

const agent: AgentConfig = { name: "reviewer", description: "", systemPrompt: "review", filePath: "/r.md" };
const ok: RunResult = { id: 1, agent: "reviewer", output: "done", usage: { inputTokens: 1, outputTokens: 1, turns: 1 } };
const ctx = () => ({ hasUI: true, ui: { setWidget: vi.fn() }, sessionManager: { getBranch: () => [] } });
const mock = () => (spawnAndCollect as ReturnType<typeof vi.fn>);
type EvtFn = (e: Record<string, string | boolean | undefined>) => void;

function lastText(onUpdate: ReturnType<typeof vi.fn>) {
	return onUpdate.mock.calls.at(-1)?.[0]?.content?.[0]?.text ?? "";
}

describe("run-factory coverage", () => {
	beforeEach(() => { vi.clearAllMocks(); resetStore(); resetSession(); resetWidgetState(); });

	it("reports tool updates and message deltas live", async () => {
		const onUpdate = vi.fn();
		mock().mockImplementation((_c: string, _a: string[], _i: number, _n: string, _s: unknown, onEvt: EvtFn) => {
			onEvt({ type: "tool_update", toolName: "bash", text: "git diff --stat" });
			onEvt({ type: "tool_update", toolName: undefined });
			onEvt({ type: "message_delta", text: "draft" });
			onEvt({ type: "message_delta", text: undefined });
			onEvt({ type: "message", text: "", stopReason: "stop" });
			onEvt({ type: "tool_end", toolName: "bash", isError: false });
			return Promise.resolve(ok);
		});
		await createRunner(false, ctx(), onUpdate)(agent, "inspect patch");
		expect(lastText(onUpdate)).toContain("bash finished");
		expect(lastText(onUpdate)).toContain("💬 (empty response)");
	});

	it("covers tool start and tool end text branches", async () => {
		const onUpdate = vi.fn();
		mock().mockImplementation((_c: string, _a: string[], _i: number, _n: string, _s: unknown, onEvt: EvtFn) => {
			for (let i = 0; i < 7; i++) onEvt({ type: "tool_start", toolName: `bash-${i}`, text: `cmd-${i}` });
			onEvt({ type: "tool_update", toolName: "bash" });
			onEvt({ type: "tool_end", isError: true });
			onEvt({ type: "tool_end", text: "all good", isError: false });
			onEvt({ type: "tool_end", toolName: "bash", text: "permission denied", isError: true });
			return Promise.resolve(ok);
		});
		await createRunner(false, ctx(), onUpdate)(agent, "inspect patch");
		expect(lastText(onUpdate)).toContain("✗ bash: permission denied");
	});

	it("records agent_end error details in progress and history", async () => {
		const onUpdate = vi.fn();
		const c = ctx();
		mock().mockImplementation((_c: string, _a: string[], _i: number, _n: string, _s: unknown, onEvt: EvtFn) => {
			onEvt({ type: "agent_end", stopReason: "error", text: "provider failed", isError: true });
			onEvt({ type: "agent_end" });
			return Promise.resolve({ ...ok, error: "provider failed" });
		});
		await createRunner(false, c, onUpdate)(agent, "inspect patch");
		expect(lastText(onUpdate)).toContain("finished");
		expect(lastText(onUpdate)).toContain("✗ provider failed");
		const hist = getRunHistory();
		expect(hist.at(-1)?.error).toBe("provider failed");
		expect(hist.at(-1)?.events?.[0]?.stopReason).toBe("error");
	});

	it("stores history for thrown failures", async () => {
		mock().mockRejectedValue(new Error("boom"));
		await expect(createRunner(false, ctx())(agent, "inspect patch")).rejects.toThrow("boom");
		const hist = getRunHistory();
		expect(hist.at(-1)?.error).toBe("boom");
		expect(hist.at(-1)?.task).toBe("inspect patch");
	});

	it("formats non-Error failures consistently", () => {
		expect(errorMsg("boom")).toBe("boom");
	});

	it("stores history for thrown session runner failures", async () => {
		mock().mockRejectedValue(new Error("session boom"));
		await expect(createSessionRunner("/tmp/s.json", ctx())(agent, "inspect patch")).rejects.toThrow("session boom");
		const hist = getRunHistory();
		expect(hist.at(-1)?.error).toBe("session boom");
		expect(hist.at(-1)?.sessionFile).toBe("/tmp/s.json");
	});
});
