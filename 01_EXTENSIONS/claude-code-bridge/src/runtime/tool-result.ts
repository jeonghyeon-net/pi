import type { Ctx } from "../core/types.js";
import { buildClaudeInputBase, extractSubagentType, toClaudeToolInput } from "../hooks/tools.js";
import { hookSpecificOutput, plainAdditionalText, textFromContent } from "./common.js";
import { runHandlers } from "./handlers.js";
import { getState, refreshState } from "./store.js";

export function createToolResultHandler(pi: any) {
	return async (event: any, ctx: Ctx) => {
		const state = getState() ?? (await refreshState(ctx));
		if (!state.enabled) return;
		const mapped = toClaudeToolInput(event.toolName, event.input, ctx.cwd);
		if (!mapped) return;
		const hookEventName = event.isError ? "PostToolUseFailure" : "PostToolUse";
		const payload = { ...buildClaudeInputBase(ctx, hookEventName), tool_name: mapped.tool_name, tool_input: mapped.tool_input, tool_use_id: event.toolCallId, ...(event.isError ? { error: textFromContent(event.content), is_interrupt: false } : { tool_response: { content: textFromContent(event.content), details: event.details } }) };
		const patches = buildPatches(await runHandlers(pi, hookEventName, mapped.tool_name, payload, ctx), hookEventName);
		if (mapped.tool_name === "Agent") patches.push(...buildSubagentPatches(await runHandlers(pi, "SubagentStop", extractSubagentType(event.input.command), { ...buildClaudeInputBase(ctx, "SubagentStop"), stop_hook_active: false, agent_id: event.toolCallId, agent_type: extractSubagentType(event.input.command), agent_transcript_path: undefined, last_assistant_message: textFromContent(event.content) }, ctx)));
		return applyPatches(event, patches);
	};
}

type Patch = { text: string; isError?: boolean };

function buildPatches(results: any[], eventName: "PostToolUse" | "PostToolUseFailure"): Patch[] {
	return results.flatMap<Patch>((result) => {
		const specific = hookSpecificOutput(result, eventName);
		if (result.code === 2 || result.parsedJson?.decision === "block") return [{ text: result.stderr.trim() || result.parsedJson?.reason || specific?.additionalContext || `Blocked by Claude ${eventName} hook`, isError: true }];
		const extra = specific?.additionalContext || plainAdditionalText(result);
		return extra ? [{ text: `[claude-bridge ${eventName}] ${extra}`, isError: false }] : [];
	});
}

function buildSubagentPatches(results: any[]): Patch[] {
	return results.flatMap<Patch>((result) => result.code === 2 || result.parsedJson?.decision === "block" ? [{ text: result.stderr.trim() || result.parsedJson?.reason || "Claude SubagentStop hook requested continuation.", isError: true }] : hookSpecificOutput(result, "SubagentStop")?.additionalContext ? [{ text: `[claude-bridge SubagentStop] ${hookSpecificOutput(result, "SubagentStop")?.additionalContext}`, isError: false }] : []);
}

function applyPatches(event: any, patches: Patch[]) {
	if (patches.length === 0) return;
	let content = Array.isArray(event.content) ? [...event.content] : [];
	let isError = event.isError;
	for (const patch of patches) if (patch.text.trim()) content = [...content, { type: "text", text: patch.text.trim() }], isError = patch.isError ?? isError;
	return { content, isError };
}
