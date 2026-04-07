import type { AssistantMessage } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { sanitizeEvent, sanitizeMessage, sanitizeText, sanitizeValue } from "../src/sanitize.js";

describe("sanitizeText", () => {
	it("removes control, bidi and variation characters while keeping emoji", () => {
		expect(sanitizeText("A\u0007B\u200D\u202EC\uFE0FD😀E")).toBe("ABCD😀E");
	});

	it("normalizes unicode line separators to newlines", () => {
		expect(sanitizeText("a\u2028b\u2029c")).toBe("a\nb\nc");
	});
});

describe("sanitizeValue", () => {
	it("sanitizes nested arrays and objects in place", () => {
		const input = { title: "hi😀", parts: ["A\u200FB", { note: "C\u0007D" }], count: 1 };
		expect(sanitizeValue(input)).toBe(input);
		expect(input).toEqual({ title: "hi😀", parts: ["AB", { note: "CD" }], count: 1 });
	});
});

describe("sanitizeMessage", () => {
	it("sanitizes text, thinking, tool arguments and error messages", () => {
		const message = { role: "assistant", content: [{ type: "text", text: "A😀" }, { type: "thinking", thinking: "B\u200F" }, { type: "toolCall", id: "1", name: "x", arguments: { note: "C\u0007" } }], errorMessage: "D😀" } as AssistantMessage;
		sanitizeMessage(message);
		expect(message.content).toEqual([{ type: "text", text: "A😀" }, { type: "thinking", thinking: "B" }, { type: "toolCall", id: "1", name: "x", arguments: { note: "C" } }]);
		expect(message.errorMessage).toBe("D😀");
	});
});

describe("sanitizeEvent", () => {
	it("sanitizes deltas, content and embedded messages", () => {
		const partial = { role: "assistant", content: [{ type: "text", text: "E😀" }] } as AssistantMessage;
		const event = { type: "text_end", contentIndex: 0, content: "A😀", partial } as const;
		sanitizeEvent(event);
		expect(event.content).toBe("A😀");
		expect(partial.content).toEqual([{ type: "text", text: "E😀" }]);
	});

	it("sanitizes tool call arguments on toolcall_end events", () => {
		const event = { type: "toolcall_end", contentIndex: 0, toolCall: { type: "toolCall", id: "1", name: "x", arguments: { note: "Z😀\u0007" } }, partial: { role: "assistant", content: [] } } as const;
		sanitizeEvent(event);
		expect(event.toolCall.arguments).toEqual({ note: "Z😀" });
	});
});
