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
	});

	it("falls back when auth lookup fails or the model call fails", async () => {
		await expect(generateSessionTitle({ model: { id: "model" }, modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: false }) } }, "Please add terminal title sync.")).resolves.toBe("terminal title sync");
		await expect(generateSessionTitle({ model: { id: "model" }, modelRegistry: { getApiKeyAndHeaders: async () => { throw new Error("boom"); } } }, "Please add terminal title sync.")).resolves.toBe("terminal title sync");
		completeSimple.mockRejectedValueOnce(new Error("boom"));
		await expect(generateSessionTitle({ model: { id: "model" }, modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "key" }) } }, "Please add terminal title sync.")).resolves.toBe("terminal title sync");
	});
});
