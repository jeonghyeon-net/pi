import { describe, expect, it } from "vitest";
import { buildOverviewPrompt, parseOverviewResponse } from "../src/summarize.js";

describe("buildOverviewPrompt", () => {
	it("tells the model to produce cohesive current-state prose instead of a turn log", () => {
		const prompt = buildOverviewPrompt("Recent updates", { title: "기존 제목", summary: ["오버레이 배치를 정리함", "resume 복원을 붙임"] });
		expect(prompt).toContain("Update the previous summary into a cohesive current-state brief, not a turn-by-turn log.");
		expect(prompt).toContain("Preserve still-relevant goals, decisions, constraints, blockers, and completed work");
		expect(prompt).toContain("Fold recent updates into the current state instead of listing events in order.");
		expect(prompt).toContain("Previous title: 기존 제목");
		expect(prompt).toContain("rewrite them into cohesive prose if needed");
		expect(prompt).toContain("resume 복원을 붙임");
	});

	it("formats an empty previous summary without crashing", () => {
		const prompt = buildOverviewPrompt("Recent updates", { title: "기존 제목", summary: [] });
		expect(prompt).toContain("Previous title: 기존 제목");
		expect(prompt).toContain("\n(none)");
	});

	it("falls back when no previous overview exists", () => {
		expect(buildOverviewPrompt("Recent updates")).toContain("Previous summary: (none)");
	});
});

describe("parseOverviewResponse", () => {
	it("merges line-broken summaries into cohesive paragraphs", () => {
		expect(parseOverviewResponse(["TITLE: 세션 제목", "SUMMARY:", "현재 목표는 요약 위젯 정리", "우상단 UI 위치를 확정함", "제목 동기화가 남아 있음", "체크포인트 전진도 유지해야 함", "긴 컨텍스트도 남겨야 함"].join("\n"))).toEqual({ title: "세션 제목", summary: ["현재 목표는 요약 위젯 정리 우상단 UI 위치를 확정함 제목 동기화가 남아 있음 체크포인트 전진도 유지해야 함 긴 컨텍스트도 남겨야 함"] });
	});

	it("preserves explicitly separated paragraphs", () => {
		expect(parseOverviewResponse(["TITLE: 세션 제목", "SUMMARY:", "현재 목표는 요약 위젯 정리", "우상단 UI 위치를 확정함", "", "남은 일은 제목 동기화와 체크포인트 검증이다"].join("\n"))).toEqual({ title: "세션 제목", summary: ["현재 목표는 요약 위젯 정리 우상단 UI 위치를 확정함", "남은 일은 제목 동기화와 체크포인트 검증이다"] });
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
