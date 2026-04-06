import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetStore, addRun } from "../src/store.js";
import { resetSession, addToHistory } from "../src/session.js";
const agentMd = "---\nname: scout\ndescription: find code\n---\nYou find code.";
vi.mock("fs", async (orig) => {
	const a = await orig<typeof import("fs")>();
	return { ...a, writeFileSync: vi.fn(), existsSync: vi.fn((p: string) => String(p).includes("agents")),
		mkdirSync: vi.fn(), readdirSync: vi.fn(() => ["scout.md"]), readFileSync: vi.fn(() => agentMd) };
});
vi.mock("../src/spawn.js", () => ({
	spawnAndCollect: vi.fn().mockResolvedValue({ id: 1, agent: "scout", output: "found", usage: { inputTokens: 10, outputTokens: 5, turns: 1 } }),
}));
import { createTool, errorMsg } from "../src/tool.js";
import type { SubagentPi } from "../src/types.js";
import { existsSync } from "fs";
const stubPi = (): SubagentPi => ({ sendMessage: vi.fn(), appendEntry: vi.fn() });
const stubCtx = () => ({ hasUI: false, ui: { setWidget: vi.fn() }, sessionManager: { getBranch: (): unknown[] => [] } });
const exec = async (cmd: string) => {
	const tool = createTool(stubPi(), "/agents");
	return tool.execute("", { command: cmd }, undefined, undefined, stubCtx());
};
describe("createTool", () => {
	beforeEach(() => { vi.clearAllMocks(); resetStore(); resetSession(); });
	it("has correct metadata", () => {
		const t = createTool(stubPi(), "/agents");
		expect(t.name).toBe("subagent");
		expect(t.label).toBe("Subagent");
		expect(t.parameters).toBeDefined();
		expect(t.description).toContain("subagent");
	});
	it("loads agents when dir exists", () => { expect(createTool(stubPi(), "/agents").name).toBe("subagent"); });
	it("works when agents dir missing", () => {
		(existsSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
		expect(createTool(stubPi(), "/no").name).toBe("subagent");
	});
	it("runs list with active runs", async () => {
		addRun({ id: 99, agent: "scout", startedAt: Date.now(), abort: () => {} });
		const r = await exec("runs");
		expect(r.content[0].text).toContain("Active (1)");
	});
	it("runs list when empty", async () => { expect((await exec("runs")).content[0].text).toBe("No runs"); });
	it("runs list with history", async () => {
		addToHistory({ id: 1, agent: "scout", output: "found" });
		expect((await exec("runs")).content[0].text).toContain("History (1)");
	});
	it("unknown subcommand errors", async () => { expect((await exec("invalid")).details.isError).toBe(true); });
	it("detail missing run", async () => { expect((await exec("detail 999")).content[0].text).toContain("not found"); });
	it("detail existing run", async () => {
		addToHistory({ id: 5, agent: "scout", output: "result text" });
		const r = await exec("detail 5");
		expect(r.content[0].text).toContain("# scout #5");
		expect(r.content[0].text).toContain("result text");
	});
	it("detail no output", async () => {
		addToHistory({ id: 6, agent: "scout" });
		expect((await exec("detail 6")).content[0].text).toContain("(no output)");
	});
	it("detail with events shows tool calls", async () => {
		addToHistory({ id: 7, agent: "scout", events: [{ type: "tool_start", toolName: "Bash" }, { type: "message", text: "found it" }] });
		const r = await exec("detail 7");
		expect(r.content[0].text).toContain("→ Bash");
		expect(r.content[0].text).toContain("found it");
	});
	it("run unknown agent", async () => { expect((await exec("run unknown -- task")).content[0].text).toContain("Unknown agent"); });
	it("run known agent", async () => {
		const r = await exec("run scout -- find auth");
		expect(r.content[0].text).toContain("scout");
		expect(r.content[0].text).toContain("started");
	});
	it("batch command", async () => { expect((await exec("batch --agent scout --task find")).content[0].text).toContain("batch started"); });
	it("chain command", async () => { expect((await exec("chain --agent scout --task find")).content[0].text).toContain("chain started"); });
	it("abort active run", async () => {
		addRun({ id: 10, agent: "scout", startedAt: Date.now(), abort: vi.fn() });
		const r = await exec("abort 10");
		expect(r.content[0].text).toContain("aborted");
	});
	it("abort missing run", async () => {
		const r = await exec("abort 999");
		expect(r.content[0].text).toContain("not found");
	});
	it("continue missing history", async () => {
		const r = await exec("continue 999 -- more");
		expect(r.content[0].text).toContain("not found");
	});
	it("continue existing run", async () => {
		addToHistory({ id: 1, agent: "scout", output: "ok", sessionFile: "/tmp/s.json" });
		const r = await exec("continue 1 -- more");
		expect(r.content[0].text).toContain("continue");
	});
	it("result includes details", async () => {
		const r = await exec("runs");
		expect(r.details).toBeDefined();
		expect(r.details.isError).toBe(false);
	});
});
describe("errorMsg", () => {
	it("extracts Error message", () => { expect(errorMsg(new Error("boom"))).toBe("boom"); });
	it("converts non-Error", () => { expect(errorMsg("oops")).toBe("oops"); expect(errorMsg(42)).toBe("42"); });
});
