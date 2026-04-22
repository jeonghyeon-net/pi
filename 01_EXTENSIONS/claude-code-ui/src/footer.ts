import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { getProjectName } from "./header.js";

function renderContextBadge(theme: Theme, percent: number | null | undefined) {
	const rounded = percent == null ? "--" : `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
	return theme.bg("selectedBg", theme.fg("muted", ` context ${rounded} `));
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
