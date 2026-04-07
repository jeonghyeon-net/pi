import type { Ctx, InstructionLoad, PiBridge } from "../core/types.js";
import { buildClaudeInputBase } from "../hooks/tools.js";
import { runHandlers } from "./handlers.js";
import { getState } from "./store.js";
import { blockToLoads } from "../state/instructions.js";
import { scopeLabel } from "../core/pathing.js";

export async function emitInstructionLoads(pi: PiBridge, ctx: Ctx, loads: InstructionLoad[]) {
	for (const load of loads) await runHandlers(pi, "InstructionsLoaded", load.loadReason, { ...buildClaudeInputBase(ctx, "InstructionsLoaded"), file_path: load.filePath, memory_type: scopeLabel(load.scope), load_reason: load.loadReason, globs: load.globs, trigger_file_path: load.triggerFilePath, parent_file_path: load.parentFilePath }, ctx);
}

export function compactLoads() {
	const state = getState();
	if (!state) return [];
	const active = state.conditionalRules.filter((rule) => state.activeConditionalRuleIds.has(rule.id)).flatMap((rule) => blockToLoads(rule, "compact"));
	return [...state.eagerLoads.map((item) => item.loadReason === "include" ? { ...item } : { ...item, loadReason: "compact" as const }), ...active];
}
