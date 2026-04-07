import type { AssistantMessage, Model } from "@mariozechner/pi-ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { completeSimple } = vi.hoisted(() => ({ completeSimple: vi.fn() }));
vi.mock("@mariozechner/pi-ai", async () => {
	const actual = await vi.importActual<typeof import("@mariozechner/pi-ai")>("@mariozechner/pi-ai");
	return { ...actual, completeSimple };
});

import { resolveSessionTitle } from "../src/summarize.js";

const model = { api: "openai-responses", provider: "openai", id: "gpt-5.4-mini", name: "GPT", reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200000, maxTokens: 4096 } satisfies Model<"openai-responses">;
const registry = { getApiKeyAndHeaders: vi.fn(async () => ({ ok: true as const, apiKey: "token" })) };

function message(content: AssistantMessage["content"], stopReason: AssistantMessage["stopReason"] = "stop"): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "openai-responses",
		provider: "openai",
		model: "gpt-5.4-mini",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason,
		timestamp: 0,
	};
}

describe("resolveSessionTitle", () => {
	beforeEach(() => {
		completeSimple.mockReset();
		registry.getApiKeyAndHeaders.mockReset();
		registry.getApiKeyAndHeaders.mockResolvedValue({ ok: true, apiKey: "token" });
	});

	it("uses an LLM-generated summary instead of the raw first message", async () => {
		completeSimple.mockResolvedValue(message([{ type: "text", text: "첫 메시지 요약" }]));
		expect(await resolveSessionTitle("긴 첫 메시지", model, registry)).toBe("첫 메시지 요약");
	});

	it("uses the current model without forcing a reasoning override", async () => {
		completeSimple.mockResolvedValue(message([{ type: "text", text: "Plain title" }]));
		expect(await resolveSessionTitle("Fix footer", model, registry)).toBe("Plain title");
		expect(completeSimple).toHaveBeenCalledWith(model, expect.any(Object), expect.not.objectContaining({ reasoning: expect.anything() }));
	});

	it("ignores commands, missing models, and auth failures", async () => {
		expect(await resolveSessionTitle("/name custom", model, registry)).toBeUndefined();
		expect(await resolveSessionTitle("Fix footer", undefined, registry)).toBeUndefined();
		registry.getApiKeyAndHeaders.mockResolvedValue({ ok: false, error: "no auth" });
		expect(await resolveSessionTitle("Fix footer", model, registry)).toBeUndefined();
	});

	it("uses only text blocks and normalizes the model output", async () => {
		completeSimple.mockResolvedValue(message([{ type: "thinking", thinking: "hidden" }, { type: "text", text: "# `Fix footer title`" }]));
		expect(await resolveSessionTitle("Fix footer", model, registry)).toBe("Fix footer title");
	});

	it("returns undefined when the provider returns an error, the output is empty, or the call fails", async () => {
		completeSimple.mockResolvedValueOnce(message([], "error"));
		expect(await resolveSessionTitle("Fix footer", model, registry)).toBeUndefined();
		completeSimple.mockResolvedValueOnce(message([{ type: "thinking", thinking: "hidden" }]));
		expect(await resolveSessionTitle("Fix footer", model, registry)).toBeUndefined();
		completeSimple.mockRejectedValue(new Error("boom"));
		expect(await resolveSessionTitle("Fix footer", model, registry)).toBeUndefined();
	});
});
