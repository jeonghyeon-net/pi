import { describe, it, expect } from "vitest";
import { parseLine } from "../src/parser.js";

describe("parseLine extra assistant events", () => {
	it("parses message_update text deltas", () => {
		const event = parseLine(JSON.stringify({ type: "message_update", message: { role: "assistant" }, assistantMessageEvent: { type: "text_delta", delta: "Hel" } }));
		expect(event).toEqual({ type: "message_delta", text: "Hel" });
	});

	it("parses done reasons and message stopReason fallback", () => {
		expect(parseLine(JSON.stringify({ type: "message_update", message: { role: "assistant", stopReason: "stop" }, assistantMessageEvent: { type: "done", reason: "toolUse" } }))).toEqual({ type: "agent_end", stopReason: "toolUse" });
		expect(parseLine(JSON.stringify({ type: "message_update", message: { role: "assistant", stopReason: "stop" }, assistantMessageEvent: { type: "done" } }))).toEqual({ type: "agent_end", stopReason: "stop" });
	});

	it("parses error object and string payloads", () => {
		expect(parseLine(JSON.stringify({ type: "message_update", message: { role: "assistant" }, assistantMessageEvent: { type: "error", reason: "error", error: { message: "boom" } } }))).toEqual({ type: "agent_end", stopReason: "error", text: "boom", isError: true });
		expect(parseLine(JSON.stringify({ type: "message_update", message: { role: "assistant" }, assistantMessageEvent: { type: "error", error: "boom" } }))).toEqual({ type: "agent_end", stopReason: "error", text: "boom", isError: true });
	});

	it("returns null for unsupported or non-assistant message updates", () => {
		expect(parseLine(JSON.stringify({ type: "message_update", message: { role: "assistant" }, assistantMessageEvent: {} }))).toBeNull();
		expect(parseLine(JSON.stringify({ type: "message_update", message: { role: "assistant" }, assistantMessageEvent: { type: "text_start" } }))).toBeNull();
		expect(parseLine(JSON.stringify({ type: "message_update", message: { role: "user" }, assistantMessageEvent: { type: "text_delta", delta: "x" } }))).toBeNull();
		expect(parseLine(JSON.stringify({ type: "message_update", message: "bad", assistantMessageEvent: { type: "text_delta", delta: "x" } }))).toBeNull();
		expect(parseLine(JSON.stringify({ type: "message_update", message: { role: "assistant" }, assistantMessageEvent: "bad" }))).toBeNull();
	});
});
