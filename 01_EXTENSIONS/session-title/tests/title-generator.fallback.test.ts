import { beforeEach, describe, expect, it, vi } from "vitest";

const { completeSimple } = vi.hoisted(() => ({ completeSimple: vi.fn() }));
vi.mock("@mariozechner/pi-ai", () => ({ completeSimple }));

import { generateSessionTitle } from "../src/title-generator.ts";

describe("title generator fallbacks", () => {
	beforeEach(() => completeSimple.mockReset());

	it("falls back when model context is incomplete", async () => {
		await expect(generateSessionTitle({}, "Please add terminal title sync.")).resolves.toBe("terminal title sync");
		await expect(generateSessionTitle({ model: { id: "model" } }, "Please add terminal title sync.")).resolves.toBe("terminal title sync");
		await expect(generateSessionTitle({ modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true }) } }, "Please add terminal title sync.")).resolves.toBe("terminal title sync");
		await expect(generateSessionTitle({}, "pi에서 ollama glm-5.1 쓰려면 어떻게 해야함")).resolves.toBe("pi에서 ollama glm-5.1 사용 방법");
		await expect(generateSessionTitle({}, "glm-5.1 vs gpt-5.4 누가 더 좋음? 레딧에서 사람들 리뷰 봐봐")).resolves.toBe("glm-5.1 vs gpt-5.4 레딧 리뷰 비교");
		await expect(
			generateSessionTitle({}, {
				currentTitle: "session title auto naming",
				firstUserPrompt: "Please add a session title extension.",
				recentUserPrompts: ["Please add a session title extension.", "Hide branch names too."],
				latestAssistantText: "Implemented the first pass.",
			}),
		).resolves.toBe("session title auto naming extension");
	});

	it("falls back when auth lookup fails or the model call fails", async () => {
		await expect(generateSessionTitle({ model: { id: "model" }, modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: false }) } }, "Please add terminal title sync.")).resolves.toBe("terminal title sync");
		await expect(generateSessionTitle({ model: { id: "model" }, modelRegistry: { getApiKeyAndHeaders: async () => { throw new Error("boom"); } } }, "Please add terminal title sync.")).resolves.toBe("terminal title sync");
		completeSimple.mockRejectedValueOnce(new Error("boom"));
		await expect(generateSessionTitle({ model: { id: "model" }, modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "key" }) } }, "Please add terminal title sync.")).resolves.toBe("terminal title sync");
	});
});
