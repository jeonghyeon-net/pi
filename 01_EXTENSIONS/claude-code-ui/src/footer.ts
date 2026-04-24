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

function getModelId(ctx: ExtensionContext, fallback = "no-model") {
	try {
		return ctx.model?.id ?? "no-model";
	} catch {
		return fallback;
	}
}

function getUsagePercent(ctx: ExtensionContext, fallback: number | null = null) {
	try {
		return ctx.getContextUsage()?.percent ?? null;
	} catch {
		return fallback;
	}
}

function getThinkingLevel(ctx: ExtensionContext, fallback: string | null = null) {
	try {
		const branch = ctx.sessionManager.getBranch();
		for (let index = branch.length - 1; index >= 0; index--) {
			const entry = branch[index];
			if (entry?.type === "thinking_level_change") return entry.thinkingLevel;
		}
		return fallback;
	} catch {
		return fallback;
	}
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
	const modelId = getModelId(ctx);
	const thinkingLevel = getThinkingLevel(ctx);
	const usagePercent = getUsagePercent(ctx);
	return (_tui: { requestRender(): void }, theme: Theme, _footerData: {
		onBranchChange(fn: () => void): () => void;
		getGitBranch(): string | null;
	}) => ({
		dispose() {},
		invalidate() {},
		render(width: number) {
			const left = theme.fg("text", projectName);
			const model = theme.fg("muted", getModelId(ctx, modelId));
			const effortLevel = getThinkingLevel(ctx, thinkingLevel);
			const modelParts = [model, effortLevel ? theme.fg("dim", effortLevel) : ""];
			const rightParts = [modelParts.filter(Boolean).join(theme.fg("dim", " · ")), renderContextBadge(theme, getUsagePercent(ctx, usagePercent))];
			const right = rightParts.join("  ");
			const gap = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
			return [truncateToWidth(left + " ".repeat(gap) + right, width, "")];
		},
	});
}
