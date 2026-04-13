import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearOverviewUi, previewOverviewFromInput, refreshOverview, restoreOverview } from "../src/handlers.js";
import { stubContext, stubRuntime } from "./helpers.js";

const { resolveSessionOverview } = vi.hoisted(() => ({ resolveSessionOverview: vi.fn() }));
vi.mock("../src/summarize.js", async () => ({ ...(await vi.importActual<typeof import("../src/summarize.js")>("../src/summarize.js")), resolveSessionOverview }));

describe("refreshOverview effects", () => {
	beforeEach(() => {
		resolveSessionOverview.mockReset();
		clearOverviewUi(new Set(), stubContext());
	});

	it("persists and applies a new overview after agent_end", async () => {
		resolveSessionOverview.mockResolvedValue({ title: "세션 요약 제목", summary: ["우상단 오버레이를 유지함", "idle 시점에 제목을 갱신함", "resume 복원을 점검 중"] });
		const runtime = stubRuntime();
		const ctx = stubContext([{ type: "message", id: "1", message: { role: "user", content: [{ type: "text", text: "오버레이를 만들어줘" }] } }, { type: "message", id: "2", message: { role: "assistant", content: [{ type: "text", text: "구현하겠습니다" }] } }]);
		await refreshOverview(new Set(), runtime, ctx);
		expect(runtime.appendEntry).toHaveBeenCalledWith("auto-session-title.overview", { title: "세션 요약 제목", summary: ["우상단 오버레이를 유지함", "idle 시점에 제목을 갱신함", "resume 복원을 점검 중"], coveredThroughEntryId: "2" });
		expect(runtime.setSessionName).toHaveBeenCalledWith("세션 요약 제목");
		expect(ctx.ui.setTitle).toHaveBeenCalledWith("π - 세션 요약 제목");
		expect(ctx.overlay.component?.render(36).join("\n")).toContain("세션 요약 제목");
	});

	it("clears stale footer summary lines when next overview is shorter", async () => {
		const setStatus = vi.fn();
		const previous = { type: "custom", id: "ov1", customType: "auto-session-title.overview", data: { title: "기존 제목", summary: ["기존 첫 줄", "지워질 둘째 줄"], coveredThroughEntryId: "1" } };
		const ctx = stubContext([previous, { type: "message", id: "2", message: { role: "assistant", content: [{ type: "text", text: "새 출력" }] } }]);
		ctx.ui = { ...ctx.ui, setStatus };
		restoreOverview(stubRuntime("기존 제목"), ctx);
		setStatus.mockClear();
		resolveSessionOverview.mockResolvedValue({ title: "새 제목", summary: ["남길 한 줄"] });
		await refreshOverview(new Set(), stubRuntime(), ctx);
		expect(setStatus).toHaveBeenCalledWith("auto-session-title.overview.title", "새 제목");
		expect(setStatus).toHaveBeenCalledWith("auto-session-title.overview.summary.0", "남길 한 줄");
		expect(setStatus).toHaveBeenCalledWith("auto-session-title.overview.summary.1", undefined);
	});

	it("keeps preview skeleton when generated summary still has no durable content", async () => {
		const setStatus = vi.fn();
		const ctx = stubContext([{ type: "message", id: "1", message: { role: "user", content: [{ type: "text", text: "야" }] } }]);
		ctx.ui = { ...ctx.ui, setStatus };
		expect(previewOverviewFromInput(ctx, "README.md에 설명 추가해줘")).toBe(true);
		setStatus.mockClear();
		resolveSessionOverview.mockResolvedValue({ title: "대화 시작 상태", summary: [] });
		await refreshOverview(new Set(), stubRuntime(), ctx);
		expect(setStatus).not.toHaveBeenCalled();
	});

	it("advances the checkpoint even when the visible overview stays the same", async () => {
		resolveSessionOverview.mockResolvedValue({ title: "기존 제목", summary: ["오버레이 배치를 유지함", "다음 메시지를 기다리는 중"] });
		const runtime = stubRuntime("기존 제목");
		await refreshOverview(new Set(), runtime, stubContext([{ type: "custom", id: "ov1", customType: "auto-session-title.overview", data: { title: "기존 제목", summary: ["오버레이 배치를 유지함", "다음 메시지를 기다리는 중"], coveredThroughEntryId: "2" } }, { type: "message", id: "3", message: { role: "assistant", content: [{ type: "text", text: "첫 변경" }] } }]));
		await refreshOverview(new Set(), runtime, stubContext([{ type: "custom", id: "ov1", customType: "auto-session-title.overview", data: { title: "기존 제목", summary: ["오버레이 배치를 유지함", "다음 메시지를 기다리는 중"], coveredThroughEntryId: "2" } }, { type: "message", id: "3", message: { role: "assistant", content: [{ type: "text", text: "첫 변경" }] } }, { type: "custom", id: "ov2", customType: "auto-session-title.overview", data: { title: "기존 제목", summary: ["오버레이 배치를 유지함", "다음 메시지를 기다리는 중"], coveredThroughEntryId: "3" } }, { type: "message", id: "4", message: { role: "assistant", content: [{ type: "text", text: "둘째 변경" }] } }]));
		expect(runtime.appendEntry).toHaveBeenNthCalledWith(1, "auto-session-title.overview", { title: "기존 제목", summary: ["오버레이 배치를 유지함", "다음 메시지를 기다리는 중"], coveredThroughEntryId: "3" });
		expect(runtime.appendEntry).toHaveBeenNthCalledWith(2, "auto-session-title.overview", { title: "기존 제목", summary: ["오버레이 배치를 유지함", "다음 메시지를 기다리는 중"], coveredThroughEntryId: "4" });
		expect(resolveSessionOverview.mock.calls[1][0].recentText).not.toContain("첫 변경");
		expect(resolveSessionOverview.mock.calls[1][0].recentText).toContain("둘째 변경");
	});

	it("reruns once after overlap so the final follow-up state is not lost", async () => {
		let release!: (value: { title: string; summary: string[] }) => void;
		resolveSessionOverview.mockImplementationOnce(() => new Promise((done) => { release = done; })).mockResolvedValueOnce({ title: "최종 제목", summary: ["최종 요약"] });
		const runtime = stubRuntime();
		const inFlight = new Set<string>();
		let branch = [{ type: "message", id: "1", message: { role: "assistant", content: [{ type: "text", text: "첫 출력" }] } }];
		const ctx = stubContext([], { sessionManager: { ...stubContext().sessionManager, getBranch: vi.fn(() => branch) } });
		const first = refreshOverview(inFlight, runtime, ctx);
		branch = [...branch, { type: "message", id: "2", message: { role: "assistant", content: [{ type: "text", text: "둘째 출력" }] } }];
		await refreshOverview(inFlight, runtime, ctx);
		release({ title: "중간 제목", summary: ["중간 요약"] });
		await first;
		expect(resolveSessionOverview).toHaveBeenCalledTimes(2);
		expect(resolveSessionOverview.mock.calls[1][0].recentText).toContain("둘째 출력");
		expect(runtime.appendEntry).toHaveBeenLastCalledWith("auto-session-title.overview", { title: "최종 제목", summary: ["최종 요약"], coveredThroughEntryId: "2" });
	});

	it("skips session name writes when the runtime already has the same title", async () => {
		resolveSessionOverview.mockResolvedValue({ title: "동일 제목", summary: ["현재 상태를 간단히 보여줌"] });
		const runtime = stubRuntime("동일 제목");
		const ctx = stubContext([{ type: "message", id: "1", message: { role: "assistant", content: [{ type: "text", text: "업데이트" }] } }]);
		await refreshOverview(new Set(), runtime, ctx);
		expect(runtime.setSessionName).not.toHaveBeenCalled();
		expect(runtime.appendEntry).toHaveBeenCalledWith("auto-session-title.overview", { title: "동일 제목", summary: ["현재 상태를 간단히 보여줌"], coveredThroughEntryId: "1" });
	});
});
