import { beforeEach, describe, expect, it, vi } from "vitest";

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }));
const { resolveKoreanNotificationSummary } = vi.hoisted(() => ({ resolveKoreanNotificationSummary: vi.fn() }));

vi.mock("../src/notify.js", () => ({ notify }));
vi.mock("../src/summarize.js", () => ({ resolveKoreanNotificationSummary }));

import { clearOverviewRefreshState, createAgentEndHandler, createSessionStartHandler, OVERVIEW_REFRESH_QUEUED_EVENT } from "../src/hooks.js";

async function flush(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

describe("createSessionStartHandler", () => {
	beforeEach(() => {
		clearOverviewRefreshState();
	});

	it("registers overview refresh listener only once", async () => {
		const events = { on: vi.fn() };
		const handler = createSessionStartHandler(events);
		await handler();
		await handler();
		expect(events.on).toHaveBeenCalledTimes(1);
		expect(events.on).toHaveBeenCalledWith(OVERVIEW_REFRESH_QUEUED_EVENT, expect.any(Function));
		const pending = Promise.resolve();
		events.on.mock.calls[0][1]({ sessionId: "session-start", pending });
		await pending;
	});
});

describe("createAgentEndHandler", () => {
	beforeEach(() => {
		clearOverviewRefreshState();
		notify.mockReset();
		resolveKoreanNotificationSummary.mockReset();
	});

	it("uses the session title and Korean summary body", async () => {
		const modelRegistry = { getApiKeyAndHeaders: vi.fn() };
		resolveKoreanNotificationSummary.mockResolvedValue("로그인 문구 수정 완료");
		createAgentEndHandler()(
			{ messages: [{ role: "assistant", content: "Fixed login copy" }] },
			{ model: undefined, modelRegistry, sessionManager: { getSessionId: () => "session-1", getSessionName: () => "notify" } },
		);
		await flush();
		expect(resolveKoreanNotificationSummary).toHaveBeenCalledWith("Fixed login copy", "notify", undefined, modelRegistry);
		expect(notify).toHaveBeenCalledWith("notify", "로그인 문구 수정 완료");
	});

	it("waits for latest queued overview refresh before reading session title", async () => {
		let releaseFirst!: () => void;
		let releaseSecond!: () => void;
		const first = new Promise<void>((done) => { releaseFirst = done; });
		const second = new Promise<void>((done) => { releaseSecond = done; });
		let title: string | undefined;
		const events = { on: vi.fn() };
		await createSessionStartHandler(events)();
		events.on.mock.calls[0][1]({ sessionId: "session-2", pending: first });
		events.on.mock.calls[0][1]({ sessionId: "session-2", pending: second });
		resolveKoreanNotificationSummary.mockResolvedValue("로그인 문구 수정 완료");
		createAgentEndHandler()(
			{ messages: [{ role: "assistant", content: "Fixed login copy" }] },
			{ model: undefined, modelRegistry: { getApiKeyAndHeaders: vi.fn() }, sessionManager: { getSessionId: () => "session-2", getSessionName: () => title } },
		);
		releaseFirst();
		await flush();
		expect(notify).not.toHaveBeenCalled();
		title = "업데이트된 제목";
		releaseSecond();
		await flush();
		expect(notify).toHaveBeenCalledWith("업데이트된 제목", "로그인 문구 수정 완료");
	});

	it("strips a leading session title from the summary", async () => {
		resolveKoreanNotificationSummary.mockResolvedValue("서브에이전트 2개로 가위바위보 실행 서브에이전트 두 명이 모두 가위를 내 무승부로 끝났어");
		createAgentEndHandler()(
			{ messages: [{ role: "assistant", content: "result" }] },
			{ model: undefined, modelRegistry: { getApiKeyAndHeaders: vi.fn() }, sessionManager: { getSessionId: () => "session-3", getSessionName: () => "서브에이전트 2개로 가위바위보 실행" } },
		);
		await flush();
		expect(notify).toHaveBeenCalledWith("서브에이전트 2개로 가위바위보 실행", "서브에이전트 두 명이 모두 가위를 내 무승부로 끝났어");
	});

	it("falls back to the local Korean body", async () => {
		resolveKoreanNotificationSummary.mockResolvedValue(undefined);
		createAgentEndHandler()(
			{ messages: [{ role: "assistant", content: "로그인 문구 수정 완료" }] },
			{ model: undefined, modelRegistry: { getApiKeyAndHeaders: vi.fn() }, sessionManager: { getSessionId: () => "session-4", getSessionName: () => undefined } },
		);
		await flush();
		expect(notify).toHaveBeenCalledWith("π", "로그인 문구 수정 완료");
	});
});
