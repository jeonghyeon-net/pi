import { createLocalBashOperations } from "@mariozechner/pi-coding-agent";
import type { Ctx } from "../core/types.js";
import { buildClaudeInputBase } from "../hooks/tools.js";
import { hookSpecificOutput } from "./common.js";
import { runHandlers } from "./handlers.js";
import { getState, refreshState } from "./store.js";

export function createUserBashHandler(pi: any) {
	return async (event: any, ctx: Ctx) => {
		const state = getState() ?? (await refreshState(ctx));
		if (!state.enabled) return;
		const results = await runHandlers(pi, "PreToolUse", "Bash", { ...buildClaudeInputBase(ctx, "PreToolUse"), tool_name: "Bash", tool_input: { command: event.command }, tool_use_id: `user-bash-${Date.now()}` }, ctx);
		for (const result of results) {
			if (result.code === 2) return blocked(result.stderr.trim() || "Blocked by Claude PreToolUse hook");
			const specific = hookSpecificOutput(result, "PreToolUse");
			if (specific?.permissionDecision === "deny") return blocked(specific.permissionDecisionReason || "Denied by Claude PreToolUse hook");
			if (specific?.permissionDecision === "ask" && (!(ctx.hasUI) || !(await ctx.ui.confirm("Claude hook confirmation", specific.permissionDecisionReason || "Allow bash command?")))) return blocked(ctx.hasUI ? "Blocked by Claude ask hook" : `${specific.permissionDecisionReason || "Blocked by Claude ask hook"} (no UI available)`);
		}
		const local = createLocalBashOperations();
		const preamble = buildShellPreamble(state);
		return { operations: { exec(command: string, cwd: string, options: any) { return local.exec(preamble.trim() ? `${preamble}\n${command}` : command, cwd, options); } } };
	};
}

function blocked(output: string) {
	return { result: { output, exitCode: 1, cancelled: false, truncated: false } };
}

function buildShellPreamble(state: any): string {
	const exports = Object.entries(state.mergedEnv).map(([key, value]) => `export ${key}=${JSON.stringify(value)}`);
	if (state.envFilePath) exports.push(`[ -f ${JSON.stringify(state.envFilePath)} ] && . ${JSON.stringify(state.envFilePath)}`);
	return exports.join("\n");
}
