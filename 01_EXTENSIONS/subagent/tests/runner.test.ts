import { describe, it, expect } from "vitest";
import { buildArgs, collectOutput, getPiCommand } from "../src/runner.js";

describe("getPiCommand", () => {
	it("uses process.execPath when argv1 exists", () => {
		const result = getPiCommand("/usr/bin/node", "/path/to/pi.js", (p) => p === "/path/to/pi.js");
		expect(result.cmd).toBe("/usr/bin/node");
		expect(result.base).toEqual(["/path/to/pi.js"]);
	});

	it("falls back to pi for generic runtime", () => {
		const result = getPiCommand("/usr/bin/node", "/nonexistent", () => false);
		expect(result.cmd).toBe("pi");
		expect(result.base).toEqual([]);
	});

	it("falls back when argv1 is empty", () => {
		const result = getPiCommand("/usr/bin/node", "", () => true);
		expect(result.cmd).toBe("pi");
	});
});

describe("buildArgs", () => {
	it("builds args for simple run", () => {
		const args = buildArgs({
			base: [],
			model: "gpt-5.4",
			tools: ["read", "grep"],
			systemPromptPath: "/tmp/prompt.md",
			task: "find auth",
			sessionPath: undefined,
		});
		expect(args).toContain("--mode");
		expect(args).toContain("json");
		expect(args).toContain("--no-session");
		expect(args).toContain("--model");
		expect(args).toContain("gpt-5.4");
		expect(args).toContain("--tools");
		expect(args).toContain("read,grep");
	});

	it("uses --session when sessionPath provided", () => {
		const args = buildArgs({
			base: [],
			model: undefined,
			tools: undefined,
			systemPromptPath: "/tmp/p.md",
			task: "t",
			sessionPath: "/tmp/s.json",
		});
		expect(args).toContain("--session");
		expect(args).not.toContain("--no-session");
	});

	it("omits model and tools when undefined", () => {
		const args = buildArgs({
			base: [],
			model: undefined,
			tools: undefined,
			systemPromptPath: "/tmp/p.md",
			task: "t",
		});
		expect(args).not.toContain("--model");
		expect(args).not.toContain("--tools");
	});
});

describe("collectOutput", () => {
	it("aggregates text from message events", () => {
		const result = collectOutput([
			{ type: "message", text: "Hello", usage: { inputTokens: 10, outputTokens: 5, turns: 1 } },
			{ type: "tool_start", toolName: "read" },
			{ type: "message", text: " World", usage: { inputTokens: 20, outputTokens: 10, turns: 1 } },
			{ type: "agent_end" },
		]);
		expect(result.output).toBe("Hello\n World");
		expect(result.usage.inputTokens).toBe(30);
		expect(result.usage.outputTokens).toBe(15);
		expect(result.usage.turns).toBe(2);
	});

	it("returns empty for no messages", () => {
		const result = collectOutput([{ type: "agent_end" }]);
		expect(result.output).toBe("");
		expect(result.usage.turns).toBe(0);
	});

	it("detects escalation marker", () => {
		const result = collectOutput([
			{ type: "message", text: "I need help [ESCALATION] should I delete this file?" },
		]);
		expect(result.escalation).toBe("should I delete this file?");
	});

	it("no escalation when marker absent", () => {
		const result = collectOutput([{ type: "message", text: "all good" }]);
		expect(result.escalation).toBeUndefined();
	});
});
