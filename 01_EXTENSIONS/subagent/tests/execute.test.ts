import { describe, it, expect, vi } from "vitest";
import { executeSingle, executeBatch, executeChain } from "../src/execute.js";
import type { RunResult, AgentConfig } from "../src/types.js";

const agent: AgentConfig = { name: "scout", description: "", model: "gpt-5.4-mini", systemPrompt: "find code", filePath: "/agents/scout.md" };
const worker: AgentConfig = { name: "worker", description: "", systemPrompt: "work", filePath: "/agents/worker.md" };
const ok: RunResult = { id: 1, agent: "scout", output: "found auth.ts", usage: { inputTokens: 100, outputTokens: 50, turns: 2 } };

describe("executeSingle", () => {
	it("runs agent and returns result", async () => {
		const runner = vi.fn().mockResolvedValue(ok);
		const result = await executeSingle(agent, "find auth", { runner });
		expect(runner).toHaveBeenCalledOnce();
		expect(result.output).toBe("found auth.ts");
	});
});

describe("executeBatch", () => {
	it("runs items in parallel", async () => {
		const runner = vi.fn().mockResolvedValue(ok);
		const items = [{ agent: "scout", task: "A" }, { agent: "scout", task: "B" }];
		const results = await executeBatch(items, [agent], { runner, concurrency: 2 });
		expect(results).toHaveLength(2);
		expect(runner).toHaveBeenCalledTimes(2);
	});

	it("handles partial failures", async () => {
		const runner = vi.fn()
			.mockResolvedValueOnce(ok)
			.mockRejectedValueOnce(new Error("fail"));
		const items = [{ agent: "scout", task: "A" }, { agent: "scout", task: "B" }];
		const results = await executeBatch(items, [agent], { runner, concurrency: 2 });
		expect(results[0].output).toBe("found auth.ts");
		expect(results[1].error).toBe("fail");
	});

	it("errors on unknown agent", async () => {
		const runner = vi.fn();
		const results = await executeBatch([{ agent: "nope", task: "x" }], [agent], { runner });
		expect(results[0].error).toContain("Unknown agent");
		expect(runner).not.toHaveBeenCalled();
	});
});

describe("executeChain", () => {
	it("passes previous output to next step", async () => {
		const runner = vi.fn()
			.mockResolvedValueOnce({ ...ok, output: "step1 result" })
			.mockResolvedValueOnce({ ...ok, output: "step2 done" });
		const steps = [{ agent: "scout", task: "find" }, { agent: "worker", task: "implement {previous}" }];
		const result = await executeChain(steps, [agent, worker], { runner });
		expect(runner).toHaveBeenCalledTimes(2);
		expect(runner.mock.calls[1][1]).toContain("step1 result");
		expect(result.output).toBe("step2 done");
	});

	it("stops on escalation", async () => {
		const escalated: RunResult = { ...ok, escalation: "what to do?" };
		const runner = vi.fn().mockResolvedValue(escalated);
		const steps = [{ agent: "scout", task: "find" }, { agent: "worker", task: "impl" }];
		const result = await executeChain(steps, [agent, worker], { runner });
		expect(runner).toHaveBeenCalledTimes(1);
		expect(result.escalation).toBe("what to do?");
	});

	it("stops on error", async () => {
		const errored: RunResult = { ...ok, error: "crashed" };
		const runner = vi.fn().mockResolvedValue(errored);
		const result = await executeChain([{ agent: "scout", task: "t" }], [agent], { runner });
		expect(result.error).toBe("crashed");
	});

	it("errors on unknown agent in chain", async () => {
		const runner = vi.fn();
		const result = await executeChain([{ agent: "nope", task: "t" }], [agent], { runner });
		expect(result.error).toContain("Unknown agent");
	});
});
