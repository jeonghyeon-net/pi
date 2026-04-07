import { addHookGroups } from "./hook-parser.js";
import { mergeStringArrays } from "./env.js";
import { discoverSettingsEntries } from "./settings-discovery.js";
import { readJson } from "../core/fs-utils.js";
import type { BridgeState, EventName, HookDef } from "../core/types.js";

export interface ParsedSettings {
	settingsFiles: string[];
	hooksByEvent: Map<EventName, HookDef[]>;
	mergedEnv: Record<string, string>;
	httpHookAllowedEnvVars?: string[];
	allowedHttpHookUrls?: string[];
	claudeMdExcludes?: string[];
	disableAllHooks: boolean;
	warnings: string[];
}

export function collectSettings(cwd: string): ParsedSettings {
	const warnings: string[] = [];
	const settingsFiles: string[] = [];
	const hooksByEvent = new Map<EventName, HookDef[]>();
	const mergedEnv: Record<string, string> = {};
	let httpHookAllowedEnvVars: string[] | undefined;
	let allowedHttpHookUrls: string[] | undefined;
	let claudeMdExcludes: string[] | undefined;
	let disableAllHooks = false;
	for (const entry of discoverSettingsEntries(cwd)) {
		const json = readJson(entry.path);
		settingsFiles.push(entry.path);
		if (!json || typeof json !== "object") {
			warnings.push(`Could not parse Claude settings: ${entry.path}`);
			continue;
		}
		if (json.env && typeof json.env === "object") entry.scope === "user" ? Object.entries(json.env).forEach(([key, value]) => typeof value === "string" && (mergedEnv[key] = value)) : warnings.push(`Ignoring project/local Claude env from ${entry.path}; only user-scope env is applied.`);
		httpHookAllowedEnvVars = mergeAllowlist(httpHookAllowedEnvVars, json.httpHookAllowedEnvVars, entry.path, entry.scope, warnings, "Ignoring project/local httpHookAllowedEnvVars from");
		allowedHttpHookUrls = mergeAllowlist(allowedHttpHookUrls, json.allowedHttpHookUrls, entry.path, entry.scope, warnings, "Ignoring project/local allowedHttpHookUrls from");
		claudeMdExcludes = mergeAllowlist(claudeMdExcludes, json.claudeMdExcludes, entry.path, entry.scope, warnings, "Ignoring project/local claudeMdExcludes from");
		if (typeof json.disableAllHooks === "boolean") entry.scope === "user" ? (disableAllHooks = json.disableAllHooks) : warnings.push(`Ignoring project/local disableAllHooks from ${entry.path}.`);
		for (const [eventName, groups] of Object.entries(json.hooks || {})) addHookGroups(eventName, groups, entry.path, entry.scope, warnings, hooksByEvent);
	}
	return { settingsFiles, hooksByEvent, mergedEnv, httpHookAllowedEnvVars, allowedHttpHookUrls, claudeMdExcludes, disableAllHooks, warnings };
}

function mergeAllowlist(base: string[] | undefined, value: unknown, path?: string, scope?: string, warnings?: string[], ignoredPrefix?: string) {
	if (!Array.isArray(value)) return base;
	if (scope && scope !== "user" && warnings && ignoredPrefix) return value.length > 0 ? (warnings.push(`${ignoredPrefix} ${path}.`), base) : base;
	return mergeStringArrays(base, value.filter((item): item is string => typeof item === "string"));
}
