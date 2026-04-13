import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearOverviewUi, previewOverviewFromInput, refreshOverview } from "../src/handlers.js";
import { stubContext, stubRuntime } from "./helpers.js";

const { resolveSessionOverview } = vi.hoisted(() => ({ resolveSessionOverview: vi.fn() }));
vi.mock("../src/summarize.js", async () => ({ ...(await vi.importActual<typeof import("../src/summarize.js")>("../src/summarize.js")), resolveSessionOverview }));

describe("refreshOverview empty-state output", () => {
	beforeEach(() => {
		resolveSessionOverview.mockReset();
		clearOverviewUi(new Set(), stubContext());
	});

	it("keeps preview skeleton when summarization returns nothing", async () => {
		const setStatus = vi.fn();
		const ctx = stubContext([{ type: "message", id: "1", message: { role: "user", content: [{ type: "text", text: "README.md에 설명 추가해줘" }] } }]);
		ctx.ui = { ...ctx.ui, setStatus };
		expect(previewOverviewFromInput(ctx, "README.md에 설명 추가해줘")).toBe(true);
		setStatus.mockClear();
		resolveSessionOverview.mockResolvedValue(undefined);
		await refreshOverview(new Set(), stubRuntime(), ctx);
		expect(setStatus).not.toHaveBeenCalled();
	});

	it("shows title-only skeleton when no previous overview exists", async () => {
		const setStatus = vi.fn();
		const ctx = stubContext([{ type: "message", id: "1", message: { role: "assistant", content: [{ type: "text", text: "잡담만 있음" }] } }]);
		ctx.ui = { ...ctx.ui, setStatus };
		resolveSessionOverview.mockResolvedValue({ title: "대화 시작 상태", summary: [] });
		const runtime = stubRuntime();
		await refreshOverview(new Set(), runtime, ctx);
		expect(setStatus).toHaveBeenCalledWith("auto-session-title.overview.title", "대화 시작 상태");
		expect(setStatus).not.toHaveBeenCalledWith("auto-session-title.overview.summary.0", expect.anything());
		expect(runtime.appendEntry).not.toHaveBeenCalled();
		expect(runtime.setSessionName).not.toHaveBeenCalled();
		expect(ctx.ui.setTitle).toHaveBeenCalledWith("π - 대화 시작 상태");
	});

	it("restores previous overview instead of replacing it with empty-state output", async () => {
		const setStatus = vi.fn();
		const previous = { type: "custom", id: "ov1", customType: "auto-session-title.overview", data: { title: "기존 제목", summary: ["유지할 요약"], coveredThroughEntryId: "1" } };
		const ctx = stubContext([previous, { type: "message", id: "2", message: { role: "assistant", content: [{ type: "text", text: "잡담만 있음" }] } }]);
		ctx.ui = { ...ctx.ui, setStatus };
		resolveSessionOverview.mockResolvedValue({ title: "대화 시작 상태", summary: [] });
		await refreshOverview(new Set(), stubRuntime(), ctx);
		expect(setStatus).toHaveBeenCalledWith("auto-session-title.overview.title", "기존 제목");
		expect(setStatus).toHaveBeenCalledWith("auto-session-title.overview.summary.0", "유지할 요약");
	});
});
