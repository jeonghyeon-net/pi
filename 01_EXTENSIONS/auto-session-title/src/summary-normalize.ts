import type { SessionOverview } from "./overview-types.js";

const EMPTY_STATE_PATTERNS = [
	/실질적인 작업.*정해지지 않/u,
	/인사 외에 이어갈 과제가 없/u,
	/목표와 맥락부터 새로 정/u,
	/no (?:substantial|concrete) task/i,
	/nothing to resume/i,
	/start .*goal and context/i,
];

function isEmptyStateLine(line: string): boolean {
	return EMPTY_STATE_PATTERNS.some((pattern) => pattern.test(line));
}

export function normalizeOverviewSummary(overview: SessionOverview): SessionOverview {
	const summary = overview.summary.filter((line) => !isEmptyStateLine(line));
	return summary.length === overview.summary.length ? overview : { ...overview, summary };
}
