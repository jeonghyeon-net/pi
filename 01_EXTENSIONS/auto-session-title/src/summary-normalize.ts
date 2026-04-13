import type { SessionOverview } from "./overview-types.js";

const EMPTY_STATE_PATTERNS = [
	/실질적인 작업.*정해지지 않/u,
	/인사 외에 이어갈 과제가 없/u,
	/목표와 맥락부터 새로 정/u,
	/no (?:substantial|concrete) task/i,
	/nothing to resume/i,
	/start .*goal and context/i,
];
const LONG_SUMMARY_LINE = 160;
const SENTENCE_SPLIT = /(?<=[.!?])\s+/u;

function isEmptyStateLine(line: string): boolean {
	return EMPTY_STATE_PATTERNS.some((pattern) => pattern.test(line));
}

function splitLongSummaryLine(line: string): string[] {
	if (line.length < LONG_SUMMARY_LINE) return [line];
	const sentences = line.split(SENTENCE_SPLIT).map((part) => part.trim()).filter(Boolean);
	if (sentences.length < 2) return [line];
	const summary = sentences.slice(0, 4);
	if (sentences.length > 4) summary[3] = `${summary[3]} ${sentences.slice(4).join(" ")}`;
	return summary;
}

export function normalizeOverviewSummary(overview: SessionOverview): SessionOverview {
	const summary = overview.summary.filter((line) => !isEmptyStateLine(line));
	const splitSummary = summary.length === 1 ? splitLongSummaryLine(summary[0]!) : summary;
	return splitSummary.length === overview.summary.length && splitSummary.every((line, index) => line === overview.summary[index])
		? overview
		: { ...overview, summary: splitSummary };
}
