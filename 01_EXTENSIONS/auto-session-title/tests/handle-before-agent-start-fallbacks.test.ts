import { beforeEach, describe, expect, it } from "vitest";
import { clearOverviewUi, restoreOverview } from "../src/handlers.js";
import { stubContext, stubRuntime } from "./helpers.js";

describe("overview restoration fallbacks", () => {
	beforeEach(() => clearOverviewUi(new Set(), stubContext()));

	it("falls back to runtime or session title without showing empty overview ui", () => {
		const runtime = stubRuntime("런타임 제목");
		const ctx = stubContext([], { sessionManager: { ...stubContext().sessionManager, getSessionName: () => "세션 제목" } });
		restoreOverview(runtime, ctx);
		expect(runtime.setSessionName).not.toHaveBeenCalled();
		expect(ctx.ui.custom).not.toHaveBeenCalled();
		expect(ctx.ui.setWidget).not.toHaveBeenCalled();
		expect(ctx.ui.setTitle).toHaveBeenCalledWith("π - 런타임 제목");
	});

	it("keeps the overview hidden when the session is still completely empty", () => {
		const ctx = stubContext();
		restoreOverview(stubRuntime(), ctx);
		expect(ctx.ui.custom).not.toHaveBeenCalled();
		expect(ctx.ui.setWidget).not.toHaveBeenCalled();
		expect(ctx.ui.setTitle).not.toHaveBeenCalled();
	});

	it("skips overlay and title updates when UI is unavailable", () => {
		const ctx = stubContext([{ type: "custom", id: "1", customType: "auto-session-title.overview", data: { title: "현재 세션", summary: ["UI 없이도 복원 정보는 읽는다"] } }], { hasUI: false });
		restoreOverview(stubRuntime(), ctx);
		expect(ctx.ui.custom).not.toHaveBeenCalled();
		expect(ctx.ui.setTitle).not.toHaveBeenCalled();
	});

	it("ignores stale restore requests after shutdown", () => {
		const runtime = { ...stubRuntime(), isActive: () => false };
		const ctx = stubContext([{ type: "custom", id: "3", customType: "auto-session-title.overview", data: { title: "현재 세션", summary: ["복원을 무시해야 함"] } }]);
		restoreOverview(runtime, ctx);
		expect(runtime.setSessionName).not.toHaveBeenCalled();
		expect(ctx.ui.custom).not.toHaveBeenCalled();
	});
});
