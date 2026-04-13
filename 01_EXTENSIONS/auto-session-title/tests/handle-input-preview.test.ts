import { beforeEach, describe, expect, it } from "vitest";
import { clearOverviewUi, previewOverviewFromInput, restoreOverview } from "../src/handlers.js";
import { stubContext, stubRuntime } from "./helpers.js";

describe("previewOverviewFromInput", () => {
	beforeEach(() => clearOverviewUi(new Set(), stubContext()));

	it("does not render preview ui from the first input anymore", () => {
		const ctx = stubContext();
		expect(previewOverviewFromInput(ctx, "아무리 길고\n줄바꿈 많은 첫 메시지라도 제목으로 쓰지 마"))
			.toBe(false);
		expect(ctx.ui.custom).not.toHaveBeenCalled();
		expect(ctx.ui.setWidget).not.toHaveBeenCalled();
		expect(ctx.ui.setTitle).not.toHaveBeenCalled();
	});

	it("still ignores commands, greetings, and persisted overviews", () => {
		expect(previewOverviewFromInput(stubContext(), "/help")).toBe(false);
		expect(previewOverviewFromInput(stubContext(), "안녕")).toBe(false);
		expect(previewOverviewFromInput(stubContext(), "```ts\nconst x = 1;\n```"))
			.toBe(false);
		expect(previewOverviewFromInput(
			stubContext([{ type: "custom", id: "ov1", customType: "auto-session-title.overview", data: { title: "기존 제목", summary: ["기존 요약"] } }]),
			"다른 요청",
		)).toBe(false);
	});

	it("does not leak anything into another tree view", () => {
		const first = stubContext();
		previewOverviewFromInput(first, "브랜치 A 미리보기");
		const second = stubContext([], { sessionManager: { ...stubContext().sessionManager, getSessionId: () => "session-1", getSessionName: () => undefined } });
		restoreOverview(stubRuntime(), second);
		expect(first.overlay.handle.hide).not.toHaveBeenCalled();
		expect(second.ui.custom).not.toHaveBeenCalled();
		expect(second.ui.setWidget).not.toHaveBeenCalled();
	});
});
