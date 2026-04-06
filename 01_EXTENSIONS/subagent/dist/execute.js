import { getAgent } from "./agents.js";
import { PIPELINE_MAX_CHARS, MAX_CONCURRENCY } from "./constants.js";
function errorResult(agent, msg) {
    return { id: 0, agent, output: "", usage: { inputTokens: 0, outputTokens: 0, turns: 0 }, error: msg };
}
export async function executeSingle(agent, task, opts) {
    return opts.runner(agent, task);
}
export async function executeBatch(items, agents, opts) {
    const limit = opts.concurrency ?? MAX_CONCURRENCY;
    const results = [];
    const pending = [];
    for (const item of items) {
        const agent = getAgent(item.agent, agents);
        if (!agent) {
            results.push(errorResult(item.agent, `Unknown agent: ${item.agent}`));
            continue;
        }
        const p = opts.runner(agent, item.task)
            .then((r) => { results.push(r); })
            .catch((e) => { results.push(errorResult(item.agent, e.message)); });
        pending.push(p);
        if (pending.length >= limit)
            await Promise.race(pending);
    }
    await Promise.all(pending);
    return results;
}
export async function executeChain(steps, agents, opts) {
    let previous = "";
    let lastResult = errorResult("", "No steps");
    for (const step of steps) {
        const agent = getAgent(step.agent, agents);
        if (!agent)
            return errorResult(step.agent, `Unknown agent: ${step.agent}`);
        const task = step.task.replace("{previous}", previous.slice(0, PIPELINE_MAX_CHARS));
        lastResult = await opts.runner(agent, task);
        if (lastResult.escalation)
            return lastResult;
        if (lastResult.error)
            return lastResult;
        previous = lastResult.output;
    }
    return lastResult;
}
