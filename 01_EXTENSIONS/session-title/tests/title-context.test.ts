import { describe, expect, it } from "vitest";
import { buildFallbackSourceFromContext, extractSessionTitleContext } from "../src/title-context.ts";

describe("title context", () => {
	it("extracts prompts and assistant progress from the session branch", () => {
		const context = extractSessionTitleContext(
			{
				getBranch: () => [
					{ type: "message", message: { role: "user", content: "Initial request" } },
					{ type: "message", message: { role: "assistant", content: [{ type: "text", text: "Working on it" }, { type: "tool_result", text: "ignored" }] } },
					{ type: "message", message: { role: "user", content: [{ type: "text", text: "Add async updates" }] } },
				],
			},
			"Current title",
			"Hide branch names too",
		);

		expect(context).toEqual({
			currentTitle: "Current title",
			firstUserPrompt: "Initial request",
			recentUserPrompts: ["Initial request", "Add async updates", "Hide branch names too"],
			latestAssistantText: "Working on it",
		});
	});

	it("falls back to entries, deduplicates prompts, and clips noisy text", () => {
		const longText = `${"a".repeat(320)}\nnext line`;
		const context = extractSessionTitleContext(
			{
				getEntries: () => [
					{ type: "message", message: { role: "user", content: longText } },
					{ type: "message", message: { role: "assistant", content: "done" } },
				],
			},
			undefined,
			longText,
		);

		expect(context.currentTitle).toBeUndefined();
		expect(context.firstUserPrompt.endsWith("…")).toBe(true);
		expect(context.recentUserPrompts).toHaveLength(1);
		expect(context.latestAssistantText).toBe("done");
	});

	it("returns empty context when no session messages are available", () => {
		expect(extractSessionTitleContext({}, "", "   ")).toEqual({
			currentTitle: undefined,
			firstUserPrompt: "",
			recentUserPrompts: [],
			latestAssistantText: "",
		});
	});

	it("ignores non-message entries and unsupported message content", () => {
		expect(
			extractSessionTitleContext({
				getEntries: () => [
					{ type: "custom" },
					{ type: "message" },
					{ type: "message", message: { role: "user" } },
					{ type: "message", message: { role: "assistant", content: [{ type: "image" }, { type: "text" }] } },
				],
			}),
		).toEqual({
			currentTitle: undefined,
			firstUserPrompt: "",
			recentUserPrompts: [],
			latestAssistantText: "",
		});
	});

	it("builds a fallback source from the freshest available context", () => {
		expect(
			buildFallbackSourceFromContext({
				currentTitle: "Current title",
				firstUserPrompt: "Initial request",
				recentUserPrompts: ["Initial request", "Refine the title"],
				latestAssistantText: "Implemented async refresh",
			}),
		).toBe("Refine the title\nInitial request\nImplemented async refresh");
		expect(
			buildFallbackSourceFromContext({ currentTitle: undefined, firstUserPrompt: "", recentUserPrompts: [], latestAssistantText: "" }),
		).toBe("");
	});
});
