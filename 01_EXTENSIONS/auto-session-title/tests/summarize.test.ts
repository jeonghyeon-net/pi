import { describe, expect, it } from "vitest";
import { buildConversationTranscript } from "../src/summarize.js";

describe("buildConversationTranscript", () => {
	it("collects user, assistant, tool, compaction, and branch summary lines", () => {
		const transcript = buildConversationTranscript([
			{ type: "other", id: "z0" },
			{ type: "message", id: "z1", message: {} },
			{ type: "compaction", id: "c0", summary: "Earlier exploration" },
			{ type: "branch_summary", id: "b0", summary: "Alternative branch" },
			{ type: "message", id: "1", message: { role: "user", content: "Fix footer" } },
			{ type: "message", id: "2", message: { role: "assistant", content: [{ type: "text", text: "I will inspect the footer." }, { type: "toolCall", name: "read", arguments: { path: "src/footer.ts" } }, { type: "toolCall", name: "bash", arguments: null }] } },
			{ type: "message", id: "2b", message: { role: "assistant", content: "plain assistant string" } },
			{ type: "message", id: "3", message: { role: "toolResult", toolName: "read", content: [{ type: "text", text: "footer code" }] } },
			{ type: "message", id: "4", message: { role: "toolResult", content: [{ type: "text", text: "fallback tool name" }] } },
			{ type: "message", id: "5", message: { role: "user", content: 42 } },
			{ type: "message", id: "6", message: { role: "custom", content: [{ type: "text", text: "ignored" }] } },
		]);
		expect(transcript).toContain("Compaction summary: Earlier exploration");
		expect(transcript).toContain("Branch summary: Alternative branch");
		expect(transcript).toContain("Tool result tool: fallback tool name");
		expect(transcript).not.toContain("ignored");
	});

	it("truncates oversized transcript sections before clipping the full transcript", () => {
		const transcript = buildConversationTranscript([{ type: "message", id: "1", message: { role: "assistant", content: [{ type: "text", text: "x".repeat(500) }] } }]);
		expect(transcript).toContain(`Assistant: ${"x".repeat(239)}…`);
	});

	it("clips very long transcripts", () => {
		const transcript = buildConversationTranscript(Array.from({ length: 80 }, (_, index) => ({ type: "message", id: `${index + 1}`, message: { role: "user", content: [{ type: "text", text: `line-${index}-${"a".repeat(220)}` }] } })));
		expect(transcript).toContain("[... earlier context omitted ...]");
		expect(transcript.length).toBeLessThanOrEqual(12032);
	});
});
