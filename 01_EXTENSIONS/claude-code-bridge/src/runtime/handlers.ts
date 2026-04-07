import type { Ctx, EventName, HookRunResult, PiBridge } from "../core/types.js";
import { runHook } from "../hooks/run.js";
import { ensureProjectHookTrust, hookSpecificOutput, matcherMatches, plainAdditionalText } from "./common.js";
import { appendWarning, getState, refreshState } from "./store.js";

export async function runHandlers(pi: PiBridge, eventName: EventName, matcherValue: string | undefined, input: any, ctx: Ctx): Promise<HookRunResult[]> {
	const state = getState() ?? (await refreshState(ctx));
	if (!state.enabled || state.disableAllHooks) return [];
	const matched = (state.hooksByEvent.get(eventName) || []).filter((handler) => matcherMatches(handler.matcher, matcherValue));
	const needsTrust = matched.some((handler) => handler.scope !== "user");
	const repoHooksTrusted = needsTrust ? await ensureProjectHookTrust(ctx, state) : false;
	const handlers = matched.filter((handler) => handler.scope === "user" || repoHooksTrusted);
	const results: HookRunResult[] = [];
	for (const handler of handlers) {
		if (handler.async && handler.type === "command") {
			void runHook(handler, input, state, ctx.cwd, ctx).then((result) => sendAsyncHookMessage(pi, { ...result, scope: handler.scope }, eventName));
			continue;
		}
		try {
			results.push({ ...(await runHook(handler, input, state, ctx.cwd, ctx)), scope: handler.scope });
		} catch (error: any) {
			appendWarning(ctx, `[claude-bridge] Hook failed open for ${eventName}: ${error?.message || String(error)}`);
		}
	}
	return results;
}

function sendAsyncHookMessage(pi: PiBridge, result: HookRunResult, eventName: EventName) {
	const extra = hookSpecificOutput(result, eventName)?.additionalContext || result.parsedJson?.systemMessage || plainAdditionalText(result);
	if (!extra) return;
	pi.sendMessage({ customType: "claude-bridge-async", content: `[claude-bridge async ${eventName}] ${extra}`, display: true }, { deliverAs: "followUp", triggerTurn: false });
}
