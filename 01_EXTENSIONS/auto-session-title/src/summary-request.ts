import type { SessionOverview } from "./overview-types.js";
import { normalizeTitle } from "./title.js";

const REQUEST_PREFIX = /^(?:요청|Request):\s*/u;
const REQUEST_CONTEXT = /^(?:(?:요청|Request):|(?:사용자(?:는|가)?|User|The user)(?:\s|$)|(?:현재\s*)?목표(?:는|:))/iu;
const REQUEST_INTENT = /(하려고 한다|원한다|요청(?:했다|함)?|asked to|wants to|needs to|goal is|trying to)/iu;
const REQUEST_MAX_LENGTH = 72;
const COMPARE_MAX_LENGTH = 200;
const GENERIC_TOKENS = new Set(["current", "goal", "the", "user", "사용자", "현재", "목표"]);

function extractLatestUserRequest(recentText: string): string | undefined {
	const lines = recentText.split(/\r?\n/);
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i]!.trim();
		if (!line.startsWith("User: ")) continue;
		const request = normalizeTitle(line.slice(6), REQUEST_MAX_LENGTH);
		if (request) return request;
	}
}

function buildRequestLine(request: string): string {
	return `${/[가-힣]/u.test(request) ? "요청" : "Request"}: ${request}`;
}

function normalizeToken(token: string): string {
	return token.toLowerCase().replace(/(?:에서|으로|에게|까지|부터|처럼|보다|은|는|이|가|을|를|에|로|와|과|도|만|의)$/u, "");
}

function tokenize(text: string): string[] {
	return [
		...new Set(
			(normalizeTitle(text.replace(REQUEST_PREFIX, ""), COMPARE_MAX_LENGTH) ?? "")
				.split(/[^\p{L}\p{N}]+/u)
				.map(normalizeToken)
				.filter((token) => token.length > 1 && !GENERIC_TOKENS.has(token)),
		),
	];
}

function overlapsEnough(left: string, right: string): boolean {
	const leftTokens = new Set(tokenize(left));
	const rightTokens = tokenize(right);
	const shared = rightTokens.filter((token) => leftTokens.has(token)).length;
	return shared >= 2 && shared / Math.min(leftTokens.size, rightTokens.length) >= 0.6;
}

function isRequestSummaryLine(line: string, request: string): boolean {
	return REQUEST_PREFIX.test(line) || (overlapsEnough(line, request) && (REQUEST_CONTEXT.test(line) || REQUEST_INTENT.test(line)));
}

export function ensureOverviewRequestLine(overview: SessionOverview, recentText: string): SessionOverview {
	if (overview.summary.length === 0) return overview;
	const request = extractLatestUserRequest(recentText);
	if (!request) return overview;
	const requestLines = overview.summary.filter((line) => isRequestSummaryLine(line, request));
	const otherLines = overview.summary.filter((line) => !isRequestSummaryLine(line, request));
	const summary = overlapsEnough(overview.title, request) && otherLines.length > 0
		? otherLines
		: requestLines.length > 0
			? [requestLines[0]!, ...otherLines]
			: [buildRequestLine(request), ...overview.summary].slice(0, 5);
	return summary.length === overview.summary.length && summary.every((line, index) => line === overview.summary[index])
		? overview
		: { ...overview, summary };
}
