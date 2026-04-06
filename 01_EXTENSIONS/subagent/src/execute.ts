import type { RunResult, AgentConfig } from "./types.js";
import { getAgent } from "./agents.js";
import { PIPELINE_MAX_CHARS, MAX_CONCURRENCY } from "./constants.js";

type RunnerFn = (agent: AgentConfig, task: string) => Promise<RunResult>;
interface ExecOpts { runner: RunnerFn; concurrency?: number }

function errorResult(agent: string, msg: string): RunResult {
	return { id: 0, agent, output: "", usage: { inputTokens: 0, outputTokens: 0, turns: 0 }, error: msg };
}

export async function executeSingle(agent: AgentConfig, task: string, opts: ExecOpts): Promise<RunResult> {
	return opts.runner(agent, task);
}

export async function executeBatch(
	items: Array<{ agent: string; task: string }>,
	agents: AgentConfig[],
	opts: ExecOpts,
): Promise<RunResult[]> {
	const limit = opts.concurrency ?? MAX_CONCURRENCY;
	const results: RunResult[] = [];
	const pending = new Set<Promise<void>>();
	for (const item of items) {
		const agent = getAgent(item.agent, agents);
		if (!agent) { results.push(errorResult(item.agent, `Unknown agent: ${item.agent}`)); continue; }
		const p = opts.runner(agent, item.task)
			.then((r) => { results.push(r); })
			.catch((e: Error) => { results.push(errorResult(item.agent, e.message)); })
			.finally(() => { pending.delete(p); });
		pending.add(p);
		if (pending.size >= limit) await Promise.race(pending);
	}
	await Promise.all(pending);
	return results;
}

export async function executeChain(
	steps: Array<{ agent: string; task: string }>,
	agents: AgentConfig[],
	opts: ExecOpts,
): Promise<RunResult> {
	let previous = "";
	let lastResult: RunResult = errorResult("", "No steps");
	for (const step of steps) {
		const agent = getAgent(step.agent, agents);
		if (!agent) return errorResult(step.agent, `Unknown agent: ${step.agent}`);
		const task = step.task.replace("{previous}", previous.slice(0, PIPELINE_MAX_CHARS));
		lastResult = await opts.runner(agent, task);
		if (lastResult.escalation) return lastResult;
		if (lastResult.error) return lastResult;
		previous = lastResult.output;
	}
	return lastResult;
}
