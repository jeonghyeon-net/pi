import type { AgentToolUpdateCallback } from "@mariozechner/pi-coding-agent";
import { previewText } from "./format.js";
import type { ParsedEvent } from "./parser.js";
import { type HistoryEvent } from "./session.js";
import { addRun, listRuns, removeRun } from "./store.js";
import type { SubagentToolDetails } from "./types.js";
import { clearToolState, setCurrentMessage, setCurrentTool, startWidgetTimer, stopWidgetTimer, syncWidget } from "./widget.js";
import type { DispatchCtx } from "./run-factory.js";

const MAX_RECENT_LINES = 6;
type OnUpdate = AgentToolUpdateCallback<SubagentToolDetails> | undefined;

export function registerRun(id: number, agent: string, task: string, ctx: DispatchCtx, ac: AbortController) {
	addRun({ id, agent, task, startedAt: Date.now(), abort: () => ac.abort() });
	if (listRuns().length === 1) startWidgetTimer(ctx, listRuns);
}

export function unregisterRun(id: number) {
	clearToolState(id);
	removeRun(id);
	if (listRuns().length === 0) stopWidgetTimer();
}

export function makeOnEvent(id: number, agent: string, task: string, ctx: DispatchCtx, collected: HistoryEvent[], onUpdate: OnUpdate) {
	const recent: string[] = [];
	let current = "starting", draft = "";
	const emit = () => onUpdate?.({ content: [{ type: "text", text: progressText(agent, id, task, current, recent) }], details: { isError: false } });
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
		if (["tool_start", "tool_update", "tool_end"].includes(evt.type)) setCurrentTool(id, evt.toolName, evt.text);
		if (["message_delta", "message", "agent_end"].includes(evt.type) && (draft || evt.text)) setCurrentMessage(id, evt.type === "message_delta" ? draft : evt.text);
		syncWidget(ctx, listRuns());
		emit();
	};
}

function progressText(agent: string, id: number, task: string, current: string, recent: string[]) {
	return [`⏳ ${agent} #${id} — ${previewText(task, 72)}`, `current: ${current}`, ...recent.map((line) => `  ${line}`)].join("\n");
}
