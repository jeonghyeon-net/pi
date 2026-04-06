import { describe, it, expect } from "vitest";
import { collectOutput } from "../src/runner.js";

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
