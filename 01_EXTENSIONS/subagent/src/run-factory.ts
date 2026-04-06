import { writeFileSync, existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import type { AgentConfig, RunResult } from "./types.js";
import type { ParsedEvent } from "./parser.js";
import { getPiCommand, buildArgs } from "./runner.js";
import { withRetry } from "./retry.js";
import { extractMainContext, type Entry } from "./context.js";
import { nextId, addRun, removeRun, listRuns } from "./store.js";
import { addToHistory, sessionPath, type HistoryEvent } from "./session.js";
import { MAX_RETRIES, RETRY_BASE_MS } from "./constants.js";
import { spawnAndCollect } from "./spawn.js";
import { syncWidget, setCurrentTool, clearToolState, startWidgetTimer, stopWidgetTimer } from "./widget.js";

export interface DispatchCtx {
	hasUI: boolean;
	ui: { setWidget(k: string, v: unknown, o?: unknown): void };
	sessionManager: { getBranch(): unknown[] };
}

type OnUpdate = ((partial: { content: Array<{ type: string; text: string }> }) => void) | undefined;

function makeOnEvent(id: number, ctx: DispatchCtx, collected: HistoryEvent[], texts: string[], onUpdate: OnUpdate) {
	return (evt: ParsedEvent) => {
		collected.push({ type: evt.type, text: evt.text, toolName: evt.toolName });
		if (evt.type === "tool_start") {
			setCurrentTool(id, evt.toolName, evt.toolName); syncWidget(ctx, listRuns());
			texts.push(`→ ${evt.toolName ?? ""}`);
			onUpdate?.({ content: [{ type: "text", text: texts.join("\n") }] });
		}
		if (evt.type === "tool_end") { setCurrentTool(id, undefined); syncWidget(ctx, listRuns()); }
		if (evt.type === "message" && evt.text) {
			texts.push(evt.text);
			onUpdate?.({ content: [{ type: "text", text: texts.join("\n") }] });
		}
	};
}

export function createRunner(
	main: boolean,
	ctx: DispatchCtx,
	onUpdate?: OnUpdate,
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
		const args = buildArgs({ base, model: agent.model, thinking: agent.thinking, tools: agent.tools, systemPromptPath: promptPath, task, sessionPath: sessPath });
		const ac = new AbortController();
		addRun({ id, agent: agent.name, startedAt: Date.now(), abort: () => ac.abort() });
		if (listRuns().length === 1) startWidgetTimer(ctx, listRuns);
		const collected: HistoryEvent[] = [];
		const texts: string[] = [];
		const onEvent = makeOnEvent(id, ctx, collected, texts, onUpdate);
		try {
			const result = await withRetry(() => spawnAndCollect(cmd, args, id, agent.name, ac.signal, onEvent), MAX_RETRIES, RETRY_BASE_MS);
			addToHistory({ id, agent: agent.name, output: result.output, sessionFile: sessPath, events: collected });
			return result;
		} finally { clearToolState(id); removeRun(id); if (listRuns().length === 0) stopWidgetTimer(); }
	};
}

export function createSessionRunner(
	sessFile: string,
	ctx: DispatchCtx,
	onUpdate?: OnUpdate,
): (agent: AgentConfig, task: string) => Promise<RunResult> {
	return async (agent, task) => {
		const id = nextId();
		const { cmd, base } = getPiCommand(process.execPath, process.argv[1], existsSync);
		const args = buildArgs({ base, model: agent.model, thinking: agent.thinking, tools: agent.tools, systemPromptPath: "", task, sessionPath: sessFile });
		const idx = args.indexOf("--append-system-prompt");
		if (idx !== -1) args.splice(idx, 2);
		const ac = new AbortController();
		addRun({ id, agent: agent.name, startedAt: Date.now(), abort: () => ac.abort() });
		if (listRuns().length === 1) startWidgetTimer(ctx, listRuns);
		const collected: HistoryEvent[] = [];
		const texts: string[] = [];
		const onEvent = makeOnEvent(id, ctx, collected, texts, onUpdate);
		try {
			const result = await withRetry(() => spawnAndCollect(cmd, args, id, agent.name, ac.signal, onEvent), MAX_RETRIES, RETRY_BASE_MS);
			addToHistory({ id, agent: agent.name, output: result.output, sessionFile: sessFile, events: collected });
			return result;
		} finally { clearToolState(id); removeRun(id); if (listRuns().length === 0) stopWidgetTimer(); }
	};
}
