import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentConfig, RunResult } from "../src/types.js";
import { resetStore, listRuns } from "../src/store.js";
import { resetSession, getRunHistory } from "../src/session.js";
vi.mock("fs", async (orig) => {
	const a = await orig<typeof import("fs")>();
	return { ...a, writeFileSync: vi.fn(), existsSync: vi.fn(() => true), mkdirSync: vi.fn() };
});
vi.mock("../src/spawn.js", () => ({ spawnAndCollect: vi.fn() }));
import { createRunner, createSessionRunner } from "../src/run-factory.js";
import { spawnAndCollect } from "../src/spawn.js";
const agent: AgentConfig = { name: "scout", description: "", systemPrompt: "find", filePath: "/a.md" };
const ok: RunResult = { id: 1, agent: "scout", output: "found", usage: { inputTokens: 10, outputTokens: 5, turns: 1 } };
const mock = () => (spawnAndCollect as ReturnType<typeof vi.fn>);
const ctx = () => ({ hasUI: false, ui: { setWidget: vi.fn() }, sessionManager: { getBranch: () => [] } });
const wait = (ms = 10) => new Promise((r) => setTimeout(r, ms));
describe("createRunner", () => {
	beforeEach(() => { vi.clearAllMocks(); resetStore(); resetSession(); });
	it("returns a function", () => { expect(typeof createRunner(false, ctx())).toBe("function"); });
	it("adds run with callable abort", async () => {
		mock().mockImplementation(() => new Promise(() => {}));
		createRunner(false, ctx())(agent, "task");
		await wait();
		expect(listRuns()).toHaveLength(1);
		expect(() => listRuns()[0].abort()).not.toThrow();
	});
	it("calls spawnAndCollect and returns result", async () => {
		mock().mockResolvedValue(ok);
		expect((await createRunner(false, ctx())(agent, "find")).output).toBe("found");
	});
	it("passes signal to spawnAndCollect", async () => {
		mock().mockResolvedValue(ok);
		await createRunner(false, ctx())(agent, "find");
		expect(mock().mock.calls[0][4] instanceof AbortSignal).toBe(true);
	});
	it("injects main context when main=true", async () => {
		mock().mockResolvedValue(ok);
		const c = ctx();
		c.sessionManager.getBranch = () => [{ type: "message", message: { role: "user", content: [{ type: "text", text: "hello" }] } }];
		await createRunner(true, c)(agent, "find");
		const { writeFileSync } = await import("fs");
		expect((writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1]).toContain("[Main Context]");
	});
	it("creates session dir when missing", async () => {
		const fs = await import("fs");
		(fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => !String(p).includes("sessions"));
		mock().mockResolvedValue(ok);
		await createRunner(false, ctx())(agent, "task");
		expect(fs.mkdirSync).toHaveBeenCalled();
	});
	it("removes run from store on failure", async () => {
		mock().mockRejectedValue(new Error("ENOENT"));
		await expect(createRunner(false, ctx())(agent, "fail")).rejects.toThrow();
		expect(listRuns()).toHaveLength(0);
	});
});
describe("createSessionRunner", () => {
	beforeEach(() => { vi.clearAllMocks(); resetStore(); resetSession(); });
	it("returns a function", () => { expect(typeof createSessionRunner("/tmp/s.json", ctx())).toBe("function"); });
	it("uses existing session file and strips system prompt", async () => {
		mock().mockResolvedValue(ok);
		await createSessionRunner("/tmp/sess.json", ctx())(agent, "continue task");
		const args = mock().mock.calls[0][1] as string[];
		expect(args).toContain("--session");
		expect(args).toContain("/tmp/sess.json");
		expect(args).not.toContain("--append-system-prompt");
	});
	it("passes signal to spawnAndCollect", async () => {
		mock().mockResolvedValue(ok);
		await createSessionRunner("/tmp/s.json", ctx())(agent, "task");
		expect(mock().mock.calls[0][4] instanceof AbortSignal).toBe(true);
	});
	it("adds and removes run", async () => {
		mock().mockResolvedValue(ok);
		await createSessionRunner("/tmp/s.json", ctx())(agent, "task");
		expect(listRuns()).toHaveLength(0);
	});
	it("removes run on failure", async () => {
		mock().mockRejectedValue(new Error("fail"));
		await expect(createSessionRunner("/tmp/s.json", ctx())(agent, "t")).rejects.toThrow();
		expect(listRuns()).toHaveLength(0);
	});
	it("adds to history on success", async () => {
		mock().mockResolvedValue(ok);
		await createSessionRunner("/tmp/sess.json", ctx())(agent, "task");
		const hist = getRunHistory();
		expect(hist.length).toBeGreaterThan(0);
		expect(hist[hist.length - 1].sessionFile).toBe("/tmp/sess.json");
	});
	it("abort callback works", async () => {
		mock().mockImplementation(() => new Promise(() => {}));
		createSessionRunner("/tmp/s.json", ctx())(agent, "task");
		await wait();
		expect(listRuns()).toHaveLength(1);
		expect(() => listRuns()[0].abort()).not.toThrow();
	});
});
