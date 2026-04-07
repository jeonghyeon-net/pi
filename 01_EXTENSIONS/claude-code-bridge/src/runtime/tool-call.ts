import type { Ctx } from "../core/types.js";
import { activateConditionalRules, applyUpdatedInput, buildClaudeInputBase, extractTouchedPaths, toClaudeToolInput } from "../hooks/tools.js";
import { hookSpecificOutput } from "./common.js";
import { runHandlers } from "./handlers.js";
import { getState, queueAdditionalContext, refreshState } from "./store.js";
import { emitInstructionLoads } from "./instructions-loaded.js";
import { blockToLoads } from "../state/instructions.js";

export function createToolCallHandler(pi: any) {
	return async (event: any, ctx: Ctx) => {
		const state = getState() ?? (await refreshState(ctx));
		if (!state.enabled) return;
		const touchedPaths = extractTouchedPaths(event.toolName, event.input, ctx.cwd);
		const activated = activateConditionalRules(state, touchedPaths);
		if (activated.length > 0) {
			for (const rule of activated) await emitInstructionLoads(pi, ctx, blockToLoads(rule, "path_glob_match", touchedPaths[0]));
			queueAdditionalContext([`Activated Claude path-scoped rules for ${touchedPaths.join(", ")}. These rules will apply on the next model turn.`]);
			if (["edit", "write"].includes(event.toolName) && touchedPaths.length > 0) return { block: true, reason: `Claude path-scoped rules became active for ${touchedPaths.join(", ")}. Retry after considering the newly loaded rules.` };
		}
		const mapped = toClaudeToolInput(event.toolName, event.input, ctx.cwd);
		if (!mapped) return;
		const agentReason = mapped.tool_name === "Agent" ? await onSubagentStart(pi, event, ctx) : undefined;
		if (agentReason) queueAdditionalContext(agentReason);
		const results = await runHandlers(pi, "PreToolUse", mapped.tool_name, { ...buildClaudeInputBase(ctx, "PreToolUse"), tool_name: mapped.tool_name, tool_input: mapped.tool_input, tool_use_id: event.toolCallId }, ctx);
		return await resolveDecision(results, event, ctx, mapped.tool_name, state);
	};
}

async function onSubagentStart(pi: any, event: any, ctx: Ctx) {
	const type = event.input.command ? String(event.input.command).match(/^run\s+([^\s]+)\s+--/)?.[1] : undefined;
	const results = await runHandlers(pi, "SubagentStart", type, { ...buildClaudeInputBase(ctx, "SubagentStart"), agent_id: event.toolCallId, agent_type: type }, ctx);
	return results.map((result) => hookSpecificOutput(result, "SubagentStart")?.additionalContext).filter(Boolean);
}

async function resolveDecision(results: any[], event: any, ctx: Ctx, name: string, state: any) {
	const decision: any = { additionalContext: [] };
	for (const result of results) {
		const specific = hookSpecificOutput(result, "PreToolUse");
		if (result.code === 2) return { block: true, reason: result.stderr.trim() || "Blocked by Claude PreToolUse hook" };
		if (specific?.additionalContext) decision.additionalContext.push(String(specific.additionalContext));
		if (specific?.updatedInput) decision.updatedInput = specific.updatedInput;
		if (specific?.permissionDecision === "deny") return { block: true, reason: specific.permissionDecisionReason || "Denied by Claude PreToolUse hook" };
		if (specific?.permissionDecision === "defer") return { block: true, reason: "Claude hook requested defer, which pi does not support." };
		if (specific?.permissionDecision === "ask") decision.ask = specific.permissionDecisionReason || "Claude hook requests confirmation";
	}
	queueAdditionalContext(decision.additionalContext);
	if (decision.updatedInput) applyUpdatedInput(event.toolName, event.input, decision.updatedInput);
	if (decision.ask && (!(ctx.hasUI) || !(await ctx.ui.confirm("Claude hook confirmation", `${decision.ask}\n\nAllow ${name}?`)))) return { block: true, reason: ctx.hasUI ? "Blocked by Claude ask hook" : `${decision.ask} (no UI available)` };
	if (event.toolName === "bash") event.input.command = `${buildShellPreamble(state)}\n${event.input.command}`.trim();
}

function buildShellPreamble(state: any): string {
	const exports = Object.entries(state.mergedEnv).map(([key, value]) => `export ${key}=${JSON.stringify(value)}`);
	if (state.envFilePath) exports.push(`[ -f ${JSON.stringify(state.envFilePath)} ] && . ${JSON.stringify(state.envFilePath)}`);
	return exports.join("\n");
}
