import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentConfig, RunResult } from "../src/types.js";
import { resetStore } from "../src/store.js";
import { resetSession } from "../src/session.js";

vi.mock("fs", async (orig) => {
	const a = await orig<typeof import("fs")>();
	return { ...a, writeFileSync: vi.fn(), existsSync: vi.fn(() => true), mkdirSync: vi.fn() };
});
vi.mock("../src/spawn.js", () => ({ spawnAndCollect: vi.fn() }));

import { createRunner } from "../src/run-factory.js";
import { spawnAndCollect } from "../src/spawn.js";

const agent: AgentConfig = { name: "scout", description: "", systemPrompt: "find", filePath: "/a.md" };
const ok: RunResult = { id: 1, agent: "scout", output: "found", usage: { inputTokens: 10, outputTokens: 5, turns: 1 } };
const ctx = () => ({ hasUI: false, ui: { setWidget: vi.fn() }, sessionManager: { getBranch: () => [] } });

describe("createRunner empty main context", () => {
	beforeEach(() => { vi.clearAllMocks(); resetStore(); resetSession(); });
	it("keeps base prompt when main context is empty", async () => {
		(spawnAndCollect as ReturnType<typeof vi.fn>).mockResolvedValue(ok);
		await createRunner(true, ctx())(agent, "find");
		const { writeFileSync } = await import("fs");
		expect((writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe("find");
	});
});
