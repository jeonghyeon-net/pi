import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentConfig, RunResult, SubagentPi } from "../src/types.js";
import { resetStore, addRun } from "../src/store.js";
import { resetSession, addToHistory } from "../src/session.js";
vi.mock("fs", async (orig) => {
	const a = await orig<typeof import("fs")>();
	return { ...a, writeFileSync: vi.fn(), existsSync: vi.fn(() => true), mkdirSync: vi.fn() };
});
vi.mock("../src/spawn.js", () => ({ spawnAndCollect: vi.fn() }));
import { dispatchAbort, dispatchContinue } from "../src/dispatch.js";
import { spawnAndCollect } from "../src/spawn.js";
const agent: AgentConfig = { name: "scout", description: "", systemPrompt: "find", filePath: "/a.md" };
const ok: RunResult = { id: 1, agent: "scout", output: "done", usage: { inputTokens: 10, outputTokens: 5, turns: 1 } };
const mock = () => (spawnAndCollect as ReturnType<typeof vi.fn>);
const stubPi = (): SubagentPi => ({ sendMessage: vi.fn(), appendEntry: vi.fn() });
const stubCtx = () => ({ hasUI: false, ui: { setWidget: vi.fn() }, sessionManager: { getBranch: () => [] } });
const wait = (ms = 50) => new Promise((r) => setTimeout(r, ms));
describe("dispatchAbort", () => {
	beforeEach(() => { vi.clearAllMocks(); resetStore(); resetSession(); });
	it("aborts an active run", () => {
		const abortFn = vi.fn();
		addRun({ id: 1, agent: "scout", startedAt: Date.now(), abort: abortFn });
		const msg = dispatchAbort(1);
		expect(msg).toContain("aborted");
		expect(msg).toContain("scout");
		expect(abortFn).toHaveBeenCalled();
	});
	it("returns not found for missing run", () => {
		expect(dispatchAbort(999)).toContain("not found");
	});
});
describe("dispatchContinue", () => {
	beforeEach(() => { vi.clearAllMocks(); resetStore(); resetSession(); });
	it("continues an existing run", async () => {
		mock().mockResolvedValue(ok);
		addToHistory({ id: 1, agent: "scout", output: "ok", sessionFile: "/tmp/sess.json" });
		const pi = stubPi();
		const msg = dispatchContinue(1, "more work", [agent], pi, stubCtx());
		expect(msg).toContain("continue");
		expect(msg).toContain("scout");
		await wait();
		expect(pi.sendMessage).toHaveBeenCalled();
	});
	it("returns not found when no history", () => {
		expect(dispatchContinue(999, "task", [agent], stubPi(), stubCtx())).toContain("not found");
	});
	it("returns agent not found when agent missing", () => {
		addToHistory({ id: 1, agent: "unknown", output: "ok", sessionFile: "/tmp/s.json" });
		expect(dispatchContinue(1, "task", [agent], stubPi(), stubCtx())).toContain("Agent for run");
	});
	it("sends error followUp on failure", async () => {
		mock().mockRejectedValue(new Error("fail"));
		addToHistory({ id: 1, agent: "scout", output: "ok", sessionFile: "/tmp/s.json" });
		const pi = stubPi();
		dispatchContinue(1, "task", [agent], pi, stubCtx());
		await wait();
		const call = (pi.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(call[0].content).toContain("error");
	});
	it("returns not found when session file missing", () => {
		addToHistory({ id: 1, agent: "scout", output: "ok" });
		expect(dispatchContinue(1, "task", [agent], stubPi(), stubCtx())).toContain("not found");
	});
});
