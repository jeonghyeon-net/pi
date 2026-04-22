import { beforeEach, describe, expect, it, vi } from "vitest";

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }));

vi.mock("../src/notify.js", () => ({ notify }));

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
	});

	it("uses session title only", async () => {
		createAgentEndHandler()(
			{ messages: [{ role: "assistant", content: "Fixed login copy" }] },
			{ sessionManager: { getSessionId: () => "session-1", getSessionName: () => "notify" } },
		);
		await flush();
		expect(notify).toHaveBeenCalledWith("notify", "");
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
		createAgentEndHandler()(
			{ messages: [{ role: "assistant", content: "Fixed login copy" }] },
			{ sessionManager: { getSessionId: () => "session-2", getSessionName: () => title } },
		);
		releaseFirst();
		await flush();
		expect(notify).not.toHaveBeenCalled();
		title = "업데이트된 제목";
		releaseSecond();
		await flush();
		expect(notify).toHaveBeenCalledWith("업데이트된 제목", "");
	});

	it("falls back to π when session title missing", async () => {
		createAgentEndHandler()(
			{ messages: [{ role: "assistant", content: "로그인 문구 수정 완료" }] },
			{ sessionManager: { getSessionId: () => "session-4", getSessionName: () => undefined } },
		);
		await flush();
		expect(notify).toHaveBeenCalledWith("π", "");
	});
});
