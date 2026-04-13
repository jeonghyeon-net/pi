import type { OverviewContext, SessionOverview } from "./overview-types.js";

const OVERVIEW_STATUS_TITLE_KEY = "auto-session-title.overview.title";
const OVERVIEW_STATUS_SUMMARY_PREFIX = "auto-session-title.overview.summary.";

let activeOverviewStatusKeys: string[] = [];

function clearStatusKeys(ctx: OverviewContext, keys: readonly string[]): void {
	for (const key of keys) ctx.ui.setStatus!(key, undefined);
}

export function syncOverviewStatus(ctx: OverviewContext, overview?: SessionOverview, fallbackTitle?: string): boolean {
	if (!ctx.hasUI || typeof ctx.ui.setStatus !== "function") return false;
	const title = overview?.title || fallbackTitle;
	const entries: Array<readonly [string, string]> = [];
	if (title) entries.push([OVERVIEW_STATUS_TITLE_KEY, title]);
	for (const [index, line] of (overview?.summary ?? []).entries()) {
		entries.push([`${OVERVIEW_STATUS_SUMMARY_PREFIX}${index}`, line]);
	}
	const nextKeys = entries.map(([key]) => key);
	clearStatusKeys(ctx, activeOverviewStatusKeys.filter((key) => !nextKeys.includes(key)));
	for (const [key, text] of entries) ctx.ui.setStatus(key, text);
	activeOverviewStatusKeys = nextKeys;
	return true;
}

export function hasActiveOverviewStatus(): boolean {
	return activeOverviewStatusKeys.length > 0;
}

export function clearOverviewStatus(ctx?: OverviewContext): void {
	if (!ctx) {
		activeOverviewStatusKeys = [];
		return;
	}
	if (ctx.hasUI && typeof ctx.ui.setStatus === "function") clearStatusKeys(ctx, activeOverviewStatusKeys);
	activeOverviewStatusKeys = [];
}
