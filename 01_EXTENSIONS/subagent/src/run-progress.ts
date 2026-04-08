import type { AgentToolUpdateCallback } from "@mariozechner/pi-coding-agent";
import { previewText } from "./format.js";
import type { ParsedEvent } from "./parser.js";
import { formatRunTrees } from "./run-tree.js";
import { type HistoryEvent } from "./session.js";
import { addRun, listRuns, removeRun } from "./store.js";
import { isSubagentToolName } from "./tool-names.js";
import type { NestedRunSnapshot, SubagentToolDetails } from "./types.js";
import {
	buildNestedRunSnapshotsForRun,
	clearNestedRuns,
	clearToolState,
	setCurrentMessage,
	rememberCompletedWidget,
	setCurrentTool,
	setNestedRuns,
	startWidgetTimer,
	stopWidgetTimer,
	syncWidget,
} from "./widget.js";
import type { DispatchCtx } from "./run-factory.js";

const MAX_RECENT_LINES = 8;
type OnUpdate = AgentToolUpdateCallback<SubagentToolDetails> | undefined;

export function registerRun(id: number, agent: string, task: string, ctx: DispatchCtx, ac: AbortController) {
	addRun({ id, agent, task, startedAt: Date.now(), abort: () => ac.abort() });
	if (listRuns().length === 1) startWidgetTimer(ctx, listRuns);
}

export function unregisterRun(id: number) {
	const runs = listRuns();
	if (runs.length === 1 && runs[0]?.id === id) rememberCompletedWidget(runs);
	clearNestedRuns(id);
	clearToolState(id);
	removeRun(id);
	if (listRuns().length === 0) stopWidgetTimer();
}

export function makeOnEvent(id: number, agent: string, task: string, ctx: DispatchCtx, collected: HistoryEvent[], onUpdate: OnUpdate) {
	const recent: string[] = [];
	let current = "starting", draft = "";
	const emit = () => {
		const currentRun = listRuns().find((run) => run.id === id);
		const activeRuns = buildNestedRunSnapshotsForRun(currentRun);
		onUpdate?.({
			content: [{ type: "text", text: progressText(agent, id, task, current, recent, activeRuns) }],
			details: { isError: false, activeRuns },
		});
	};
	const pushRecent = (line: string) => { recent.push(line); if (recent.length > MAX_RECENT_LINES) recent.shift(); };
	return (evt: ParsedEvent) => {
		collected.push({ type: evt.type, text: evt.text, toolName: evt.toolName, isError: evt.isError, stopReason: evt.stopReason });
		if (evt.type === "tool_start") current = `running ${evt.toolName ?? "tool"}${evt.text ? `: ${previewText(evt.text, 72)}` : ""}`;
		if (evt.type === "tool_start") pushRecent(`→ ${evt.toolName ?? "tool"}${evt.text ? `: ${previewText(evt.text, 96)}` : ""}`);
		if (evt.type === "tool_update" && evt.toolName) current = `${evt.toolName}${evt.text ? `: ${previewText(evt.text, 72)}` : ""}`;
		if (evt.type === "tool_end") current = `${evt.toolName ?? "tool"} ${evt.isError ? "failed" : "finished"}`;
		if (evt.type === "tool_end" && evt.text) pushRecent(`${evt.isError ? "✗" : "✓"} ${evt.toolName ?? "tool"}: ${previewText(evt.text, 96)}`);
		if (evt.type === "message_delta" && evt.text) { draft += evt.text; current = `drafting reply: ${previewText(draft, 72)}`; }
		if (evt.type === "message") current = evt.stopReason ? `reply ready (${evt.stopReason})` : "reply ready";
		if (evt.type === "message") pushRecent(`💬 ${previewText(evt.text, 120) || "(empty response)"}`);
		if (evt.type === "agent_end") current = evt.stopReason ? `finished (${evt.stopReason})` : "finished";
		if (evt.type === "agent_end" && evt.isError && evt.text) pushRecent(`✗ ${previewText(evt.text, 120)}`);
		if (evt.type === "tool_start" || evt.type === "tool_update") setCurrentTool(id, evt.toolName, evt.text);
		if (evt.type === "tool_end") setCurrentTool(id, undefined);
		if (["message_delta", "message", "agent_end"].includes(evt.type)) setCurrentMessage(id, evt.type === "message_delta" ? draft : evt.text);
		if (isSubagentToolName(evt.toolName)) {
			if (evt.type === "tool_update") setNestedRuns(id, evt.nestedRuns);
			if (evt.type === "tool_end") {
				clearNestedRuns(id);
				for (const line of formatRunTrees(evt.runTrees).slice(0, 4)) pushRecent(`nested ${line}`);
			}
		}
		syncWidget(ctx, listRuns());
		emit();
	};
}

function progressText(agent: string, id: number, task: string, current: string, recent: string[], activeRuns: NestedRunSnapshot[]) {
	return [
		`⏳ ${agent} #${id} — ${previewText(task, 72)}`,
		`current: ${current}`,
		...recent.map((line) => `  ${line}`),
		...nestedProgress(activeRuns, id),
	].join("\n");
}

function nestedProgress(activeRuns: NestedRunSnapshot[], currentRunId: number): string[] {
	return activeRuns
		.filter((run) => run.id !== currentRunId)
		.map((run) => {
		const indent = `${"  ".repeat(Math.max(0, run.depth - 1))}↳ `;
		const task = run.task ? ` — ${previewText(run.task, 36)}` : "";
		const activity = run.activity ? ` → ${previewText(run.activity, 30)}` : "";
			return `nested: ${indent}${run.agent} #${run.id}${task}${activity}`;
		});
}
