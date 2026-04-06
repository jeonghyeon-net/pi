import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentConfig, RunResult, SubagentPi } from "../src/types.js";
import { resetStore } from "../src/store.js";
import { resetSession } from "../src/session.js";
vi.mock("fs", async (orig) => {
	const a = await orig<typeof import("fs")>();
	return { ...a, writeFileSync: vi.fn(), existsSync: vi.fn(() => true), mkdirSync: vi.fn() };
});
vi.mock("../src/spawn.js", () => ({ spawnAndCollect: vi.fn() }));
import { createRunner, dispatchRun, dispatchBatch, dispatchChain } from "../src/dispatch.js";
import { spawnAndCollect } from "../src/spawn.js";
const agent: AgentConfig = { name: "scout", description: "", systemPrompt: "find", filePath: "/a.md" };
const ok: RunResult = { id: 1, agent: "scout", output: "found", usage: { inputTokens: 10, outputTokens: 5, turns: 1 } };
const mock = () => (spawnAndCollect as ReturnType<typeof vi.fn>);
const stubPi = (): SubagentPi => ({ sendMessage: vi.fn(), appendEntry: vi.fn() });
const stubCtx = () => ({ hasUI: false, ui: { setWidget: vi.fn() }, sessionManager: { getBranch: () => [] } });
const wait = (ms = 50) => new Promise((r) => setTimeout(r, ms));
describe("createRunner", () => {
	beforeEach(() => { vi.clearAllMocks(); resetStore(); resetSession(); });
	it("returns a function", () => { expect(typeof createRunner(false, stubCtx())).toBe("function"); });
	it("adds run with callable abort", async () => {
		mock().mockImplementation(() => new Promise(() => {}));
		createRunner(false, stubCtx())(agent, "task");
		await wait(10);
		const { listRuns } = await import("../src/store.js");
		expect(listRuns()).toHaveLength(1);
		expect(() => listRuns()[0].abort()).not.toThrow();
	});
	it("calls spawnAndCollect and returns result", async () => {
		mock().mockResolvedValue(ok);
		expect((await createRunner(false, stubCtx())(agent, "find")).output).toBe("found");
	});
	it("injects main context when main=true", async () => {
		mock().mockResolvedValue(ok);
		const ctx = stubCtx();
		ctx.sessionManager.getBranch = () => [{ type: "message", message: { role: "user", content: [{ type: "text", text: "hello" }] } }];
		await createRunner(true, ctx)(agent, "find");
		const { writeFileSync } = await import("fs");
		expect((writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1]).toContain("[Main Context]");
	});
	it("creates session dir when missing", async () => {
		const fs = await import("fs");
		(fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => !String(p).includes("sessions"));
		mock().mockResolvedValue(ok);
		await createRunner(false, stubCtx())(agent, "task");
		expect(fs.mkdirSync).toHaveBeenCalled();
	});
	it("removes run from store on failure", async () => {
		mock().mockRejectedValue(new Error("ENOENT"));
		await expect(createRunner(false, stubCtx())(agent, "fail")).rejects.toThrow();
		expect((await import("../src/store.js")).listRuns()).toHaveLength(0);
	});
});
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
