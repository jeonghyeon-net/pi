import type { BridgeState, Ctx } from "../core/types.js";
import { buildInstructionSection } from "../core/instructions.js";
import { scopeLabel } from "../core/pathing.js";
import { loadState } from "../state/collect.js";

let activeState: BridgeState | null = null;
let queuedHookContext: string[] = [];
let stopHookActive = false;
const warned = new Set<string>();
const trustedRoots = new Set<string>();
const promptedRoots = new Set<string>();

export function getState() {
	return activeState;
}

export async function refreshState(ctx: Ctx): Promise<BridgeState> {
	const next = await loadState(ctx.cwd);
	if (activeState) next.activeConditionalRuleIds = activeState.activeConditionalRuleIds;
	activeState = next;
	for (const warning of compactWarnings(next.warnings)) appendWarning(ctx, `[claude-bridge] ${warning}`);
	return next;
}

export function appendWarning(ctx: Ctx | undefined, message: string) {
	if (warned.has(message)) return;
	warned.add(message);
	ctx?.ui.notify(message, "warning");
}

export function compactWarnings(warnings: string[]): string[] {
	return [...new Set(warnings)];
}

export function queueAdditionalContext(texts: Array<string | undefined>) {
	for (const text of texts) if (text?.trim()) queuedHookContext.push(text.trim());
}

export function buildDynamicContext(state: BridgeState): string | undefined {
	const activeRules = state.conditionalRules.filter((rule) => state.activeConditionalRuleIds.has(rule.id));
	const sections = [
		activeRules.length > 0 ? "## Active path-scoped Claude rules\n" + activeRules.map((rule) => buildInstructionSection(`Conditional rule (${scopeLabel(rule.scope)})`, rule.path, rule.content)).join("\n\n") : "",
		queuedHookContext.length > 0 ? `## Claude hook context\n${queuedHookContext.join("\n\n")}` : "",
	].filter(Boolean);
	queuedHookContext = [];
	return sections.length > 0 ? sections.join("\n\n") : undefined;
}

export function getStopHookActive() {
	return stopHookActive;
}

export function setStopHookActive(value: boolean) {
	stopHookActive = value;
}

export function getTrustedRoots() {
	return trustedRoots;
}

export function getPromptedRoots() {
	return promptedRoots;
}

export function clearTrustState() {
	trustedRoots.clear();
	promptedRoots.clear();
}

export function clearSessionState() {
	activeState = null;
	queuedHookContext = [];
	stopHookActive = false;
	warned.clear();
	clearTrustState();
}
