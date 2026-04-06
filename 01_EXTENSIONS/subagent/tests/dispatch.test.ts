import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentConfig, RunResult, SubagentPi } from "../src/types.js";
import { resetStore } from "../src/store.js";
import { resetSession } from "../src/session.js";
vi.mock("fs", async (orig) => {
	const a = await orig<typeof import("fs")>();
	return { ...a, writeFileSync: vi.fn(), existsSync: vi.fn(() => true), mkdirSync: vi.fn() };
});
vi.mock("../src/spawn.js", () => ({ spawnAndCollect: vi.fn() }));
import { dispatchRun, dispatchBatch, dispatchChain } from "../src/dispatch.js";
import { spawnAndCollect } from "../src/spawn.js";
const agent: AgentConfig = { name: "scout", description: "", systemPrompt: "find", filePath: "/a.md" };
const ok: RunResult = { id: 1, agent: "scout", output: "found", usage: { inputTokens: 10, outputTokens: 5, turns: 1 } };
const mock = () => (spawnAndCollect as ReturnType<typeof vi.fn>);
const stubPi = (): SubagentPi => ({ sendMessage: vi.fn(), appendEntry: vi.fn() });
const stubCtx = () => ({ hasUI: false, ui: { setWidget: vi.fn() }, sessionManager: { getBranch: () => [] } });
const wait = (ms = 50) => new Promise((r) => setTimeout(r, ms));
describe("dispatchRun", () => {
	beforeEach(() => { vi.clearAllMocks(); resetStore(); resetSession(); });
	it("returns started message", () => {
		mock().mockResolvedValue(ok);
		const { text } = dispatchRun(agent, "find", stubPi(), stubCtx(), false);
		expect(text).toContain("scout");
	});
	it("sends followUp on success", async () => {
		mock().mockResolvedValue(ok);
		const pi = stubPi();
		dispatchRun(agent, "find", pi, stubCtx(), false);
		await wait();
		expect(pi.sendMessage).toHaveBeenCalled();
	});
	it("sends error followUp on failure", async () => {
		mock().mockRejectedValue(new Error("crash"));
		const pi = stubPi();
		dispatchRun(agent, "find", pi, stubCtx(), false);
		await wait();
		expect((pi.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0].content).toContain("error");
	});
});
describe("dispatchBatch + dispatchChain", () => {
	beforeEach(() => { vi.clearAllMocks(); resetStore(); resetSession(); });
	it("batch returns started", () => {
		mock().mockResolvedValue(ok);
		expect(dispatchBatch([{ agent: "scout", task: "a" }], [agent], stubPi(), stubCtx(), false)).toContain("batch");
	});
	it("batch sends results", async () => {
		mock().mockResolvedValue(ok);
		const pi = stubPi();
		dispatchBatch([{ agent: "scout", task: "a" }], [agent], pi, stubCtx(), false);
		await wait();
		expect(pi.sendMessage).toHaveBeenCalled();
	});
	it("chain returns started", () => {
		mock().mockResolvedValue(ok);
		expect(dispatchChain([{ agent: "scout", task: "a" }], [agent], stubPi(), stubCtx(), false)).toContain("chain");
	});
	it("chain sends result", async () => {
		mock().mockResolvedValue(ok);
		const pi = stubPi();
		dispatchChain([{ agent: "scout", task: "a" }], [agent], pi, stubCtx(), false);
		await wait(); expect(pi.sendMessage).toHaveBeenCalled();
	});
});
