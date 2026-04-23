import { beforeEach, describe, expect, it, vi } from "vitest";

const { completeSimple } = vi.hoisted(() => ({ completeSimple: vi.fn() }));
vi.mock("@mariozechner/pi-ai", () => ({ completeSimple }));

import { generateSessionTitle } from "../src/title-generator.ts";

const ctx = { model: { id: "model" }, modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "key" }) } };

describe("title generator model path", () => {
	beforeEach(() => completeSimple.mockReset());

	it("returns the generated title when the model succeeds", async () => {
		completeSimple.mockResolvedValue({ stopReason: "stop", content: [{ type: "text", text: "Session title: Add session title extension" }] });
		await expect(generateSessionTitle(ctx, "Please add terminal title sync.")).resolves.toBe("Add session title extension");
		completeSimple.mockResolvedValueOnce({ stopReason: "stop", content: [{ type: "text", text: "Update session-title async refresh" }] });
		await expect(
			generateSessionTitle(ctx, {
				currentTitle: "session title auto naming",
				firstUserPrompt: "Please add a session title extension.",
				recentUserPrompts: ["Please add a session title extension.", "Also update it asynchronously with more context."],
				latestAssistantText: "Implemented the first pass.",
			}),
		).resolves.toBe("Update session-title async refresh");
		expect(completeSimple).toHaveBeenCalledTimes(2);
		expect(completeSimple.mock.calls[1]?.[1]?.messages?.[0]?.content?.[0]?.text).toContain("Recent user follow-ups");
	});

	it("falls back when the model stops early, returns an empty title, or mirrors the request", async () => {
		completeSimple.mockResolvedValueOnce({ stopReason: "length", content: [{ type: "text", text: "Truncated" }] });
		completeSimple.mockResolvedValueOnce({ stopReason: "stop", content: [{ type: "text", text: "" }] });
		completeSimple.mockResolvedValueOnce({ stopReason: "stop", content: [{ type: "text", text: "Please add terminal title sync" }] });
		completeSimple.mockResolvedValueOnce({ stopReason: "stop", content: [{ type: "text", text: "Fix API timeout handling in diff-review command" }] });
		completeSimple.mockResolvedValueOnce({ stopReason: "stop", content: [{ type: "text", text: "Please add a session title extension" }] });
		await expect(generateSessionTitle(ctx, "Please add terminal title sync.")).resolves.toBe("terminal title sync");
		await expect(generateSessionTitle(ctx, "Please add terminal title sync.")).resolves.toBe("terminal title sync");
		await expect(generateSessionTitle(ctx, "Please add terminal title sync.")).resolves.toBe("terminal title sync");
		await expect(generateSessionTitle(ctx, "Please fix API timeout handling in diff-review command.")).resolves.toBe("API timeout handling in diff-review command");
		await expect(
			generateSessionTitle(ctx, {
				currentTitle: "session title auto naming",
				firstUserPrompt: "Please add a session title extension.",
				recentUserPrompts: ["Please add a session title extension."],
				latestAssistantText: "Implemented the first pass.",
			}),
		).resolves.toBe("session title auto naming extension");
	});
});
