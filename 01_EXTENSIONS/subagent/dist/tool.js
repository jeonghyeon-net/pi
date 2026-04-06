import { SubagentParams } from "./types.js";
import { parseCommand } from "./cli.js";
import { loadAgentsFromDir, getAgent } from "./agents.js";
import { listRuns } from "./store.js";
import { getRunHistory } from "./session.js";
import { dispatchRun, dispatchBatch, dispatchChain } from "./dispatch.js";
import { readdirSync, readFileSync, existsSync } from "fs";
function textResult(text, isError = false) {
    return { content: [{ type: "text", text }], details: { isError } };
}
export function errorMsg(e) { return e instanceof Error ? e.message : String(e); }
function formatRunsList() {
    const active = listRuns();
    const history = getRunHistory();
    const parts = [];
    if (active.length)
        parts.push(`Active (${active.length}):\n` + active.map((r) => `  #${r.id} ${r.agent}`).join("\n"));
    if (history.length)
        parts.push(`History (${history.length}):\n` + history.map((r) => `  #${r.id} ${r.agent}`).join("\n"));
    return parts.join("\n\n") || "No runs";
}
function formatDetail(id) {
    const item = getRunHistory().find((r) => r.id === id);
    if (!item)
        return `Run #${id} not found`;
    return `#${id} ${item.agent}\n${item.output ?? "(no output)"}`;
}
function dispatch(cmd, agents, pi, ctx) {
    if (cmd.type === "runs")
        return textResult(formatRunsList());
    if (cmd.type === "detail")
        return textResult(formatDetail(cmd.id));
    if (cmd.type === "run") {
        const agent = getAgent(cmd.agent, agents);
        if (!agent)
            return textResult(`Unknown agent: ${cmd.agent}`);
        const { text } = dispatchRun(agent, cmd.task, pi, ctx, cmd.main);
        return textResult(text);
    }
    if (cmd.type === "batch")
        return textResult(dispatchBatch(cmd.items, agents, pi, ctx, cmd.main));
    if (cmd.type === "chain")
        return textResult(dispatchChain(cmd.steps, agents, pi, ctx, cmd.main));
    return textResult(`continue not yet implemented for #${cmd.id}`);
}
export function createTool(pi, agentsDir) {
    const agents = existsSync(agentsDir)
        ? loadAgentsFromDir(agentsDir, (d) => readdirSync(d).map(String), readFileSync)
        : [];
    return {
        name: "subagent",
        label: "Subagent",
        description: "Run isolated subagent processes. Commands: run, batch, chain, continue, detail, runs",
        parameters: SubagentParams,
        async execute(_id, params, _signal, _onUpdate, ctx) {
            try {
                return dispatch(parseCommand(params.command), agents, pi, ctx);
            }
            catch (e) {
                return textResult(`Error: ${errorMsg(e)}`, true);
            }
        },
    };
}
