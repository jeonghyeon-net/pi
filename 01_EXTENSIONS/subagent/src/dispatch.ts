import type { AgentConfig, RunResult, SubagentPi } from "./types.js";
import { getAgent } from "./agents.js";
import { executeSingle, executeBatch, executeChain } from "./execute.js";
import { listRuns, getRun, removeRun } from "./store.js";
import { getSessionFile, getRunHistory, restoreRuns } from "./session.js";
import { syncWidget } from "./widget.js";
import { createRunner, createSessionRunner } from "./run-factory.js";
export type { DispatchCtx } from "./run-factory.js";

type OnUpdate = Parameters<typeof createRunner>[2];

export async function dispatchRun(
	agent: AgentConfig, task: string, ctx: Parameters<typeof createRunner>[1], main: boolean,
	onUpdate?: OnUpdate,
): Promise<RunResult> {
	const runner = createRunner(main, ctx, onUpdate);
	try { return await executeSingle(agent, task, { runner }); }
	finally { syncWidget(ctx, listRuns()); }
}

export async function dispatchBatch(
	items: Array<{ agent: string; task: string }>, agents: AgentConfig[],
	ctx: Parameters<typeof createRunner>[1], main: boolean,
	onUpdate?: OnUpdate,
): Promise<RunResult[]> {
	const runner = createRunner(main, ctx, onUpdate);
	try { return await executeBatch(items, agents, { runner }); }
	finally { syncWidget(ctx, listRuns()); }
}

export async function dispatchChain(
	steps: Array<{ agent: string; task: string }>, agents: AgentConfig[],
	ctx: Parameters<typeof createRunner>[1], main: boolean,
	onUpdate?: OnUpdate,
): Promise<RunResult> {
	const runner = createRunner(main, ctx, onUpdate);
	try { return await executeChain(steps, agents, { runner }); }
	finally { syncWidget(ctx, listRuns()); }
}

export function dispatchAbort(id: number): string {
	const run = getRun(id);
	if (!run) return `Run #${id} not found`;
	run.abort();
	removeRun(id);
	return `Run #${id} (${run.agent}) aborted`;
}

export async function dispatchContinue(
	id: number, task: string, agents: AgentConfig[],
	ctx: Parameters<typeof createRunner>[1],
	onUpdate?: OnUpdate,
): Promise<RunResult | string> {
	const hist = getRunHistory().find((r) => r.id === id);
	if (!hist) return `Run #${id} not found in history`;
	const sessFile = getSessionFile(id);
	if (!sessFile) return `Run #${id} not found in history`;
	const agent = getAgent(hist.agent, agents);
	if (!agent) return `Agent for run #${id} not found`;
	const runner = createSessionRunner(sessFile, ctx, onUpdate);
	try { return await executeSingle(agent, task, { runner }); }
	finally { syncWidget(ctx, listRuns()); }
}

export function onSessionRestore() {
	return async (_e: unknown, ctx: Parameters<typeof createRunner>[1]) => {
		restoreRuns(ctx.sessionManager.getBranch() as Array<{ type: string }>);
		syncWidget(ctx, listRuns());
	};
}
