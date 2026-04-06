import { writeFileSync, existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import type { AgentConfig, RunResult, SubagentPi } from "./types.js";
import { getPiCommand, buildArgs } from "./runner.js";
import { withRetry } from "./retry.js";
import { extractMainContext, type Entry } from "./context.js";
import { executeSingle, executeBatch, executeChain } from "./execute.js";
import { nextId, addRun, removeRun, listRuns } from "./store.js";
import { addToHistory, sessionPath } from "./session.js";
import { buildResultText } from "./render.js";
import { syncWidget } from "./widget.js";
import { MAX_RETRIES, RETRY_BASE_MS } from "./constants.js";
import { spawnAndCollect } from "./spawn.js";

export interface DispatchCtx {
	hasUI: boolean;
	ui: { setWidget(k: string, v: unknown, o?: unknown): void };
	sessionManager: { getBranch(): unknown[] };
}

export function createRunner(
	main: boolean,
	ctx: DispatchCtx,
): (agent: AgentConfig, task: string) => Promise<RunResult> {
	return async (agent, task) => {
		const id = nextId();
		const promptPath = join(tmpdir(), `pi-sub-${agent.name}-${id}.md`);
		let prompt = agent.systemPrompt;
		if (main) {
			const branch = ctx.sessionManager.getBranch() as Entry[];
			const mainCtx = extractMainContext(branch, 20);
			if (mainCtx) prompt += `\n\n[Main Context]\n${mainCtx}`;
		}
		writeFileSync(promptPath, prompt);
		const { cmd, base } = getPiCommand(process.execPath, process.argv[1], existsSync);
		const sessPath = sessionPath(id);
		const dir = dirname(sessPath);
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
		const args = buildArgs({ base, model: agent.model, tools: agent.tools, systemPromptPath: promptPath, task, sessionPath: sessPath });
		addRun({ id, agent: agent.name, startedAt: Date.now(), abort: () => {} });
		try {
			const result = await withRetry(() => spawnAndCollect(cmd, args, id, agent.name), MAX_RETRIES, RETRY_BASE_MS);
			addToHistory({ id, agent: agent.name, output: result.output, sessionFile: sessPath });
			return result;
		} finally { removeRun(id); }
	};
}

function sendFollowUp(pi: SubagentPi, result: RunResult, customType = "subagent-result"): void {
	pi.sendMessage(
		{ customType, content: buildResultText(result), display: true },
		{ deliverAs: "followUp", triggerTurn: true },
	);
}

export function dispatchRun(
	agent: AgentConfig, task: string, pi: SubagentPi, ctx: DispatchCtx, main: boolean,
): { id: number; text: string } {
	const runner = createRunner(main, ctx);
	const id = listRuns().length + 1;
	executeSingle(agent, task, { runner })
		.then((r) => sendFollowUp(pi, r))
		.catch((e: Error) => sendFollowUp(pi, { id: 0, agent: agent.name, output: "", error: e.message, usage: { inputTokens: 0, outputTokens: 0, turns: 0 } }))
		.finally(() => syncWidget(ctx, listRuns()));
	syncWidget(ctx, listRuns());
	return { id, text: `${agent.name} started` };
}

export function dispatchBatch(
	items: Array<{ agent: string; task: string }>, agents: AgentConfig[],
	pi: SubagentPi, ctx: DispatchCtx, main: boolean,
): string {
	const runner = createRunner(main, ctx);
	executeBatch(items, agents, { runner })
		.then((results) => {
			const text = results.map((r) => buildResultText(r)).join("\n---\n");
			pi.sendMessage({ customType: "subagent-batch", content: text, display: true }, { deliverAs: "followUp", triggerTurn: true });
		})
		.finally(() => syncWidget(ctx, listRuns()));
	syncWidget(ctx, listRuns());
	return `batch started (${items.length} tasks)`;
}

export function dispatchChain(
	steps: Array<{ agent: string; task: string }>, agents: AgentConfig[],
	pi: SubagentPi, ctx: DispatchCtx, main: boolean,
): string {
	const runner = createRunner(main, ctx);
	executeChain(steps, agents, { runner })
		.then((r) => sendFollowUp(pi, r))
		.finally(() => syncWidget(ctx, listRuns()));
	syncWidget(ctx, listRuns());
	return `chain started (${steps.length} steps)`;
}
