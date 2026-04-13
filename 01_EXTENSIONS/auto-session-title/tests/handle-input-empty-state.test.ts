import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearOverviewUi, refreshOverview } from "../src/handlers.js";
import { stubContext, stubRuntime } from "./helpers.js";

const { resolveSessionOverview } = vi.hoisted(() => ({ resolveSessionOverview: vi.fn() }));
vi.mock("../src/summarize.js", async () => ({ ...(await vi.importActual<typeof import("../src/summarize.js")>("../src/summarize.js")), resolveSessionOverview }));

describe("refreshOverview empty-state output", () => {
	beforeEach(() => {
		resolveSessionOverview.mockReset();
		clearOverviewUi(new Set(), stubContext());
	});

	it("keeps the overview blank when summarization returns nothing or empty state", async () => {
		const setStatus = vi.fn();
		const ctx = stubContext([{ type: "message", id: "1", message: { role: "assistant", content: [{ type: "text", text: "잡담만 있음" }] } }]);
		ctx.ui = { ...ctx.ui, setStatus };
		const runtime = stubRuntime();
		resolveSessionOverview.mockResolvedValue(undefined);
		await refreshOverview(new Set(), runtime, ctx);
		resolveSessionOverview.mockResolvedValue({ title: "대화 시작 상태", summary: [] });
		await refreshOverview(new Set(), runtime, ctx);
		expect(setStatus).not.toHaveBeenCalled();
		expect(runtime.appendEntry).not.toHaveBeenCalled();
		expect(runtime.setSessionName).not.toHaveBeenCalled();
		expect(ctx.ui.setTitle).not.toHaveBeenCalled();
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
