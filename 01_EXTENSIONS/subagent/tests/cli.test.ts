import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/cli.js";

describe("parseCommand basics", () => {
	it("parses run command", () => {
		expect(parseCommand("run scout -- find auth code")).toEqual({ type: "run", agent: "scout", task: "find auth code", main: false, cwd: undefined });
	});

	it("parses run with --main and --cwd", () => {
		expect(parseCommand("run worker --main -- implement login")).toEqual({ type: "run", agent: "worker", task: "implement login", main: true, cwd: undefined });
		expect(parseCommand("run worker --cwd /workspace/cwd -- task")).toEqual({ type: "run", agent: "worker", task: "task", main: false, cwd: "/workspace/cwd" });
	});

	it("parses batch and chain", () => {
		expect(parseCommand("batch --agent worker --task taskA --agent reviewer --task taskB")).toEqual({ type: "batch", items: [{ agent: "worker", task: "taskA" }, { agent: "reviewer", task: "taskB" }], main: false });
		expect(parseCommand("chain --agent scout --task find --agent worker --task impl")).toEqual({ type: "chain", steps: [{ agent: "scout", task: "find" }, { agent: "worker", task: "impl" }], main: false });
	});

	it("parses continue, detail, runs, and abort", () => {
		expect(parseCommand("continue 3 -- add error handling")).toEqual({ type: "continue", id: 3, task: "add error handling" });
		expect(parseCommand("detail 5")).toEqual({ type: "detail", id: 5 });
		expect(parseCommand("runs")).toEqual({ type: "runs" });
		expect(parseCommand("abort 7")).toEqual({ type: "abort", id: 7 });
	});

	it("handles empty or partial commands", () => {
		expect(() => parseCommand("unknown")).toThrow("Unknown subcommand");
		expect(() => parseCommand("")).toThrow("Unknown subcommand");
		expect(() => parseCommand("--flag")).toThrow("Unknown subcommand");
		expect(parseCommand("run -- task")).toEqual({ type: "run", agent: "", task: "task", main: false, cwd: undefined });
	});
});
