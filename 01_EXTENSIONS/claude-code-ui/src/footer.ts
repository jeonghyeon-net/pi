import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { colorizeBgRgb } from "./ansi.js";
import { getProjectName } from "./header.js";

const FILL_BG: [number, number, number] = [215, 119, 87];

function paintBase(theme: Theme, fg: "muted" | "text", text: string) {
	return theme.bg("selectedBg", theme.fg(fg, text));
}

function paintFill(theme: Theme, text: string) {
	return colorizeBgRgb(theme.fg("text", text), FILL_BG);
}

function clampPercent(percent: number | null | undefined) {
	if (percent == null) return null;
	return Math.max(0, Math.min(100, Math.round(percent)));
}

function renderContextBadge(theme: Theme, percent: number | null | undefined) {
	const value = clampPercent(percent);
	const label = `context ${value == null ? "--" : `${value}%`}`;
	if (value == null || value <= 0) return paintBase(theme, "muted", ` ${label} `);
	if (value >= 100) return paintFill(theme, ` ${label} `);
	const fill = Math.min(label.length - 1, Math.max(1, Math.ceil((label.length * value) / 100)));
	return [paintBase(theme, "muted", " "), paintFill(theme, label.slice(0, fill)), paintBase(theme, "muted", label.slice(fill)), paintBase(theme, "muted", " ")].join("");
}

export function createClaudeFooter(ctx: ExtensionContext) {
	const projectName = getProjectName(ctx);
	return (tui: { requestRender(): void }, theme: Theme, footerData: {
		onBranchChange(fn: () => void): () => void;
		getGitBranch(): string | null;
	}) => ({
		dispose: footerData.onBranchChange(() => tui.requestRender()),
		invalidate() {},
		render(width: number) {
			const branch = footerData.getGitBranch();
			const usage = ctx.getContextUsage();
			const leftParts = [theme.fg("text", projectName), branch ? theme.fg("dim", branch) : ""];
			const left = leftParts.filter(Boolean).join(theme.fg("dim", " · "));
			const rightParts = [theme.fg("muted", ctx.model?.id ?? "no-model"), renderContextBadge(theme, usage?.percent)];
			const right = rightParts.join("  ");
			const gap = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
			return [truncateToWidth(left + " ".repeat(gap) + right, width, "")];
		},
	});
}
