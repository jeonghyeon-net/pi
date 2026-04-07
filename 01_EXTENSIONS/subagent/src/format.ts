import type { UsageStats } from "./types.js";

export function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return String(n);
}

export function formatUsage(stats: UsageStats): string {
	return `${formatTokens(stats.inputTokens)} in / ${formatTokens(stats.outputTokens)} out / ${stats.turns} turns`;
}

export function formatDuration(ms: number): string {
	const sec = Math.floor(ms / 1000);
	if (sec < 60) return `${sec}s`;
	return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export function singleLine(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

export function previewText(text: string | undefined, max = 80): string {
	if (!text) return "";
	const normalized = singleLine(text);
	if (normalized.length <= max) return normalized;
	return `${normalized.slice(0, Math.max(1, max - 1))}…`;
}
