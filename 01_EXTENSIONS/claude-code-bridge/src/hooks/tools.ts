import { resolve } from "node:path";
import type { Block, BridgeState } from "../core/types.js";
import { matchesAnyGlob } from "../core/globs.js";

export function buildClaudeInputBase(ctx: { cwd: string; sessionManager: { getSessionFile(): string | undefined } }, eventName: string) {
	const sessionFile = ctx.sessionManager.getSessionFile();
	return { session_id: sessionFile || "pi-session", transcript_path: sessionFile, cwd: ctx.cwd, permission_mode: "default", hook_event_name: eventName };
}

export function toClaudeToolInput(toolName: string, rawInput: any, cwd: string) {
	if (toolName === "bash") return { tool_name: "Bash", tool_input: { command: rawInput.command, timeout: typeof rawInput.timeout === "number" ? rawInput.timeout * 1000 : undefined } };
	if (toolName === "read") return { tool_name: "Read", tool_input: { file_path: resolve(cwd, String(rawInput.path || "")), offset: rawInput.offset, limit: rawInput.limit } };
	if (toolName === "write") return { tool_name: "Write", tool_input: { file_path: resolve(cwd, String(rawInput.path || "")), content: rawInput.content } };
	if (toolName === "edit") return mapEdit(rawInput, cwd);
	if (toolName === "grep") return { tool_name: "Grep", tool_input: { pattern: rawInput.pattern, path: rawInput.path ? resolve(cwd, String(rawInput.path)) : undefined, glob: rawInput.glob, ignoreCase: rawInput.ignoreCase, literal: rawInput.literal, context: rawInput.context, limit: rawInput.limit } };
	if (toolName === "find") return { tool_name: "Glob", tool_input: { pattern: rawInput.pattern, path: rawInput.path ? resolve(cwd, String(rawInput.path)) : cwd } };
	if (toolName === "fetch_content") return { tool_name: "WebFetch", tool_input: { url: rawInput.url, prompt: rawInput.prompt } };
	if (toolName === "web_search") return { tool_name: "WebSearch", tool_input: { query: rawInput.query } };
	if (toolName === "subagent") return { tool_name: "Agent", tool_input: { prompt: rawInput.command, subagent_type: extractSubagentType(rawInput.command) } };
	return undefined;
}

function mapEdit(rawInput: any, cwd: string) {
	const firstEdit = Array.isArray(rawInput.edits) ? rawInput.edits[0] : undefined;
	return { tool_name: "Edit", tool_input: { file_path: resolve(cwd, String(rawInput.path || "")), old_string: firstEdit?.oldText, new_string: firstEdit?.newText, replace_all: Array.isArray(rawInput.edits) && rawInput.edits.length > 1 ? true : undefined } };
}

export function applyUpdatedInput(toolName: string, eventInput: any, updatedInput: any) {
	if (!updatedInput || typeof updatedInput !== "object") return;
	if (toolName === "bash") return updateBash(eventInput, updatedInput);
	if (toolName === "read") return updateFileInput(eventInput, updatedInput);
	if (toolName === "write") return updateFileInput(eventInput, updatedInput, true);
	if (toolName === "edit" && Array.isArray(eventInput.edits) && eventInput.edits.length >= 1) {
		if (typeof updatedInput.file_path === "string") eventInput.path = updatedInput.file_path;
		if (typeof updatedInput.old_string === "string") eventInput.edits[0].oldText = updatedInput.old_string;
		if (typeof updatedInput.new_string === "string") eventInput.edits[0].newText = updatedInput.new_string;
	}
}

function updateBash(eventInput: any, updatedInput: any) {
	if (typeof updatedInput.command === "string") eventInput.command = updatedInput.command;
	if (typeof updatedInput.timeout === "number") eventInput.timeout = Math.ceil(updatedInput.timeout / 1000);
}

function updateFileInput(eventInput: any, updatedInput: any, includeContent = false) {
	if (typeof updatedInput.file_path === "string") eventInput.path = updatedInput.file_path;
	if (typeof updatedInput.offset === "number") eventInput.offset = updatedInput.offset;
	if (typeof updatedInput.limit === "number") eventInput.limit = updatedInput.limit;
	if (includeContent && typeof updatedInput.content === "string") eventInput.content = updatedInput.content;
}

export function extractTouchedPaths(toolName: string, rawInput: any, cwd: string): string[] {
	if (["read", "write", "edit"].includes(toolName)) return rawInput.path ? [resolve(cwd, String(rawInput.path))] : [];
	if (toolName === "grep") return withExpressions(resolve(cwd, String(rawInput.path || cwd)), [rawInput.glob]);
	if (toolName === "find") return withExpressions(resolve(cwd, String(rawInput.path || cwd)), [rawInput.pattern]);
	return [];
}

function withExpressions(base: string, expressions: unknown[]) {
	const extras = expressions.filter((value): value is string => typeof value === "string" && value.length > 0).map((value) => resolve(base, value));
	return [base, ...extras];
}

export function activateConditionalRules(state: Pick<BridgeState, "conditionalRules" | "activeConditionalRuleIds">, touchedPaths: string[]): Block[] {
	const activated: Block[] = [];
	for (const rule of state.conditionalRules) if (!state.activeConditionalRuleIds.has(rule.id) && touchedPaths.some((path) => matchesAnyGlob(rule.ownerRoot, path, rule.conditionalGlobs))) state.activeConditionalRuleIds.add(rule.id), activated.push(rule);
	return activated;
}

export function extractSubagentType(command: string | undefined): string | undefined {
	return command?.match(/^run\s+([^\s]+)\s+--/)?.[1];
}
