import { beforeEach, describe, expect, it } from "vitest";
import { clearOverviewUi, findLatestOverview, getOverviewOverlayOptions, restoreOverview } from "../src/handlers.js";
import { stubContext, stubRuntime } from "./helpers.js";

describe("overview restoration core", () => {
	beforeEach(() => clearOverviewUi(new Set(), stubContext()));

	it("returns undefined for malformed persisted overviews", () => {
		expect(findLatestOverview([
			{ type: "custom", id: "bad1", customType: "auto-session-title.overview", data: null },
			{ type: "custom", id: "bad2", customType: "auto-session-title.overview", data: { title: 123, summary: ["작업 중"] } },
			{ type: "custom", id: "bad3", customType: "auto-session-title.overview", data: { title: "제목", summary: ["   ", null] } },
			{ type: "custom", id: "bad4", customType: "auto-session-title.overview", data: { title: "제목", summary: "bad" } },
		])).toBeUndefined();
	});

	it("finds the latest valid persisted overview entry and keeps every summary line", () => {
		expect(findLatestOverview([
			{ type: "custom", id: "1", customType: "other", data: { title: "x", summary: ["y"] } },
			{ type: "custom", id: "2", customType: "auto-session-title.overview", data: "invalid" },
			{ type: "custom", id: "5", customType: "auto-session-title.overview", data: { title: "현재 세션", summary: ["우상단 오버레이를 유지함", "resume 복원을 붙임", `${"x".repeat(140)}`, "체크포인트 전진을 유지함", "긴 컨텍스트도 계속 보존함"], coveredThroughEntryId: "4" } },
		])).toEqual({ entryId: "5", coveredThroughEntryId: "4", title: "현재 세션", summary: ["우상단 오버레이를 유지함", "resume 복원을 붙임", `${"x".repeat(140)}`, "체크포인트 전진을 유지함", "긴 컨텍스트도 계속 보존함"] });
	});

	it("falls back to the overview entry id when no checkpoint was stored", () => {
		expect(findLatestOverview([{ type: "custom", id: "7", customType: "auto-session-title.overview", data: { title: "세션", summary: ["resume 복원을 확인함"] } }])).toEqual({ entryId: "7", coveredThroughEntryId: "7", title: "세션", summary: ["resume 복원을 확인함"] });
	});

	it("restores overlay, session name, and terminal title from persisted overview", () => {
		const runtime = stubRuntime("이전 이름");
		const ctx = stubContext([{ type: "custom", id: "3", customType: "auto-session-title.overview", data: { title: "현재 세션", summary: ["우상단 오버레이를 유지함", "resume 복원을 붙임"] } }]);
		restoreOverview(runtime, ctx);
		expect(runtime.setSessionName).toHaveBeenCalledWith("현재 세션");
		expect(ctx.overlay.options?.overlayOptions).toEqual(expect.objectContaining({ anchor: "top-right", nonCapturing: true, width: getOverviewOverlayOptions().width }));
		expect(ctx.overlay.component?.render(64).join("\n")).toContain("현재 세션");
		expect(ctx.ui.setTitle).toHaveBeenCalledWith("π - 현재 세션");
	});

	it("reuses the same overlay for subsequent restores in the same session", () => {
		const ctx = stubContext([{ type: "custom", id: "1", customType: "auto-session-title.overview", data: { title: "첫 제목", summary: ["현재 상태를 짧게 표시함"] } }]);
		restoreOverview(stubRuntime(), ctx);
		const firstRender = ctx.overlay.component?.render(64);
		expect(ctx.overlay.component?.render(68)).not.toBe(firstRender);
		ctx.sessionManager.getBranch.mockReturnValue([{ type: "custom", id: "2", customType: "auto-session-title.overview", data: { title: "둘째 제목", summary: ["다음 상태로 전환함"] } }]);
		restoreOverview(stubRuntime(), ctx);
		expect(ctx.ui.custom).toHaveBeenCalledTimes(1);
		expect(ctx.overlay.tui.requestRender).toHaveBeenCalled();
	});
});
