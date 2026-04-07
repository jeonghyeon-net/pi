import type { SubagentPi, AgentConfig } from "./types.js";
import { SubagentParams } from "./types.js";
import { parseCommand } from "./cli.js";
import { loadAgentsFromDir, getAgent } from "./agents.js";
import { listRuns } from "./store.js";
import { getRunHistory } from "./session.js";
import { dispatchRun, dispatchBatch, dispatchChain, dispatchAbort, dispatchContinue } from "./dispatch.js";
import type { DispatchCtx } from "./dispatch.js";
import { readdirSync, readFileSync, existsSync } from "fs";
import type { Subcommand } from "./types.js";
import { renderCall, renderResult, buildResultText } from "./render.js";

function textResult(text: string, isError = false) {
	return { content: [{ type: "text" as const, text }], details: { isError } };
}
export function errorMsg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

function formatRunsList(): string {
	const active = listRuns();
	const history = getRunHistory();
	const parts: string[] = [];
	if (active.length) parts.push(`Active (${active.length}):\n` + active.map((r) => `  #${r.id} ${r.agent}`).join("\n"));
	if (history.length) parts.push(`History (${history.length}):\n` + history.map((r) => `  #${r.id} ${r.agent}`).join("\n"));
	return parts.join("\n\n") || "No runs";
}

function formatDetail(id: number): string {
	const item = getRunHistory().find((r) => r.id === id);
	if (!item) return `Run #${id} not found`;
	const parts = [`# ${item.agent} #${id}`];
	if (item.events?.length) {
		for (const evt of item.events) {
			if (evt.type === "tool_start") parts.push(`  → ${evt.toolName}`);
			if (evt.type === "message" && evt.text) parts.push(`  ${evt.text}`);
		}
	} else { parts.push(item.output ?? "(no output)"); }
	return parts.join("\n");
}

type UpdateFn = ((partial: { content: Array<{ type: string; text: string }> }) => void) | undefined;

async function dispatch(cmd: Subcommand, agents: AgentConfig[], pi: SubagentPi, ctx: DispatchCtx, onUpdate: UpdateFn) {
	if (cmd.type === "runs") return textResult(formatRunsList());
	if (cmd.type === "detail") return textResult(formatDetail(cmd.id));
	if (cmd.type === "abort") return textResult(dispatchAbort(cmd.id));
	if (cmd.type === "run") {
		const agent = getAgent(cmd.agent, agents);
		if (!agent) return textResult(`Unknown agent: ${cmd.agent}`);
		return textResult(buildResultText(await dispatchRun(agent, cmd.task, ctx, cmd.main, onUpdate)));
	}
	if (cmd.type === "batch") {
		const results = await dispatchBatch(cmd.items, agents, ctx, cmd.main, onUpdate);
		return textResult(results.map((r) => buildResultText(r)).join("\n---\n"));
	}
	if (cmd.type === "chain") return textResult(buildResultText(await dispatchChain(cmd.steps, agents, ctx, cmd.main, onUpdate)));
	const cont = await dispatchContinue(cmd.id, cmd.task, agents, ctx, onUpdate);
	return typeof cont === "string" ? textResult(cont) : textResult(buildResultText(cont));
}

function buildSnippet(agents: AgentConfig[]): string {
	return `Dispatch subagents: ${agents.map((a) => `${a.name} (${a.description})`).join(", ") || "none loaded"}`;
}

function buildGuidelines(agents: AgentConfig[]): string[] {
	return [
		"Available agents:",
		...agents.map((a) => `  - ${a.name}: ${a.description}`),
		"Command: run <agent> [--main] -- <task>",
		"Batch: batch --agent <a> --task <t> [--agent <a> --task <t> ...]",
		"Chain: chain --agent <a> --task <t> --agent <a> --task '{previous}'",
		"Manage: continue <id> -- <task>, abort <id>, detail <id>, runs",
		"The tool blocks until the subagent completes and returns the full result.",
	];
}

export function createTool(pi: SubagentPi, agentsDir: string) {
	const agents = existsSync(agentsDir)
		? loadAgentsFromDir(agentsDir, (d) => readdirSync(d).map(String), readFileSync as (p: string, e: string) => string)
		: [];
	return {
		name: "subagent", label: "Subagent",
		description: "Run isolated subagent processes in separate pi subprocesses with their own context window",
		promptSnippet: buildSnippet(agents),
		promptGuidelines: buildGuidelines(agents),
		parameters: SubagentParams,
		async execute(_id: string, params: { command: string }, _signal: unknown, onUpdate: UpdateFn, ctx: DispatchCtx) {
			try { return await dispatch(parseCommand(params.command), agents, pi, ctx, onUpdate); }
			catch (e) { return textResult(`Error: ${errorMsg(e)}`, true); }
		},
		renderCall: (args: { command: string }) => renderCall(args),
		renderResult: (result: { content: Array<{ type: string; text: string }>; details?: { isError?: boolean } }) => renderResult(result),
	};
}
