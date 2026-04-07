import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileExists, walkAncestors } from "../core/fs-utils.js";
import { findProjectRoot } from "../core/instructions.js";
import { isPathInside } from "../core/pathing.js";
import type { Scope } from "../core/types.js";

export interface SettingsEntry {
	path: string;
	scope: Scope;
}

export function discoverSettingsEntries(cwd: string): SettingsEntry[] {
	const entries: SettingsEntry[] = [];
	const home = process.env.HOME || "";
	if (home) entries.push(...readUserSettings(home));
	for (const dir of projectDirs(cwd)) entries.push(...readProjectSettings(dir));
	return entries.filter((entry) => fileExists(entry.path));
}

export function listConfigFiles(cwd: string): SettingsEntry[] {
	const entries: SettingsEntry[] = [];
	const home = process.env.HOME || "";
	if (home) entries.push(...readUserSettings(home));
	for (const dir of projectDirs(cwd)) entries.push(...readProjectSettings(dir));
	return dedupe(entries);
}

function readUserSettings(home: string): SettingsEntry[] {
	return readSettings(join(home, ".claude"), "user");
}

function readProjectSettings(dir: string): SettingsEntry[] {
	return readSettings(join(dir, ".claude"));
}

function readSettings(dir: string, overrideScope?: Scope): SettingsEntry[] {
	if (!fileExists(dir)) return [];
	return readdirSync(dir).filter((name) => /^settings.*\.json$/u.test(name)).sort().map((name) => ({ path: join(dir, name), scope: overrideScope || classifyScope(name) }));
}

function classifyScope(name: string): Scope {
	return basename(name).includes(".local.") || name === "settings.local.json" ? "local" : "project";
}

function projectDirs(cwd: string) {
	const projectRoot = findProjectRoot(cwd);
	return walkAncestors(cwd).filter((dir) => dir === projectRoot || isPathInside(projectRoot, dir));
}

function dedupe(entries: SettingsEntry[]): SettingsEntry[] {
	const seen = new Set<string>();
	return entries.filter((entry) => seen.has(entry.path) ? false : (seen.add(entry.path), true));
}
