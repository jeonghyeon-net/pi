import { describe, it, expect } from "vitest";
import { buildArgs, getPiCommand } from "../src/runner.js";

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

	it("includes --thinking when provided", () => {
		const args = buildArgs({
			base: [],
			model: "gpt-5.4",
			thinking: "xhigh",
			tools: ["read"],
			systemPromptPath: "/tmp/p.md",
			task: "t",
		});
		expect(args).toContain("--thinking");
		expect(args).toContain("xhigh");
	});

	it("omits model, thinking, and tools when undefined", () => {
		const args = buildArgs({
			base: [],
			model: undefined,
			thinking: undefined,
			tools: undefined,
			systemPromptPath: "/tmp/p.md",
			task: "t",
		});
		expect(args).not.toContain("--model");
		expect(args).not.toContain("--thinking");
		expect(args).not.toContain("--tools");
	});
});
