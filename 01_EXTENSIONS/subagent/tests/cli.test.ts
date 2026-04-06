import { describe, it, expect } from "vitest";
import { parseCommand } from "../src/cli.js";

describe("parseCommand", () => {
	it("parses run command", () => {
		const cmd = parseCommand("run scout -- find auth code");
		expect(cmd).toEqual({ type: "run", agent: "scout", task: "find auth code", main: false, cwd: undefined });
	});

	it("parses run with --main", () => {
		const cmd = parseCommand("run worker --main -- implement login");
		expect(cmd).toEqual({ type: "run", agent: "worker", task: "implement login", main: true, cwd: undefined });
	});

	it("parses run with --cwd", () => {
		const cmd = parseCommand("run worker --cwd /tmp -- task");
		expect(cmd.type === "run" && cmd.cwd).toBe("/tmp");
	});

	it("parses batch", () => {
		const cmd = parseCommand("batch --agent worker --task taskA --agent reviewer --task taskB");
		expect(cmd).toEqual({
			type: "batch",
			items: [{ agent: "worker", task: "taskA" }, { agent: "reviewer", task: "taskB" }],
			main: false,
		});
	});

	it("parses chain", () => {
		const cmd = parseCommand("chain --agent scout --task find --agent worker --task impl");
		expect(cmd).toEqual({
			type: "chain",
			steps: [{ agent: "scout", task: "find" }, { agent: "worker", task: "impl" }],
			main: false,
		});
	});

	it("parses continue", () => {
		const cmd = parseCommand("continue 3 -- add error handling");
		expect(cmd).toEqual({ type: "continue", id: 3, task: "add error handling" });
	});

	it("parses detail", () => {
		expect(parseCommand("detail 5")).toEqual({ type: "detail", id: 5 });
	});

	it("parses runs", () => {
		expect(parseCommand("runs")).toEqual({ type: "runs" });
	});

	it("throws on unknown subcommand", () => {
		expect(() => parseCommand("unknown")).toThrow("Unknown subcommand");
	});

	it("parses batch with --main", () => {
		const cmd = parseCommand("batch --main --agent w --task t");
		expect(cmd.type === "batch" && cmd.main).toBe(true);
	});

	it("batch with no agent/task flags yields empty items", () => {
		const cmd = parseCommand("batch --main");
		expect(cmd.type === "batch" && cmd.items).toEqual([]);
	});

	it("throws on empty command", () => {
		expect(() => parseCommand("--flag")).toThrow("Unknown subcommand");
	});

	it("run with no agent gives empty agent", () => {
		const cmd = parseCommand("run -- task");
		expect(cmd.type === "run" && cmd.agent).toBe("");
	});

	it("batch with more agents than tasks fills empty task", () => {
		const cmd = parseCommand("batch --agent a --agent b --task t1");
		if (cmd.type === "batch") {
			expect(cmd.items[1].task).toBe("");
		}
	});
});
