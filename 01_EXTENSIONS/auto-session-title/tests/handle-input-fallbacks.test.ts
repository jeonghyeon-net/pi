import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearOverviewUi, getEntriesSince, refreshOverview } from "../src/handlers.js";
import { stubContext, stubRuntime } from "./helpers.js";

const { resolveSessionOverview } = vi.hoisted(() => ({ resolveSessionOverview: vi.fn() }));
vi.mock("../src/summarize.js", async () => ({ ...(await vi.importActual<typeof import("../src/summarize.js")>("../src/summarize.js")), resolveSessionOverview }));

describe("refreshOverview fallback titles", () => {
	beforeEach(() => {
		resolveSessionOverview.mockReset();
		clearOverviewUi(new Set(), stubContext());
	});
	it("uses runtime or session fallback titles when there is no previous overview", async () => {
		const emptyCtx = stubContext([], { sessionManager: { ...stubContext().sessionManager, getSessionName: () => undefined } });
		await refreshOverview(new Set(), stubRuntime("런타임 제목"), emptyCtx);
		expect(emptyCtx.ui.setTitle).toHaveBeenCalledWith("π - 런타임 제목");
		resolveSessionOverview.mockResolvedValue(undefined);
		const runtimeCtx = stubContext([{ type: "message", id: "1", message: { role: "assistant", content: [{ type: "text", text: "새 출력" }] } }], { sessionManager: { ...stubContext().sessionManager, getSessionName: () => undefined } });
		await refreshOverview(new Set(), stubRuntime("런타임 제목"), runtimeCtx);
		expect(runtimeCtx.ui.setTitle).toHaveBeenCalledWith("π - 런타임 제목");
		const sessionCtx = stubContext([{ type: "message", id: "2", message: { role: "assistant", content: [{ type: "text", text: "또 다른 출력" }] } }], { sessionManager: { ...stubContext().sessionManager, getSessionName: () => "세션 제목" } });
		await refreshOverview(new Set(), stubRuntime(), sessionCtx);
		expect(sessionCtx.ui.setTitle).toHaveBeenCalledWith("π - 세션 제목");
	});

	it("keeps the overview hidden but restores default terminal title when no fallback title exists", async () => {
		resolveSessionOverview.mockResolvedValue(undefined);
		const ctx = stubContext([{ type: "message", id: "1", message: { role: "assistant", content: [{ type: "text", text: "새 출력" }] } }], { sessionManager: { ...stubContext().sessionManager, getSessionName: () => undefined } });
		await refreshOverview(new Set(), stubRuntime(), ctx);
		expect(ctx.ui.setTitle).toHaveBeenCalledWith("π");
		expect(ctx.ui.custom).not.toHaveBeenCalled();
		expect(ctx.ui.setWidget).not.toHaveBeenCalled();
	});
});

describe("getEntriesSince", () => {
	const branch = [{ type: "message", id: "1" }, { type: "message", id: "2" }, { type: "message", id: "3" }];
	it("returns the whole branch without or without a matching checkpoint", () => {
		expect(getEntriesSince(branch)).toEqual(branch);
		expect(getEntriesSince(branch, "missing")).toEqual(branch);
	});
	it("returns only entries after the checkpoint when found", () => {
		expect(getEntriesSince(branch, "2")).toEqual([{ type: "message", id: "3" }]);
	});
});
