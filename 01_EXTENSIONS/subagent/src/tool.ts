import { defineTool } from "@mariozechner/pi-coding-agent";
import type { AgentToolResult, AgentToolUpdateCallback, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { readdirSync, readFileSync, existsSync } from "fs";
import { parseCommand } from "./cli.js";
import { dispatchAbort, dispatchBatch, dispatchChain, dispatchContinue, dispatchRun } from "./dispatch.js";
import type { DispatchCtx } from "./dispatch.js";
import { loadAgentsFromDir, getAgent } from "./agents.js";
import { renderCall, renderResult, buildResultText } from "./render.js";
import { formatDetail, formatRunsList } from "./tool-report.js";
import type { AgentConfig, SubagentPi, SubagentToolDetails, Subcommand } from "./types.js";
import { SubagentParams } from "./types.js";

const result = (text: string, isError = false): AgentToolResult<SubagentToolDetails> => ({ content: [{ type: "text", text }], details: { isError } });
export const errorMsg = (e: unknown) => e instanceof Error ? e.message : String(e);
type UpdateFn = AgentToolUpdateCallback<SubagentToolDetails> | undefined;

async function dispatch(cmd: Subcommand, agents: AgentConfig[], ctx: DispatchCtx, onUpdate: UpdateFn) {
	if (cmd.type === "runs") return result(formatRunsList());
	if (cmd.type === "detail") return result(formatDetail(cmd.id));
	if (cmd.type === "abort") return result(dispatchAbort(cmd.id));
	if (cmd.type === "run") return runSingle(cmd, agents, ctx, onUpdate);
	if (cmd.type === "batch") return runBatch(cmd, agents, ctx, onUpdate);
	if (cmd.type === "chain") return runChain(cmd, agents, ctx, onUpdate);
	const cont = await dispatchContinue(cmd.id, cmd.task, agents, ctx, onUpdate);
	return typeof cont === "string" ? result(cont, cont.includes("not found")) : result(buildResultText(cont), !!cont.error);
}

async function runSingle(cmd: Extract<Subcommand, { type: "run" }>, agents: AgentConfig[], ctx: DispatchCtx, onUpdate: UpdateFn) {
	const agent = getAgent(cmd.agent, agents);
	if (!agent) return result(`Unknown agent: ${cmd.agent}`, true);
	const out = await dispatchRun(agent, cmd.task, ctx, cmd.main, onUpdate);
	return result(buildResultText(out), !!out.error);
}

const runBatch = async (cmd: Extract<Subcommand, { type: "batch" }>, agents: AgentConfig[], ctx: DispatchCtx, onUpdate: UpdateFn) => {
	const out = await dispatchBatch(cmd.items, agents, ctx, cmd.main, onUpdate);
	return result(out.map((r) => buildResultText(r)).join("\n---\n"), out.some((r) => !!r.error));
};

const runChain = async (cmd: Extract<Subcommand, { type: "chain" }>, agents: AgentConfig[], ctx: DispatchCtx, onUpdate: UpdateFn) => {
	const out = await dispatchChain(cmd.steps, agents, ctx, cmd.main, onUpdate);
	return result(buildResultText(out), !!out.error);
};

const snippet = (agents: AgentConfig[]) => `Dispatch subagents: ${agents.map((a) => `${a.name} (${a.description})`).join(", ") || "none loaded"}`;
const guidelines = (agents: AgentConfig[]) => ["Available agents:", ...agents.map((a) => `  - ${a.name}: ${a.description}`), "Command: run <agent> [--main] -- <task>", "Batch: batch --agent <a> --task <t> [--agent <a> --task <t> ...]", "Chain: chain --agent <a> --task <t> --agent <a> --task '{previous}'", "Manage: continue <id> -- <task>, abort <id>, detail <id>, runs", "The tool blocks until the subagent completes and returns the full result."];

export function createTool(pi: SubagentPi, agentsDir: string) {
	const agents = existsSync(agentsDir) ? loadAgentsFromDir(agentsDir, (d) => readdirSync(d).map(String), readFileSync as (p: string, e: string) => string) : [];
	return defineTool({
		name: "subagent", label: "Subagent", description: "Run isolated subagent processes in separate pi subprocesses with their own context window",
		promptSnippet: snippet(agents), promptGuidelines: guidelines(agents), parameters: SubagentParams,
		async execute(_id: string, params: { command: string }, _signal: AbortSignal | undefined, onUpdate: UpdateFn, ctx: ExtensionContext) {
			try { return await dispatch(parseCommand(params.command), agents, ctx, onUpdate); }
			catch (e) { return result(`Error: ${errorMsg(e)}`, true); }
		},
		renderCall: (args: { command: string }) => renderCall(args), renderResult: (res) => renderResult(res),
	});
}
