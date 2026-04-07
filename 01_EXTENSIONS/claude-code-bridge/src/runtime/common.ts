import type { BridgeState, Ctx, EventName, HookRunResult } from "../core/types.js";
import { appendWarning, getPromptedRoots, getTrustedRoots } from "./store.js";

export function matcherMatches(matcher: string | undefined, value: string | undefined): boolean {
	if (!matcher || matcher === "" || matcher === "*") return true;
	if (!value) return false;
	try {
		return new RegExp(matcher).test(value);
	} catch {
		return false;
	}
}

export function textFromContent(content: any): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.map((block) => block?.type === "text" ? String(block.text || "") : block?.type === "thinking" ? String(block.thinking || "") : block?.type === "toolCall" ? `[tool call ${block.name}]` : "").filter(Boolean).join("\n");
}

export function extractLastAssistantMessage(messages: any[]): string {
	for (let i = messages.length - 1; i >= 0; i--) if (messages[i]?.role === "assistant") return textFromContent(messages[i].content);
	return "";
}

export function hookSpecificOutput(result: HookRunResult, eventName: EventName): any {
	return result.parsedJson?.hookSpecificOutput?.hookEventName === eventName ? result.parsedJson.hookSpecificOutput : undefined;
}

export function plainAdditionalText(result: HookRunResult): string | undefined {
	return result.parsedJson ? undefined : result.stdout.trim() || undefined;
}

export async function ensureProjectHookTrust(ctx: Ctx, state: BridgeState): Promise<boolean> {
	if (!state.hasRepoScopedHooks || getTrustedRoots().has(state.projectRoot)) return true;
	if (getPromptedRoots().has(state.projectRoot)) return false;
	getPromptedRoots().add(state.projectRoot);
	if (!ctx.hasUI) return appendWarning(ctx, `[claude-bridge] Repo-scoped Claude hooks are disabled for this session until trusted: ${state.projectRoot}`), false;
	const ok = await ctx.ui.confirm("Trust repo-scoped Claude hooks for this session?", `${state.projectRoot}\n\nThis project defines Claude command/http hooks in .claude/settings*.json.\nTrusting allows those repo-scoped hooks to run automatically inside pi for this session only.`);
	if (!ok) return ctx.ui.notify(`[claude-bridge] Repo-scoped hooks remain disabled for ${state.projectRoot}`, "warning"), false;
	getTrustedRoots().add(state.projectRoot);
	ctx.ui.notify(`[claude-bridge] Trusted repo-scoped hooks for ${state.projectRoot}`, "info");
	return true;
}
