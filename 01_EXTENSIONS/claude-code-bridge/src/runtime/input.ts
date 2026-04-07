import type { Ctx } from "../core/types.js";
import { buildClaudeInputBase } from "../hooks/tools.js";
import { hookSpecificOutput, plainAdditionalText } from "./common.js";
import { runHandlers } from "./handlers.js";
import { queueAdditionalContext, refreshState } from "./store.js";

export function createInputHandler(pi: any) {
	return async (event: any, ctx: Ctx) => {
		const state = await refreshState(ctx);
		if (!state.enabled) return { action: "continue" as const };
		const results = await runHandlers(pi, "UserPromptSubmit", undefined, { ...buildClaudeInputBase(ctx, "UserPromptSubmit"), prompt: event.text }, ctx);
		for (const result of results) {
			if (result.code === 2) return ctx.ui.notify(result.stderr.trim() || "Blocked by Claude hook", "warning"), { action: "handled" as const };
			if (result.parsedJson?.continue === false) return ctx.ui.notify(result.parsedJson.stopReason || "Stopped by Claude hook", "warning"), { action: "handled" as const };
			if (result.parsedJson?.decision === "block") return ctx.ui.notify(result.parsedJson.reason || "Blocked by Claude hook", "warning"), { action: "handled" as const };
			queueAdditionalContext([hookSpecificOutput(result, "UserPromptSubmit")?.additionalContext, plainAdditionalText(result)]);
		}
		return { action: "continue" as const };
	};
}
