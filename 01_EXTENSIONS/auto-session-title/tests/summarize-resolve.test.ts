import type { AssistantMessage, Model } from "@mariozechner/pi-ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { completeSimple } = vi.hoisted(() => ({ completeSimple: vi.fn() }));
vi.mock("@mariozechner/pi-ai", async () => ({ ...(await vi.importActual<typeof import("@mariozechner/pi-ai")>("@mariozechner/pi-ai")), completeSimple }));

import { OVERVIEW_PROMPT, resolveSessionOverview } from "../src/summarize.js";

const model = { api: "openai-responses", provider: "openai", id: "gpt-5.4-mini", name: "GPT", reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200000, maxTokens: 4096 } satisfies Model<"openai-responses">;
const registry = { getApiKeyAndHeaders: vi.fn(async () => ({ ok: true as const, apiKey: "token" })) };
const assistantMessage = (content: AssistantMessage["content"], stopReason: AssistantMessage["stopReason"] = "stop"): AssistantMessage => ({ role: "assistant", content, api: "openai-responses", provider: "openai", model: "gpt-5.4-mini", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason, timestamp: 0 });

describe("resolveSessionOverview", () => {
	beforeEach(() => {
		completeSimple.mockReset();
		registry.getApiKeyAndHeaders.mockReset();
		registry.getApiKeyAndHeaders.mockResolvedValue({ ok: true, apiKey: "token" });
	});

	it("returns undefined when model, text, or auth is missing", async () => {
		expect(await resolveSessionOverview({ recentText: "", model, modelRegistry: registry })).toBeUndefined();
		expect(await resolveSessionOverview({ recentText: "recent", model: undefined, modelRegistry: registry })).toBeUndefined();
		registry.getApiKeyAndHeaders.mockResolvedValue({ ok: false, error: "no auth" });
		expect(await resolveSessionOverview({ recentText: "recent", model, modelRegistry: registry })).toBeUndefined();
	});

	it("parses a successful model response", async () => {
		completeSimple.mockResolvedValue(assistantMessage([{ type: "thinking", thinking: "hidden" }, { type: "text", text: "TITLE: 세션 제목\nSUMMARY:\n현재 작업은 오버레이를 다듬는 중\nidle 시점 갱신을 마쳤고\nresume 복원까지 확인해야 한다" }]));
		expect(await resolveSessionOverview({ recentText: "User: footer 요약 표시 고쳐줘\nAssistant: 확인 중", model, modelRegistry: registry })).toEqual({ title: "세션 제목", summary: ["현재 작업은 오버레이를 다듬는 중 idle 시점 갱신을 마쳤고 resume 복원까지 확인해야 한다"] });
		expect(completeSimple).toHaveBeenCalledWith(model, expect.objectContaining({ systemPrompt: OVERVIEW_PROMPT }), expect.objectContaining({ apiKey: "token" }));
	});

	it("keeps up to five summary lines", async () => {
		completeSimple.mockResolvedValue(assistantMessage([{ type: "text", text: "TITLE: 세션 제목\nSUMMARY:\n- 끝난 일 1\n- 끝난 일 2\n- 제약 3\n- 다음 단계 4" }]));
		expect(await resolveSessionOverview({ recentText: "User: 말록스 콘트라 베이스 가격 다시 확인해줘", model, modelRegistry: registry })).toEqual({ title: "세션 제목", summary: ["끝난 일 1", "끝난 일 2", "제약 3", "다음 단계 4"] });
	});

	it("returns undefined when provider errors, parsing fails, or the call throws", async () => {
		completeSimple.mockResolvedValueOnce(assistantMessage([], "error"));
		expect(await resolveSessionOverview({ recentText: "recent", model, modelRegistry: registry })).toBeUndefined();
		completeSimple.mockResolvedValueOnce(assistantMessage([{ type: "text", text: "TITLE: bad" }]));
		expect(await resolveSessionOverview({ recentText: "recent", model, modelRegistry: registry })).toBeUndefined();
		completeSimple.mockRejectedValueOnce(new Error("boom"));
		expect(await resolveSessionOverview({ recentText: "recent", model, modelRegistry: registry })).toBeUndefined();
	});
});
