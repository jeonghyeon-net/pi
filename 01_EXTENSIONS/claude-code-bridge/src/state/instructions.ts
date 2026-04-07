import { join } from "node:path";
import { listMarkdownFiles, readText, fileExists, walkAncestors } from "../core/fs-utils.js";
import { buildInstructionSection, expandImportsWithTrace, findProjectRoot, parseFrontmatter, stripHtmlComments } from "../core/instructions.js";
import { matchesAbsoluteGlobs } from "../core/globs.js";
import { isPathInside, scopeLabel, sha } from "../core/pathing.js";
import type { Block, InstructionLoad, Scope } from "../core/types.js";

export interface InstructionState {
	instructionFiles: string[];
	instructions: Block[];
	unconditionalPromptText: string;
	conditionalRules: Block[];
	eagerLoads: InstructionLoad[];
}

export function collectInstructions(cwd: string, excludes: string[] | undefined): InstructionState {
	const projectRoot = findProjectRoot(cwd);
	const instructionFiles: string[] = [];
	const instructions: Block[] = [];
	const add = (path: string, scope: Scope, kind: Block["kind"], ownerRoot: string, content: string, globs: string[] = []) => {
		if (shouldSkip(path, excludes)) return;
		const expanded = expandImportsWithTrace(stripHtmlComments(content), path, scope, ownerRoot);
		const text = expanded.text.trim();
		if (!text) return;
		instructions.push({ id: sha(`${path}:${globs.join(",")}`), path, scope, kind, ownerRoot, content: text, conditionalGlobs: globs, includes: expanded.includes });
		instructionFiles.push(path);
	};
	loadUserFiles(add, excludes);
	loadAncestorFiles(cwd, projectRoot, add, excludes);
	const unconditionalPromptText = instructions.filter((item) => item.conditionalGlobs.length === 0).map((item) => buildInstructionSection(item.kind === "rule" ? `Claude rule (${scopeLabel(item.scope)})` : `Claude instructions (${scopeLabel(item.scope)})`, item.path, item.content)).join("\n\n");
	const conditionalRules = instructions.filter((item) => item.conditionalGlobs.length > 0);
	const eagerLoads = instructions.filter((item) => item.conditionalGlobs.length === 0).flatMap((item) => blockToLoads(item, "session_start"));
	return { instructionFiles, instructions, unconditionalPromptText, conditionalRules, eagerLoads };
}

export function blockToLoads(block: Block, loadReason: InstructionLoad["loadReason"], triggerFilePath?: string): InstructionLoad[] {
	const base = [{ filePath: block.path, scope: block.scope, loadReason, globs: block.conditionalGlobs.length > 0 ? block.conditionalGlobs : undefined, triggerFilePath }];
	return [...base, ...block.includes.map((item) => ({ filePath: item.path, scope: block.scope, loadReason: "include" as const, triggerFilePath, parentFilePath: item.parentPath }))];
}

function loadUserFiles(add: any, excludes: string[] | undefined) {
	const home = process.env.HOME || "";
	if (!home) return;
	const claude = join(home, ".claude", "CLAUDE.md");
	if (fileExists(claude) && !shouldSkip(claude, excludes)) add(claude, "user", "claude", home, readText(claude) || "");
	for (const path of listMarkdownFiles(join(home, ".claude", "rules")).filter((item) => !shouldSkip(item, excludes))) {
		const parsed = parseFrontmatter(readText(path) || "");
		add(path, "user", "rule", home, parsed.body, parsed.paths);
	}
}

function loadAncestorFiles(cwd: string, projectRoot: string, add: any, excludes: string[] | undefined) {
	for (const dir of walkAncestors(cwd).filter((item) => item === projectRoot || isPathInside(projectRoot, item))) {
		for (const [path, scope] of [[join(dir, "CLAUDE.md"), "project"], [join(dir, ".claude", "CLAUDE.md"), "project"], [join(dir, "CLAUDE.local.md"), "local"]] as const) if (fileExists(path) && !shouldSkip(path, excludes)) add(path, scope, "claude", projectRoot, readText(path) || "");
		for (const path of listMarkdownFiles(join(dir, ".claude", "rules")).filter((item) => !shouldSkip(item, excludes))) {
			const parsed = parseFrontmatter(readText(path) || "");
			add(path, "project", "rule", projectRoot, parsed.body, parsed.paths);
		}
	}
}

function shouldSkip(path: string, excludes: string[] | undefined) {
	return Array.isArray(excludes) && excludes.length > 0 && matchesAbsoluteGlobs(path, excludes);
}
