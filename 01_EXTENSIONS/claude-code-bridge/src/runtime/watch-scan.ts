import { lstatSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { listConfigFiles } from "../state/settings-discovery.js";
import { findProjectRoot } from "../core/instructions.js";
import type { ConfigSource } from "../core/types.js";

export function scanConfigSnapshot(cwd: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const entry of listConfigFiles(cwd)) out.set(entry.path, signature(entry.path));
	for (const path of listSkillFiles(cwd)) out.set(path, signature(path));
	return out;
}

export function diffSnapshots(before: Map<string, string>, after: Map<string, string>) {
	const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
	return paths.flatMap((path) => before.get(path) === after.get(path) ? [] : [{ path, event: !before.has(path) ? "add" : !after.has(path) ? "unlink" : "change" }]);
}

export function classifyConfigSource(path: string): ConfigSource | undefined {
	const userDir = `${process.env.HOME || ""}/.claude/`;
	if (userDir !== "/.claude/" && path.includes(userDir) && /\/\.claude\/settings.*\.json$/u.test(path)) return "user_settings";
	if (path.endsWith("/.claude/settings.local.json") || path.includes("/.claude/settings.local.")) return "local_settings";
	if (path.endsWith("/.claude/settings.json") || /\/\.claude\/settings.*\.json$/u.test(path)) return "project_settings";
	return path.includes("/.claude/skills/") ? "skills" : undefined;
}

export function scanFileSnapshot(projectRoot: string, basenames: string[], dynamicWatchPaths: string[]): Map<string, string> {
	const out = new Map<string, string>();
	const watchAll = basenames.includes("*");
	if (watchAll || basenames.length > 0) walk(projectRoot, (path) => watchAll || basenames.includes(basename(path)), (path) => out.set(path, signature(path)));
	for (const path of dynamicWatchPaths.map((item) => resolve(item))) collect(path, out);
	return out;
}

function listSkillFiles(cwd: string) {
	const out: string[] = [];
	walk(findProjectRoot(cwd), (path) => path.includes("/.claude/skills/"), (path) => out.push(path));
	return out;
}

function walk(root: string, keep: (path: string) => boolean, onFile: (path: string) => void) {
	for (const entry of safeReadDir(root)) {
		const path = join(root, entry.name);
		if (entry.isDirectory()) {
			if ([".git", "node_modules", "dist", "coverage"].includes(entry.name)) continue;
			walk(path, keep, onFile);
		} else if (entry.isFile() && keep(path)) onFile(path);
	}
}

function collect(path: string, out: Map<string, string>) {
	try {
		const stat = lstatSync(path);
		if (stat.isDirectory()) return walk(path, () => true, (file) => out.set(file, signature(file)));
		if (stat.isFile()) out.set(path, signature(path));
	} catch {
		out.set(path, "missing");
	}
}

function signature(path: string) {
	try { const stat = lstatSync(path); return `${stat.isFile() ? "f" : "d"}:${stat.size}:${Math.floor(stat.mtimeMs)}`; } catch { return "missing"; }
}

function safeReadDir(path: string) {
	try { return readdirSync(path, { withFileTypes: true }); } catch { return []; }
}
