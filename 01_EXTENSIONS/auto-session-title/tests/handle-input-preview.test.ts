import { beforeEach, describe, expect, it } from "vitest";
import { clearOverviewUi, previewOverviewFromInput, restoreOverview } from "../src/handlers.js";
import { stubContext, stubRuntime } from "./helpers.js";

const renderPreview = (ctx: ReturnType<typeof stubContext>) => ctx.overlay.component?.render(80).join("\n") ?? ctx.widget.component?.render(80).join("\n") ?? "";
describe("previewOverviewFromInput", () => {
	beforeEach(() => clearOverviewUi(new Set(), stubContext()));
	it("builds a short preview instead of copying the whole first message verbatim", () => {
		const ctx = stubContext();
		expect(previewOverviewFromInput(ctx, "그리고 서브에이전트 2개 호출해서 가위바위보 시켜봐")).toBe(true);
		const rendered = renderPreview(ctx);
		expect(rendered).toContain("서브에이전트 2개 호출해서 가위바위보");
		expect(rendered).toContain("░░░░░░░░");
		expect(rendered).not.toContain("요청 처리 중이다");
		expect(rendered).not.toContain("그리고 서브에이전트 2개 호출해서 가위바위보 시켜봐");
		expect(ctx.ui.setTitle).toHaveBeenCalledWith("π - 서브에이전트 2개 호출해서 가위바위보");
	});
	it("uses an English preview template for English-first input", () => {
		const ctx = stubContext();
		expect(previewOverviewFromInput(ctx, "Call two subagents and compare their answers")).toBe(true);
		const rendered = renderPreview(ctx);
		expect(rendered).toContain("Call two subagents and compare their answers");
		expect(rendered).toContain("░░░░░░░░");
		expect(rendered).not.toContain("Working on:");
		expect(rendered).not.toContain("The overview will refresh after the first response completes.");
	});
	it("strips polite English wrappers before building the preview", () => {
		const ctx = stubContext();
		expect(previewOverviewFromInput(ctx, "Can you compare the two branches and summarize the diff, please?")).toBe(true);
		const rendered = renderPreview(ctx);
		expect(rendered).toContain("compare the two branches and summarize the diff");
		expect(rendered).not.toContain("Working on:");
		expect(rendered).not.toContain("Can you compare the two branches");
		expect(rendered).not.toContain("please");
	});
	it("keeps English-first mixed-language requests in the English preview template", () => {
		const ctx = stubContext();
		expect(previewOverviewFromInput(ctx, "Review 라우터 logs and summarize the diff")).toBe(true);
		const rendered = renderPreview(ctx);
		expect(rendered).toContain("Review 라우터 logs and summarize the diff");
		expect(rendered).not.toContain("Working on:");
		expect(rendered).not.toContain("작업을 바로 정리 중이다.");
	});
	it("keeps Korean file-name requests in the Korean preview template", () => {
		const ctx = stubContext();
		expect(previewOverviewFromInput(ctx, "README.md에 설명 추가해줘")).toBe(true);
		const rendered = renderPreview(ctx);
		expect(rendered).toContain("README.md에 설명 추가");
		expect(rendered).toContain("░░░░░░░░");
		expect(rendered).not.toContain("요청 처리 중이다.");
		expect(rendered).not.toContain("Working on:");
		clearOverviewUi(new Set(), ctx);
		const workCtx = stubContext();
		expect(previewOverviewFromInput(workCtx, "배포 작업 해줘")).toBe(true);
		expect(renderPreview(workCtx)).not.toContain("요청 처리 중이다.");
	});
	it("strips greeting plus polite wrapper without breaking Hello World requests", () => {
		const helloPrompt = stubContext();
		expect(previewOverviewFromInput(helloPrompt, "Hello, can you compare the two branches and summarize the diff, please?")).toBe(true);
		expect(renderPreview(helloPrompt)).toContain("compare the two branches and summarize the diff");
		clearOverviewUi(new Set(), helloPrompt);
		const helloNoComma = stubContext();
		expect(previewOverviewFromInput(helloNoComma, "Hello can you compare the two branches and summarize the diff, please?")).toBe(true);
		expect(renderPreview(helloNoComma)).toContain("compare the two branches and summarize the diff");
		clearOverviewUi(new Set(), helloNoComma);
		const heyPlease = stubContext();
		expect(previewOverviewFromInput(heyPlease, "Hey please compare the two branches, please")).toBe(true);
		expect(renderPreview(heyPlease)).toContain("compare the two branches");
		clearOverviewUi(new Set(), heyPlease);
		const heyImperative = stubContext();
		expect(previewOverviewFromInput(heyImperative, "Hey compare the two branches, please")).toBe(true);
		expect(renderPreview(heyImperative)).toContain("compare the two branches");
		clearOverviewUi(new Set(), heyImperative);
		const helloWorld = stubContext();
		expect(previewOverviewFromInput(helloWorld, "Hello, World app 만들어줘")).toBe(true);
		expect(renderPreview(helloWorld)).toContain("Hello, World app");
		clearOverviewUi(new Set(), helloWorld);
		const helloWorldPlease = stubContext();
		expect(previewOverviewFromInput(helloWorldPlease, "Hello, World app please")).toBe(true);
		expect(renderPreview(helloWorldPlease)).toContain("Hello, World app");
	});
	it("ignores empty commands, greetings, and already-persisted overviews", () => {
		expect(previewOverviewFromInput(stubContext(), "/help")).toBe(false);
		expect(previewOverviewFromInput(stubContext(), "안녕")).toBe(false);
		expect(previewOverviewFromInput(stubContext(), "!!!")).toBe(false);
		expect(previewOverviewFromInput(stubContext(), "\"\"")).toBe(false);
		expect(previewOverviewFromInput(stubContext(), "```ts\nconst x = 1;\n```")).toBe(false);
		expect(previewOverviewFromInput(stubContext([{ type: "custom", id: "ov1", customType: "auto-session-title.overview", data: { title: "기존 제목", summary: ["기존 요약"] } }]), "다른 요청")).toBe(false);
	});
	it("does not leak a preview into another tree view with no persisted overview", () => {
		const first = stubContext();
		previewOverviewFromInput(first, "브랜치 A 미리보기");
		const second = stubContext([], { sessionManager: { ...stubContext().sessionManager, getSessionId: () => "session-1", getSessionName: () => undefined } });
		restoreOverview(stubRuntime(), second);
		expect(first.overlay.handle.hide).toHaveBeenCalled();
		expect(second.ui.custom).not.toHaveBeenCalled();
		expect(second.ui.setWidget).not.toHaveBeenCalled();
	});
});
