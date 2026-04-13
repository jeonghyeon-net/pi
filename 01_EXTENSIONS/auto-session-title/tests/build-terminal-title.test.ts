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

	it("renders skeleton lines when there is no summary yet", () => {
		expect(buildOverviewWidgetText(undefined, "임시 제목")).toBe(["임시 제목", "░░░░░░░░░░░░░░", "░░░░░░░░"].join("\n"));
		expect(buildOverviewWidgetText()).toBe(["세션 요약", "░░░░░░░░░░░░░░", "░░░░░░░░"].join("\n"));
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
	it("sizes the overlay responsively and keeps the left edge even", () => {
		const evenWidth = getOverviewOverlayOptions(128);
		expect(evenWidth.row).toBe(1);
		expect(evenWidth.col).toBe(48);
		expect(evenWidth.width).toBe(80);
		expect(evenWidth.maxHeight).toBeUndefined();
		expect(evenWidth.nonCapturing).toBe(true);
		expect(getOverviewOverlayOptions(107).width).toBe(60);
		expect(getOverviewOverlayOptions(50).width).toBe(50);
		expect(getOverviewOverlayOptions(1).width).toBe(1);
		const oddWidth = getOverviewOverlayOptions(129);
		expect(oddWidth.col).toBe(48);
		expect(getOverviewOverlayOptions(180).width).toBe(96);
	});

	it("falls back to top-right anchoring when terminal width is unavailable", () => {
		const options = getOverviewOverlayOptions(undefined);
		expect(options.anchor).toBe("top-right");
		expect(options.width).toBe(80);
		expect(options.nonCapturing).toBe(true);
	});
});
