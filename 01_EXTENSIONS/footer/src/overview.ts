import { truncateToWidth } from "@mariozechner/pi-tui";
import type { FooterOverview, FooterStatusData, FooterTheme } from "./types.js";
import { sanitizeStatusText } from "./utils.js";

const OVERVIEW_TITLE_KEY = "auto-session-title.overview.title";
const OVERVIEW_SUMMARY_PREFIX = "auto-session-title.overview.summary.";
const OVERVIEW_SUMMARY_DELIMITER = " · ";

function parseOverviewIndex(key: string): number | undefined {
	const index = Number.parseInt(key.slice(OVERVIEW_SUMMARY_PREFIX.length), 10);
	return Number.isInteger(index) && index >= 0 ? index : undefined;
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
	return summary.length > 0 ? { title, summary } : undefined;
}

export function buildFooterOverviewLines(theme: FooterTheme, overview: FooterOverview, width: number): string[] {
	const lines: string[] = [];
	if (overview.title) lines.push(truncateToWidth(theme.bold(theme.fg("accent", ` ${overview.title}`)), width));
	if (overview.summary.length > 0) lines.push(truncateToWidth(theme.fg("dim", ` ${overview.summary.join(OVERVIEW_SUMMARY_DELIMITER)}`), width));
	return lines;
}
