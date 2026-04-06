import { visibleWidth } from "@mariozechner/pi-tui";
import type { FooterContext, FooterStatusData, FooterTheme, ThemeColor } from "./types.js";
import { BAR_WIDTH, NAME_STATUS_KEY } from "./types.js";
import { clamp, getFolderName, sanitizeStatusText } from "./utils.js";

export function buildFooterStatusEntries(ctx: FooterContext, footerData: FooterStatusData) {
	const statusEntries = Array.from(footerData.getExtensionStatuses().entries())
		.filter(([key]) => key !== NAME_STATUS_KEY)
		.map(([key, text]) => [key, sanitizeStatusText(text)] as const)
		.filter(([, text]) => Boolean(text));
	const sessionName = ctx.sessionManager.getSessionName();
	if (sessionName) {
		statusEntries.unshift([NAME_STATUS_KEY, sessionName]);
	}
	return statusEntries;
}

export function buildFooterLineParts(
	theme: FooterTheme,
	ctx: FooterContext,
	footerData: FooterStatusData,
	repoName: string | null,
	hasDirtyChanges: boolean,
	width: number,
) {
	const model = ctx.model?.id || "no-model";
	const usage = ctx.getContextUsage();
	const pct = clamp(Math.round(usage?.percent ?? 0), 0, 100);
	const filled = Math.round((pct / 100) * BAR_WIDTH);
	const bar = "#".repeat(filled) + "-".repeat(BAR_WIDTH - filled);

	const statusEntries = buildFooterStatusEntries(ctx, footerData);
	const statusTexts = statusEntries.map(([, text]) => text);
	const active = statusTexts.filter((s) => /research(ing)?/i.test(s)).length;
	const done = statusTexts.filter((s) => /(^|\s)(done|✓)(\s|$)/i.test(s)).length;

	const folder = getFolderName(ctx.sessionManager.getCwd());
	const displayName = repoName || folder;
	const branch = footerData.getGitBranch();
	const branchText = branch ?? "no-branch";
	const dirtyMark = branch && hasDirtyChanges ? theme.fg("warning", "*") : "";

	const left =
		theme.fg("dim", ` ${model}`) +
		theme.fg("muted", " · ") +
		theme.fg("accent", `${displayName} - `) +
		dirtyMark +
		theme.fg("accent", branchText);

	const mid =
		active > 0
			? theme.fg("accent", ` ◉ ${active} researching`)
			: done > 0
				? theme.fg("success", ` ✓ ${done} done`)
				: "";

	const remaining = 100 - pct;
	const barColor: ThemeColor = remaining <= 15 ? "error" : remaining <= 40 ? "warning" : "dim";
	const right = theme.fg(barColor, `[${bar}] ${pct}% `);

	const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(mid) - visibleWidth(right)));
	return { statusEntries, left, mid, right, pad };
}
