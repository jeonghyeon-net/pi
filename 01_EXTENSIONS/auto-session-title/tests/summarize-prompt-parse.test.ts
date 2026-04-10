import { describe, expect, it } from "vitest";
import { buildOverviewPrompt, parseOverviewResponse } from "../src/summarize.js";

describe("buildOverviewPrompt", () => {
	it("tells the model to preserve relevant context without capping summary length", () => {
		const prompt = buildOverviewPrompt("Recent updates", { title: "기존 제목", summary: ["오버레이 배치를 정리함", "resume 복원을 붙임"] });
		expect(prompt).toContain("Update the previous summary instead of rewriting from scratch.");
		expect(prompt).toContain("Preserve still-relevant goals, decisions, constraints, blockers, and completed work");
		expect(prompt).toContain("Do not artificially limit the number of summary lines");
		expect(prompt).toContain("Previous title: 기존 제목");
		expect(prompt).toContain("resume 복원을 붙임");
	});

	it("falls back when no previous overview exists", () => {
		expect(buildOverviewPrompt("Recent updates")).toContain("Previous summary: (none)");
	});
});

describe("parseOverviewResponse", () => {
	it("parses every structured summary line instead of limiting the count", () => {
		expect(parseOverviewResponse(["TITLE: 세션 제목", "SUMMARY:", "현재 목표는 요약 위젯 정리", "우상단 UI 위치를 확정함", "제목 동기화가 남아 있음", "체크포인트 전진도 유지해야 함", "긴 컨텍스트도 남겨야 함"].join("\n"))).toEqual({ title: "세션 제목", summary: ["현재 목표는 요약 위젯 정리", "우상단 UI 위치를 확정함", "제목 동기화가 남아 있음", "체크포인트 전진도 유지해야 함", "긴 컨텍스트도 남겨야 함"] });
	});

	it("supports inline SUMMARY without truncating long lines", () => {
		const parsed = parseOverviewResponse(`TITLE: 긴 제목\nSUMMARY: ${"x".repeat(300)}`);
		expect(parsed?.summary).toEqual(["x".repeat(300)]);
	});

	it("returns undefined when title or summary is missing", () => {
		expect(parseOverviewResponse("SUMMARY:\n요약만 있음")).toBeUndefined();
		expect(parseOverviewResponse("TITLE: 제목만")).toBeUndefined();
		expect(parseOverviewResponse("TITLE: 제목\n현재 상태를 한 줄로 정리")).toEqual({ title: "제목", summary: ["현재 상태를 한 줄로 정리"] });
	});
});
