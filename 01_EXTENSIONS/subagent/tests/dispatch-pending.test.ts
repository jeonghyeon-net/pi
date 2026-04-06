import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentConfig, RunResult, SubagentPi } from "../src/types.js";
import { resetStore } from "../src/store.js";
import { resetSession, drainPending } from "../src/session.js";
vi.mock("fs", async (orig) => {
	const a = await orig<typeof import("fs")>();
	return { ...a, writeFileSync: vi.fn(), existsSync: vi.fn(() => true), mkdirSync: vi.fn() };
});
vi.mock("../src/spawn.js", () => ({ spawnAndCollect: vi.fn() }));
import { dispatchRun, onSessionRestore } from "../src/dispatch.js";
import { spawnAndCollect } from "../src/spawn.js";
const agent: AgentConfig = { name: "scout", description: "", systemPrompt: "find", filePath: "/a.md" };
const ok: RunResult = { id: 1, agent: "scout", output: "found", usage: { inputTokens: 10, outputTokens: 5, turns: 1 } };
const mock = () => (spawnAndCollect as ReturnType<typeof vi.fn>);
const stubPi = (): SubagentPi => ({ sendMessage: vi.fn(), appendEntry: vi.fn() });
const stubCtx = () => ({ hasUI: false, ui: { setWidget: vi.fn() }, sessionManager: { getBranch: () => [] } });
const wait = (ms = 50) => new Promise((r) => setTimeout(r, ms));

describe("sendFollowUp catch → addPending", () => {
	beforeEach(() => { vi.clearAllMocks(); resetStore(); resetSession(); });
	it("adds to pending when sendMessage throws", async () => {
		mock().mockResolvedValue(ok);
		const pi = stubPi();
		(pi.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error("session gone"); });
		dispatchRun(agent, "find", pi, stubCtx(), false);
		await wait();
		const pending = drainPending();
		expect(pending).toHaveLength(1);
		expect(pending[0].agent).toBe("scout");
	});
});

describe("onSessionRestore", () => {
	beforeEach(() => { vi.clearAllMocks(); resetStore(); resetSession(); });
	it("returns a handler function", () => {
		expect(typeof onSessionRestore(stubPi())).toBe("function");
	});
	it("restores runs and syncs widget", async () => {
		const pi = stubPi();
		const ctx = { hasUI: true, ui: { setWidget: vi.fn() }, sessionManager: { getBranch: () => [] } };
		const handler = onSessionRestore(pi);
		await handler(undefined, ctx);
		expect(ctx.ui.setWidget).toHaveBeenCalledWith("subagent-status", undefined);
	});
	it("delivers pending results", async () => {
		const pi = stubPi();
		const pend = [{ id: 5, agent: "w", output: "done", usage: { inputTokens: 0, outputTokens: 0, turns: 0 } }];
		const branch = [{ type: "custom", customType: "subagent-runs", data: { runs: [], pending: pend, updatedAt: 0 } }];
		await onSessionRestore(pi)(undefined, { ...stubCtx(), sessionManager: { getBranch: () => branch } });
		expect(pi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({ customType: "subagent-pending" }),
			expect.objectContaining({ deliverAs: "followUp" }),
		);
	});
	it("drains pending after delivery", async () => {
		const pend = [{ id: 6, agent: "a", output: "x", usage: { inputTokens: 0, outputTokens: 0, turns: 0 } }];
		const branch = [{ type: "custom", customType: "subagent-runs", data: { runs: [], pending: pend, updatedAt: 0 } }];
		await onSessionRestore(stubPi())(undefined, { ...stubCtx(), sessionManager: { getBranch: () => branch } });
		expect(drainPending()).toHaveLength(0);
	});
	it("does not call sendMessage when no pending", async () => {
		const pi = stubPi();
		await onSessionRestore(pi)(undefined, stubCtx());
		expect(pi.sendMessage).not.toHaveBeenCalled();
	});
});
