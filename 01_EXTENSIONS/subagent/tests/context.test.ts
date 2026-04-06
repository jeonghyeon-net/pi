import { describe, it, expect } from "vitest";
import { extractMainContext } from "../src/context.js";

describe("extractMainContext", () => {
	it("extracts recent messages", () => {
		const entries = [
			{ type: "message", message: { role: "user", content: [{ type: "text", text: "Hello" }] } },
			{
				type: "message",
				message: { role: "assistant", content: [{ type: "text", text: "Hi" }] },
			},
		];
		const ctx = extractMainContext(entries, 20);
		expect(ctx).toContain("Hello");
		expect(ctx).toContain("Hi");
	});

	it("limits to maxMessages", () => {
		const entries = Array.from({ length: 30 }, (_, i) => ({
			type: "message",
			message: { role: "user", content: [{ type: "text", text: `msg${i}` }] },
		}));
		const ctx = extractMainContext(entries, 5);
		expect(ctx).toContain("msg29");
		expect(ctx).not.toContain("msg0");
	});

	it("includes compaction summary", () => {
		const entries = [
			{ type: "compaction", summary: "Previous context summary" },
			{ type: "message", message: { role: "user", content: [{ type: "text", text: "New" }] } },
		];
		const ctx = extractMainContext(entries, 20);
		expect(ctx).toContain("Previous context summary");
	});

	it("returns empty for no entries", () => {
		expect(extractMainContext([], 20)).toBe("");
	});

	it("skips messages with empty text", () => {
		const entries = [
			{ type: "message", message: { role: "user", content: [{ type: "image" }] } },
		];
		const ctx = extractMainContext(entries, 20);
		expect(ctx).toBe("");
	});

	it("handles message with no content", () => {
		const entries = [{ type: "message", message: { role: "user" } }];
		const ctx = extractMainContext(entries, 20);
		expect(ctx).toBe("");
	});

	it("handles message with undefined role", () => {
		const entries = [
			{ type: "message", message: { content: [{ type: "text", text: "hello" }] } },
		];
		const ctx = extractMainContext(entries, 20);
		expect(ctx).toContain("[unknown] hello");
	});

	it("handles content item with undefined text", () => {
		const entries = [
			{ type: "message", message: { role: "user", content: [{ type: "text" }] } },
		];
		const ctx = extractMainContext(entries, 20);
		expect(ctx).toBe("");
	});
});
