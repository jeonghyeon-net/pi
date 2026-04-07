import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetStore, addRun } from "../src/store.js";
import { resetSession, addToHistory } from "../src/session.js";

const agentMd = "---\nname: scout\ndescription: find code\n---\nYou find code.";
vi.mock("fs", async (orig) => {
	const a = await orig<typeof import("fs")>();
	return {
		...a,
		writeFileSync: vi.fn(),
		existsSync: vi.fn((p: string) => String(p).includes("agents")),
		mkdirSync: vi.fn(),
		readdirSync: vi.fn(() => ["scout.md"]),
		readFileSync: vi.fn(() => agentMd),
	};
});
vi.mock("../src/spawn.js", () => ({
	spawnAndCollect: vi.fn().mockResolvedValue({ id: 1, agent: "scout", output: "found", usage: { inputTokens: 10, outputTokens: 5, turns: 1 } }),
}));

import { createTool } from "../src/tool.js";

const stubPi = () => ({ appendEntry: vi.fn() });
const stubCtx = () => ({ hasUI: false, ui: { setWidget: vi.fn() }, sessionManager: { getBranch: (): unknown[] => [] } });
const exec = async (cmd: string) => createTool(stubPi(), "/agents").execute("", { command: cmd }, undefined, undefined, stubCtx());

describe("tool extra coverage", () => {
	beforeEach(() => { vi.clearAllMocks(); resetStore(); resetSession(); });

	it("includes task snippets in active and history runs", async () => {
		addRun({ id: 1, agent: "scout", task: "find auth code in the repo", startedAt: Date.now(), abort: () => {} });
		addToHistory({ id: 2, agent: "scout", task: "review patch", error: "boom" });
		const r = await exec("runs");
		expect(r.content[0].text).toContain("find auth code in the repo");
		expect(r.content[0].text).toContain("review patch");
		expect(r.content[0].text).toContain("[error]");
	});

	it("renders detailed history with task, session, error, and event variants", async () => {
		addToHistory({
			id: 7,
			agent: "scout",
			task: "investigate",
			sessionFile: "/tmp/subagent.json",
			error: "failed",
			output: "final output",
			events: [
				{ type: "tool_start", toolName: "Bash", text: "git status" },
				{ type: "tool_update", toolName: "Bash", text: "partial" },
				{ type: "tool_update", text: "orphan" },
				{ type: "tool_end", toolName: "Bash", text: "done", isError: true },
				{ type: "tool_end", isError: false },
				{ type: "message_delta", text: "draft" },
				{ type: "message", text: "final message" },
				{ type: "agent_end", stopReason: "error" },
				{ type: "noop" },
			],
		});
		const r = await exec("detail 7");
		expect(r.content[0].text).toContain("task: investigate");
		expect(r.content[0].text).toContain("session: /tmp/subagent.json");
		expect(r.content[0].text).toContain("status: error — failed");
		expect(r.content[0].text).toContain("↳ Bash: partial");
		expect(r.content[0].text).toContain("✗ Bash: done");
		expect(r.content[0].text).toContain("✓ tool");
		expect(r.content[0].text).toContain("… draft");
		expect(r.content[0].text).toContain("done: error");
		expect(r.content[0].text).toContain("output:\nfinal output");
	});
});
