import { describe, it, expect } from "vitest";
import { parseLine } from "../src/parser.js";

describe("parseLine extra tool and agent events", () => {
	it("parses tool execution variants", () => {
		expect(parseLine(JSON.stringify({ type: "tool_execution_start", toolName: "bash", args: "echo hi" }))).toEqual({ type: "tool_start", toolName: "bash", text: "echo hi" });
		expect(parseLine(JSON.stringify({ type: "tool_execution_start", args: "echo hi" }))).toEqual({ type: "tool_start", toolName: undefined, text: "echo hi" });
		expect(parseLine(JSON.stringify({ type: "tool_execution_start", toolName: "x", args: { other: true } }))?.text).toContain("other");
		expect(parseLine(JSON.stringify({ type: "tool_execution_update", toolName: "bash", partialResult: { content: [{ type: "text", text: "partial output" }] } }))).toEqual({ type: "tool_update", toolName: "bash", text: "partial output" });
		expect(parseLine(JSON.stringify({ type: "tool_execution_update", toolName: "bash", partialResult: "raw output" }))).toEqual({ type: "tool_update", toolName: "bash", text: "raw output" });
		expect(parseLine(JSON.stringify({ type: "tool_execution_update", toolName: "bash", partialResult: { details: {} } }))).toEqual({ type: "tool_update", toolName: "bash", text: "" });
		expect(parseLine(JSON.stringify({ type: "tool_execution_end", toolName: "read", isError: true, result: { content: [{ type: "text", text: "missing" }] } }))).toEqual({ type: "tool_end", toolName: "read", text: "missing", isError: true });
	});

	it("parses agent_end fallback messages", () => {
		expect(parseLine(JSON.stringify({ type: "agent_end", messages: [{ role: "assistant", content: [{ type: "text", text: "final" }], stopReason: "stop", usage: { inputTokens: 1, outputTokens: 2 } }] }))).toEqual({ type: "agent_end", text: "final", usage: { inputTokens: 1, outputTokens: 2, turns: 1 }, stopReason: "stop" });
		expect(parseLine(JSON.stringify({ type: "agent_end", messages: [{ role: "user", content: [] }] }))).toEqual({ type: "agent_end", text: "", usage: undefined, stopReason: undefined });
		expect(parseLine(JSON.stringify({ type: "agent_end" }))).toEqual({ type: "agent_end", text: "", usage: undefined, stopReason: undefined });
		expect(parseLine(JSON.stringify({ type: 42 }))).toBeNull();
	});
});
