import { describe, expect, it } from "vitest";
import { buildOverviewPrompt, parseOverviewResponse } from "../src/summarize.js";

describe("buildOverviewPrompt", () => {
	it("tells the model to produce scan-friendly current-state bullets for future recall", () => {
		const prompt = buildOverviewPrompt("Recent updates", { title: "기존 제목", summary: ["오버레이 배치를 정리함", "resume 복원을 붙임"] });
		expect(prompt).toContain("Update the previous summary into a cohesive current-state brief, not a turn-by-turn log.");
		expect(prompt).toContain("prioritize what they would want to remember when resuming later");
		expect(prompt).toContain("Preserve still-relevant goals, decisions, constraints, blockers, and completed work");
		expect(prompt).toContain("Ignore routine greetings, acknowledgements, current-branch checks");
		expect(prompt).toContain("If the recent updates contain no durable change, keep the previous title and summary unchanged.");
		expect(prompt).toContain("Write SUMMARY as 2-5 short `- ` bullets when durable state exists.");
		expect(prompt).toContain("Make the user's current request or goal obvious, but do not restate the same point in both TITLE and the first bullet.");
		expect(prompt).toContain("Keep bullets scan-friendly");
		expect(prompt).toContain("leave SUMMARY blank");
		expect(prompt).toContain("Keep the summary compact enough to scan quickly");
		expect(prompt).toContain("Previous title: 기존 제목");
		expect(prompt).toContain("rewrite them into clean scan-friendly bullets if needed");
		expect(prompt).toContain("resume 복원을 붙임");
	});

	it("asks for aggressive compaction once the stored summary has grown too long", () => {
		const prompt = buildOverviewPrompt("Recent updates", { title: "기존 제목", summary: ["x".repeat(710)] });
		expect(prompt).toContain("Compact it noticeably while preserving only durable context.");
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
	it("preserves bullet lists as separate summary lines", () => {
		expect(parseOverviewResponse(["TITLE: 세션 제목", "SUMMARY:", "- 현재 목표는 요약 위젯 정리", "- 우상단 UI 위치를 확정함", "- 제목 동기화가 남아 있음"].join("\n"))).toEqual({ title: "세션 제목", summary: ["현재 목표는 요약 위젯 정리", "우상단 UI 위치를 확정함", "제목 동기화가 남아 있음"] });
	});

	it("keeps wrapped bullet lines attached to the same summary item", () => {
		expect(parseOverviewResponse(["TITLE: 세션 제목", "SUMMARY:", "- 현재 목표는 요약 위젯 정리", "  footer 아래 표시로 유지", "- 남은 일은 제목 동기화다"].join("\n"))).toEqual({ title: "세션 제목", summary: ["현재 목표는 요약 위젯 정리 footer 아래 표시로 유지", "남은 일은 제목 동기화다"] });
	});

	it("merges line-broken prose summaries into one paragraph when bullets are absent", () => {
		expect(parseOverviewResponse(["TITLE: 세션 제목", "SUMMARY:", "현재 목표는 요약 위젯 정리", "우상단 UI 위치를 확정함", "제목 동기화가 남아 있음", "체크포인트 전진도 유지해야 함", "긴 컨텍스트도 남겨야 함"].join("\n"))).toEqual({ title: "세션 제목", summary: ["현재 목표는 요약 위젯 정리 우상단 UI 위치를 확정함 제목 동기화가 남아 있음 체크포인트 전진도 유지해야 함 긴 컨텍스트도 남겨야 함"] });
	});

	it("preserves explicitly separated paragraphs", () => {
		expect(parseOverviewResponse(["TITLE: 세션 제목", "SUMMARY:", "현재 목표는 요약 위젯 정리", "우상단 UI 위치를 확정함", "", "남은 일은 제목 동기화와 체크포인트 검증이다"].join("\n"))).toEqual({ title: "세션 제목", summary: ["현재 목표는 요약 위젯 정리 우상단 UI 위치를 확정함", "남은 일은 제목 동기화와 체크포인트 검증이다"] });
	});

	it("supports inline SUMMARY without truncating long lines", () => {
		const parsed = parseOverviewResponse(`TITLE: 긴 제목\nSUMMARY: ${"x".repeat(300)}`);
		expect(parsed?.summary).toEqual(["x".repeat(300)]);
	});

	it("returns undefined when title is missing and keeps explicit blank summaries as skeleton-ready state", () => {
		expect(parseOverviewResponse("SUMMARY:\n요약만 있음")).toBeUndefined();
		expect(parseOverviewResponse("TITLE: 제목만")).toBeUndefined();
		expect(parseOverviewResponse("TITLE: 제목\nSUMMARY:")).toEqual({ title: "제목", summary: [] });
		expect(parseOverviewResponse("TITLE: 제목\n현재 상태를 한 줄로 정리")).toEqual({ title: "제목", summary: ["현재 상태를 한 줄로 정리"] });
	});

	it("splits long multi-sentence prose into scan-friendly summary lines", () => {
		expect(parseOverviewResponse("TITLE: 말록스 콘트라 가격 재확인\nSUMMARY: 사용자는 Marleaux Contra 계열 베이스 가격을 재확인 중이다. 신품 기준 현재 다시 검증된 노출 가격은 국내 라이딩베이스 11,682,000원, Thomann 8,999€, John Fox Bass의 2025 Marleaux Contra 5-string $8,799.00이다. 필요하면 다음에 환율 반영 실구매가 비교를 이어갈 수 있다.")).toEqual({ title: "말록스 콘트라 가격 재확인", summary: ["사용자는 Marleaux Contra 계열 베이스 가격을 재확인 중이다.", "신품 기준 현재 다시 검증된 노출 가격은 국내 라이딩베이스 11,682,000원, Thomann 8,999€, John Fox Bass의 2025 Marleaux Contra 5-string $8,799.00이다.", "필요하면 다음에 환율 반영 실구매가 비교를 이어갈 수 있다."] });
	});

	it("caps fallback sentence splitting at five summary lines", () => {
		expect(parseOverviewResponse("TITLE: 긴 요약\nSUMMARY: 첫 문장은 현재 목표와 방향을 길게 설명하는 문장이다. 둘째 문장은 이미 끝낸 검증과 확인 결과를 길게 설명하는 문장이다. 셋째 문장은 남아 있는 제약과 주의사항을 길게 설명하는 문장이다. 넷째 문장은 다음 단계 계획을 길게 설명하는 문장이다. 다섯째 문장은 마지막 줄에 합쳐질 추가 맥락이다. 여섯째 문장도 마지막 줄에 함께 붙어야 하는 추가 맥락이다.")).toEqual({ title: "긴 요약", summary: ["첫 문장은 현재 목표와 방향을 길게 설명하는 문장이다.", "둘째 문장은 이미 끝낸 검증과 확인 결과를 길게 설명하는 문장이다.", "셋째 문장은 남아 있는 제약과 주의사항을 길게 설명하는 문장이다.", "넷째 문장은 다음 단계 계획을 길게 설명하는 문장이다.", "다섯째 문장은 마지막 줄에 합쳐질 추가 맥락이다. 여섯째 문장도 마지막 줄에 함께 붙어야 하는 추가 맥락이다."] });
	});

	it("drops generic empty-session prose so ui can keep skeleton state", () => {
		expect(parseOverviewResponse("TITLE: 대화 시작 상태\nSUMMARY: 아직 실질적인 작업, 목표, 결정사항, 제약, 진행 상황, 막힌 점이 정해지지 않았다. 현재 세션에는 인사 외에 이어갈 과제가 없으므로, 다음에 재개할 때는 무엇을 하려는지 목표와 맥락부터 새로 정하면 된다.")).toEqual({ title: "대화 시작 상태", summary: [] });
	});
});
