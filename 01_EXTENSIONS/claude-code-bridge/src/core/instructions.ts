import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileExists, readText, resolveRealPath, walkAncestors } from "./fs-utils.js";
import { isImportAllowed, resolveImportPath } from "./pathing.js";
import type { IncludeRef, Scope } from "./types.js";

interface ExpandedInstruction {
	text: string;
	includes: IncludeRef[];
}

export function stripHtmlComments(content: string): string {
	return content.replace(/<!--([\s\S]*?)-->/g, "");
}

export function expandImports(content: string, filePath: string, scope: Scope, ownerRoot: string): string {
	return expandImportsWithTrace(content, filePath, scope, ownerRoot).text;
}

export function expandImportsWithTrace(content: string, filePath: string, scope: Scope, ownerRoot: string, depth = 0, seen = new Set<string>()): ExpandedInstruction {
	if (depth >= 5) return { text: content, includes: [] };
	const importRegex = /(^|[\s(])@([^\s)]+)/gm;
	const includes: IncludeRef[] = [];
	const text = content.replace(importRegex, (match, prefix: string, rawToken: string) => {
		const token = rawToken.trim();
		if (!token || token.includes("://")) return match;
		const resolved = resolveImportPath(token, filePath);
		if (!fileExists(resolved)) return match;
		const canonical = resolveRealPath(resolved);
		const allowedRoot = scope === "user" ? ownerRoot : resolveRealPath(ownerRoot);
		if (!isImportAllowed(scope, allowedRoot, canonical)) return `${prefix}[Blocked import outside allowed root: ${token}]`;
		if (seen.has(canonical)) return `${prefix}[Skipped recursive import: ${token}]`;
		const nextContent = readText(canonical);
		if (!nextContent) return match;
		const nextSeen = new Set(seen);
		nextSeen.add(canonical);
		includes.push({ path: canonical, parentPath: filePath });
		const next = expandImportsWithTrace(nextContent, canonical, scope, ownerRoot, depth + 1, nextSeen);
		includes.push(...next.includes);
		return `${prefix}\n\n[Imported from ${canonical}]\n${next.text.trim()}\n`;
	});
	return { text, includes };
}

export function parseFrontmatter(content: string): { body: string; paths: string[] } {
	if (!content.startsWith("---\n")) return { body: content, paths: [] };
	const end = content.indexOf("\n---\n", 4);
	if (end === -1) return { body: content, paths: [] };
	const raw = content.slice(4, end).split(/\r?\n/);
	const paths: string[] = [];
	let inPaths = false;
	for (const line of raw) {
		const trimmed = line.trim();
		if (!inPaths && trimmed === "paths:") inPaths = true;
		else if (inPaths && trimmed.startsWith("- ")) paths.push(trimmed.slice(2).replace(/^['"]|['"]$/g, ""));
		else if (inPaths && trimmed && /^[A-Za-z0-9_-]+:/.test(trimmed)) break;
	}
	return { body: content.slice(end + 5), paths: paths.filter(Boolean) };
}

export function findProjectRoot(cwd: string): string {
	const ancestors = [...walkAncestors(cwd)].reverse();
	for (const dir of ancestors) if (fileExists(join(dir, ".git"))) return dir;
	for (const dir of ancestors) {
		const names = ["CLAUDE.md", "CLAUDE.local.md", ".claude/CLAUDE.md"];
		if (names.some((name) => fileExists(join(dir, name))) || hasClaudeSettings(dir)) return dir;
	}
	return resolve(cwd);
}

function hasClaudeSettings(dir: string) {
	const claudeDir = join(dir, ".claude");
	if (!fileExists(claudeDir)) return false;
	try {
		return readdirSync(claudeDir).some((name) => /^settings.*\.json$/u.test(name));
	} catch {
		return false;
	}
}

export function buildInstructionSection(title: string, path: string, content: string): string {
	return `### ${title}\nSource: ${path}\n\n${content.trim()}`;
}
