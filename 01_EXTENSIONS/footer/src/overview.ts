import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import type { FooterOverview, FooterStatusData, FooterTheme } from "./types.js";
import { sanitizeStatusText } from "./utils.js";

const OVERVIEW_TITLE_KEY = "auto-session-title.overview.title";
const OVERVIEW_SUMMARY_PREFIX = "auto-session-title.overview.summary.";
const OVERVIEW_BULLET_PREFIX = "  • ";
const OVERVIEW_CONTINUATION_PREFIX = "    ";
const OVERVIEW_SKELETON_CHAR = "░";

function parseOverviewIndex(key: string): number | undefined {
	const index = Number.parseInt(key.slice(OVERVIEW_SUMMARY_PREFIX.length), 10);
	return Number.isInteger(index) && index >= 0 ? index : undefined;
}

function wrapFooterText(text: string, width: number): string[] {
	return wrapTextWithAnsi(text, Math.max(1, width)).map((line) => truncateToWidth(line, width));
}

function wrapOverviewLine(prefix: string, text: string, width: number): string[] {
	if (width <= visibleWidth(prefix)) return wrapFooterText(text, width);
	const bodyWidth = Math.max(1, width - visibleWidth(prefix));
	return wrapTextWithAnsi(text, bodyWidth).map((line, index) => `${index === 0 ? prefix : OVERVIEW_CONTINUATION_PREFIX}${line}`);
}

function buildOverviewSkeletonLines(theme: FooterTheme, width: number): string[] {
	const lineWidth = Math.max(4, width - 1);
	const long = truncateToWidth(` ${OVERVIEW_SKELETON_CHAR.repeat(Math.min(16, lineWidth))}`, width);
	const short = truncateToWidth(` ${OVERVIEW_SKELETON_CHAR.repeat(Math.min(10, lineWidth))}`, width);
	return [theme.fg("dim", long), theme.fg("dim", short)];
}

export function isOverviewStatusKey(key: string): boolean {
	return key === OVERVIEW_TITLE_KEY || key.startsWith(OVERVIEW_SUMMARY_PREFIX);
}

export function buildFooterOverview(footerData: FooterStatusData): FooterOverview | undefined {
	const statuses = footerData.getExtensionStatuses();
	const title = sanitizeStatusText(statuses.get(OVERVIEW_TITLE_KEY) ?? "") || undefined;
	const summary = Array.from(statuses.entries())
		.filter(([key]) => key.startsWith(OVERVIEW_SUMMARY_PREFIX))
		.map(([key, text]) => [parseOverviewIndex(key), sanitizeStatusText(text)] as const)
		.filter((entry): entry is readonly [number, string] => typeof entry[0] === "number" && Boolean(entry[1]))
		.sort((left, right) => left[0] - right[0])
		.map(([, text]) => text);
	return title || summary.length > 0 ? { title, summary } : undefined;
}

export function buildFooterOverviewLines(theme: FooterTheme, overview: FooterOverview, width: number): string[] {
	const lines: string[] = [];
	if (overview.title) lines.push(...wrapFooterText(theme.bold(theme.fg("accent", ` ${overview.title}`)), width));
	if (overview.summary.length === 0) return [...lines, ...buildOverviewSkeletonLines(theme, width)];
	for (const line of overview.summary) lines.push(...wrapOverviewLine(theme.fg("dim", OVERVIEW_BULLET_PREFIX), line, width));
	return lines;
}
