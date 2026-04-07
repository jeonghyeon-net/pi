import { basename, isAbsolute, resolve } from "node:path";
import type { HookDef, HookRunResult } from "../core/types.js";

export function extractFileWatchBasenames(hooks: Array<Pick<HookDef, "matcher">>): string[] {
	const tokens = hooks.flatMap((hook) => literalBasenames(hook.matcher));
	return [...new Set(tokens.length > 0 ? tokens : [])];
}

export function literalBasenames(matcher: string | undefined): string[] {
	if (!matcher || matcher === "" || matcher === "*") return ["*"];
	const tokens = matcher.split("|").map((item) => item.trim()).filter(Boolean);
	return tokens.every(isLiteralFileName) ? [...new Set(tokens.map((item) => basename(item)))] : ["*"];
}

export function replaceDynamicWatchPaths(results: HookRunResult[], cwd: string): string[] | undefined {
	for (const result of results) {
		const value = result.parsedJson?.watchPaths;
		if (!Array.isArray(value)) continue;
		return value.filter((item: unknown): item is string => typeof item === "string").map((item) => isAbsolute(item) ? item : resolve(cwd, item));
	}
	return undefined;
}

function isLiteralFileName(value: string): boolean {
	return !/[()[\]{}+?^$\\*]/u.test(value);
}
