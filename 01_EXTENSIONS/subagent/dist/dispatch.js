import { getAgent } from "./agents.js";
import { executeSingle, executeBatch, executeChain } from "./execute.js";
import { listRuns, getRun, removeRun } from "./store.js";
import { getSessionFile, getRunHistory, addPending, restoreRuns, drainPending } from "./session.js";
import { buildResultText } from "./render.js";
import { syncWidget } from "./widget.js";
import { createRunner, createSessionRunner } from "./run-factory.js";
function sendFollowUp(pi, result, customType = "subagent-result") {
    try {
        pi.sendMessage({ customType, content: buildResultText(result), display: true }, { deliverAs: "followUp", triggerTurn: true });
    }
    catch {
        addPending(result);
    }
}
function errorResult(agent, e) {
    return { id: 0, agent, output: "", error: e.message, usage: { inputTokens: 0, outputTokens: 0, turns: 0 } };
}
export function dispatchRun(agent, task, pi, ctx, main) {
    const runner = createRunner(main, ctx);
    executeSingle(agent, task, { runner })
        .then((r) => sendFollowUp(pi, r))
        .catch((e) => sendFollowUp(pi, errorResult(agent.name, e)))
        .finally(() => syncWidget(ctx, listRuns()));
    syncWidget(ctx, listRuns());
    return { text: `${agent.name} started` };
}
export function dispatchBatch(items, agents, pi, ctx, main) {
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
export function dispatchChain(steps, agents, pi, ctx, main) {
    const runner = createRunner(main, ctx);
    executeChain(steps, agents, { runner })
        .then((r) => sendFollowUp(pi, r))
        .finally(() => syncWidget(ctx, listRuns()));
    syncWidget(ctx, listRuns());
    return `chain started (${steps.length} steps)`;
}
export function dispatchAbort(id) {
    const run = getRun(id);
    if (!run)
        return `Run #${id} not found`;
    run.abort();
    removeRun(id);
    return `Run #${id} (${run.agent}) aborted`;
}
export function dispatchContinue(id, task, agents, pi, ctx) {
    const hist = getRunHistory().find((r) => r.id === id);
    if (!hist)
        return `Run #${id} not found in history`;
    const sessFile = getSessionFile(id);
    if (!sessFile)
        return `Run #${id} not found in history`;
    const agent = getAgent(hist.agent, agents);
    if (!agent)
        return `Agent for run #${id} not found`;
    const runner = createSessionRunner(sessFile, ctx);
    executeSingle(agent, task, { runner })
        .then((r) => sendFollowUp(pi, r))
        .catch((e) => sendFollowUp(pi, errorResult(agent.name, e)))
        .finally(() => syncWidget(ctx, listRuns()));
    return `continue #${id} (${agent.name}) started`;
}
export function onSessionRestore(pi) {
    return async (_e, ctx) => {
        restoreRuns(ctx.sessionManager.getBranch());
        syncWidget(ctx, listRuns());
        for (const r of drainPending()) {
            pi.sendMessage({ customType: "subagent-pending", content: buildResultText(r), display: true }, { deliverAs: "followUp", triggerTurn: true });
        }
    };
}
