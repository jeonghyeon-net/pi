import { beforeEach, describe, expect, it, vi } from "vitest";

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }));
const { resolveKoreanNotificationSummary } = vi.hoisted(() => ({ resolveKoreanNotificationSummary: vi.fn() }));

vi.mock("../src/notify.js", () => ({ notify }));
vi.mock("../src/summarize.js", () => ({ resolveKoreanNotificationSummary }));

import { createAgentEndHandler } from "../src/hooks.js";

describe("createAgentEndHandler", () => {
	beforeEach(() => {
		notify.mockReset();
		resolveKoreanNotificationSummary.mockReset();
	});

	it("prefers the Korean summary as the notification body", async () => {
		const modelRegistry = { getApiKeyAndHeaders: vi.fn() };
		resolveKoreanNotificationSummary.mockResolvedValue("로그인 문구 수정 완료");
		await createAgentEndHandler()(
			{ messages: [{ role: "assistant", content: "Fixed login copy" }] },
			{ model: undefined, modelRegistry, sessionManager: { getSessionName: () => "notify" } },
		);
		expect(resolveKoreanNotificationSummary).toHaveBeenCalledWith("Fixed login copy", "notify", undefined, modelRegistry);
		expect(notify).toHaveBeenCalledWith("notify", "로그인 문구 수정 완료");
	});

	it("strips a leading session title from the summary", async () => {
		resolveKoreanNotificationSummary.mockResolvedValue("서브에이전트 2개로 가위바위보 실행 서브에이전트 두 명이 모두 가위를 내 무승부로 끝났어");
		await createAgentEndHandler()(
			{ messages: [{ role: "assistant", content: "result" }] },
			{ model: undefined, modelRegistry: { getApiKeyAndHeaders: vi.fn() }, sessionManager: { getSessionName: () => "서브에이전트 2개로 가위바위보 실행" } },
		);
		expect(notify).toHaveBeenCalledWith("서브에이전트 2개로 가위바위보 실행", "서브에이전트 두 명이 모두 가위를 내 무승부로 끝났어");
	});

	it("falls back to the local Korean body", async () => {
		resolveKoreanNotificationSummary.mockResolvedValue(undefined);
		await createAgentEndHandler()(
			{ messages: [{ role: "assistant", content: "로그인 문구 수정 완료" }] },
			{ model: undefined, modelRegistry: { getApiKeyAndHeaders: vi.fn() }, sessionManager: { getSessionName: () => undefined } },
		);
		expect(notify).toHaveBeenCalledWith("π", "로그인 문구 수정 완료");
	});
});
