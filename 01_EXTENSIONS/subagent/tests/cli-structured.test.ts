import { describe, expect, it } from "vitest";
import { parseCommand, stringifyCommand, subcommandToToolCall } from "../src/cli.js";

describe("structured cli helpers", () => {
	it("maps parsed commands to dedicated tool calls", () => {
		expect(subcommandToToolCall(parseCommand("run worker --main -- implement fix"))).toEqual({ toolName: "subagent_run", input: { agent: "worker", task: "implement fix", main: true } });
		expect(subcommandToToolCall(parseCommand("run worker -- implement fix"))).toEqual({ toolName: "subagent_run", input: { agent: "worker", task: "implement fix" } });
		expect(subcommandToToolCall(parseCommand("run worker --cwd /workspace/cwd -- implement fix"))).toEqual({ toolName: "subagent_run", input: { agent: "worker", task: "implement fix", cwd: "/workspace/cwd" } });
		expect(subcommandToToolCall(parseCommand("batch --agent reviewer --task 'Review auth'"))).toEqual({ toolName: "subagent_batch", input: { items: [{ agent: "reviewer", task: "Review auth" }] } });
		expect(subcommandToToolCall(parseCommand("batch --main --agent reviewer --task 'Review auth'"))).toEqual({ toolName: "subagent_batch", input: { items: [{ agent: "reviewer", task: "Review auth" }], main: true } });
		expect(subcommandToToolCall(parseCommand("chain --agent scout --task find --agent worker --task '{previous}'"))).toEqual({ toolName: "subagent_chain", input: { steps: [{ agent: "scout", task: "find" }, { agent: "worker", task: "{previous}" }] } });
		expect(subcommandToToolCall(parseCommand("chain --main --agent scout --task find"))).toEqual({ toolName: "subagent_chain", input: { steps: [{ agent: "scout", task: "find" }], main: true } });
	});

	it("maps control commands to dedicated tool calls", () => {
		expect(subcommandToToolCall({ type: "continue", id: 3, task: "Need more context" })).toEqual({ toolName: "subagent_continue", input: { id: 3, task: "Need more context" } });
		expect(subcommandToToolCall({ type: "abort", id: 4 })).toEqual({ toolName: "subagent_abort", input: { id: 4 } });
		expect(subcommandToToolCall({ type: "detail", id: 5 })).toEqual({ toolName: "subagent_detail", input: { id: 5 } });
		expect(subcommandToToolCall({ type: "runs" })).toEqual({ toolName: "subagent_runs", input: {} });
	});

	it("stringifies structured commands", () => {
		expect(stringifyCommand({ type: "run", agent: "worker", task: "Implement fix", main: true, cwd: "/workspace/task-dir" })).toBe('run worker --main --cwd "/workspace/task-dir" -- Implement fix');
		expect(stringifyCommand({ type: "run", agent: "worker", task: "Implement fix", main: false })).toBe("run worker -- Implement fix");
		expect(stringifyCommand({ type: "batch", items: [{ agent: "reviewer", task: "Review auth changes" }], main: true })).toContain("--main");
		expect(stringifyCommand({ type: "batch", items: [{ agent: "reviewer", task: "Review auth changes" }], main: false })).toContain("Review auth changes");
		expect(stringifyCommand({ type: "chain", steps: [{ agent: "reviewer", task: "Review auth changes" }], main: true })).toContain("--main");
		expect(stringifyCommand({ type: "chain", steps: [{ agent: "reviewer", task: "Review auth changes" }], main: false })).toContain("Review auth changes");
		expect(stringifyCommand({ type: "continue", id: 3, task: "Need more context" })).toBe("continue 3 -- Need more context");
		expect(stringifyCommand({ type: "abort", id: 4 })).toBe("abort 4");
		expect(stringifyCommand({ type: "detail", id: 5 })).toBe("detail 5");
		expect(stringifyCommand({ type: "runs" })).toBe("runs");
	});
});
