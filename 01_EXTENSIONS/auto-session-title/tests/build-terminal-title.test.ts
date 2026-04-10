import { describe, expect, it } from "vitest";
import { buildOverviewBodyLines, buildOverviewWidgetText, getOverviewOverlayOptions } from "../src/handlers.js";

describe("buildOverviewWidgetText", () => {
	it("renders the title first and summary lines after it", () => {
		expect(buildOverviewWidgetText({ title: "세션 제목", summary: ["오버레이 배치를 정리함", "resume 복원을 붙임"] })).toBe([
			"세션 제목",
			"오버레이 배치를 정리함",
			"resume 복원을 붙임",
		].join("\n"));
	});

	it("renders placeholder content with a fallback title", () => {
		expect(buildOverviewWidgetText(undefined, "임시 제목")).toContain("임시 제목\n요약이 아직 없습니다.");
		expect(buildOverviewWidgetText()).toContain("세션 요약\n요약이 아직 없습니다.");
	});
});

describe("buildOverviewBodyLines", () => {
	it("returns all summary lines for the overlay body", () => {
		expect(buildOverviewBodyLines({ title: "작업 제목", summary: ["오버레이 배치를 정리함", "동기화 로직을 점검 중", "추가 컨텍스트를 계속 유지함"] })).toEqual([
			"오버레이 배치를 정리함",
			"동기화 로직을 점검 중",
			"추가 컨텍스트를 계속 유지함",
		]);
	});
});

describe("getOverviewOverlayOptions", () => {
	it("uses a wide non-capturing top-right overlay without a height cap", () => {
		const options = getOverviewOverlayOptions();
		expect(options.anchor).toBe("top-right");
		expect(options.width).toBe(64);
		expect(options.minWidth).toBe(48);
		expect(options.maxHeight).toBeUndefined();
		expect(options.nonCapturing).toBe(true);
		expect(options.visible?.(120, 40)).toBe(true);
		expect(options.visible?.(90, 40)).toBe(false);
	});
});
