import type { ExecFn, FooterTheme } from "./types.js";
import { STATUS_STYLE_MAP } from "./types.js";

export function clamp(n: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, n));
}

export function getFolderName(cwd: string): string {
	const parts = cwd.split(/[\\/]/).filter(Boolean);
	return parts.length > 0 ? parts[parts.length - 1] : cwd || "unknown";
}

export function sanitizeStatusText(text: string): string {
	return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

export function styleStatus(theme: FooterTheme, key: string, text: string): string {
	const style = STATUS_STYLE_MAP[key];
	return style ? style(theme, text) : text;
}

export async function getRepoName(cwd: string, exec: ExecFn): Promise<string | null> {
	const result = await exec("git", ["remote", "get-url", "origin"], { cwd });
	if (result.code !== 0 || !result.stdout?.trim()) return null;
	const url = result.stdout.trim();
	const match = url.match(/\/([^/]+?)(?:\.git)?$/);
	if (!match) return null;
	return match[1];
}

export async function hasUncommittedChanges(cwd: string, exec: ExecFn): Promise<boolean> {
	const result = await exec("git", ["status", "--porcelain=1", "--untracked-files=normal"], { cwd });
	if (result.code !== 0) return false;
	return result.stdout.trim().length > 0;
}
