import { describe, it, expect } from "vitest";
import { parseLine } from "../src/parser.js";

describe("parseLine", () => {
	it("parses message_end with assistant role", () => {
		const event = parseLine(JSON.stringify({
			type: "message_end",
			message: { role: "assistant", content: [{ type: "text", text: "Hello" }], usage: { inputTokens: 10, outputTokens: 5 } },
		}));
		expect(event?.type).toBe("message");
		expect(event?.text).toBe("Hello");
		expect(event?.usage?.inputTokens).toBe(10);
	});

	it("ignores non-assistant message_end", () => {
		const event = parseLine(JSON.stringify({
			type: "message_end",
			message: { role: "user", content: [{ type: "text", text: "Hi" }] },
		}));
		expect(event).toBeNull();
	});

	it("parses tool_execution_start", () => {
		const event = parseLine(JSON.stringify({ type: "tool_execution_start", toolName: "read", args: { path: "/test" } }));
		expect(event?.type).toBe("tool_start");
		expect(event?.toolName).toBe("read");
	});

	it("parses tool_execution_end", () => {
		const event = parseLine(JSON.stringify({ type: "tool_execution_end", toolName: "read" }));
		expect(event?.type).toBe("tool_end");
	});

	it("parses agent_end", () => {
		const event = parseLine(JSON.stringify({ type: "agent_end", messages: [] }));
		expect(event?.type).toBe("agent_end");
	});

	it("returns null for unknown event", () => {
		expect(parseLine(JSON.stringify({ type: "turn_start" }))).toBeNull();
	});

	it("returns null for invalid JSON", () => {
		expect(parseLine("not json")).toBeNull();
	});

	it("returns null for empty line", () => {
		expect(parseLine("")).toBeNull();
	});

	it("handles message_end with no content", () => {
		const event = parseLine(JSON.stringify({
			type: "message_end",
			message: { role: "assistant", usage: { inputTokens: 5, outputTokens: 3 } },
		}));
		expect(event?.type).toBe("message");
		expect(event?.text).toBe("");
	});

	it("handles message_end with no usage", () => {
		const event = parseLine(JSON.stringify({
			type: "message_end",
			message: { role: "assistant", content: [{ type: "text", text: "hi" }] },
		}));
		expect(event?.type).toBe("message");
		expect(event?.usage).toBeUndefined();
	});

	it("handles message_end with partial usage", () => {
		const event = parseLine(JSON.stringify({
			type: "message_end",
			message: { role: "assistant", content: [{ type: "text", text: "hi" }], usage: {} },
		}));
		expect(event?.usage?.inputTokens).toBe(0);
		expect(event?.usage?.outputTokens).toBe(0);
	});

	it("handles message_end without message", () => {
		const event = parseLine(JSON.stringify({ type: "message_end" }));
		expect(event).toBeNull();
	});
});
