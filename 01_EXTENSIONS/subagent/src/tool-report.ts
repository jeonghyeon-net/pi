import { previewText } from "./format.js";
import { listRuns } from "./store.js";
import { getRunHistory } from "./session.js";

export function formatRunsList(): string {
	const active = listRuns();
	const history = getRunHistory();
	const parts: string[] = [];
	if (active.length) parts.push(`Active (${active.length}):\n${active.map(formatRun).join("\n")}`);
	if (history.length) parts.push(`History (${history.length}):\n${history.map(formatRun).join("\n")}`);
	return parts.join("\n\n") || "No runs";
}

function formatRun(r: { id: number; agent: string; task?: string; error?: string }) {
	return `  #${r.id} ${r.agent}${r.task ? ` — ${previewText(r.task, 80)}` : ""}${r.error ? " [error]" : ""}`;
}

export function formatDetail(id: number): string {
	const item = getRunHistory().find((r) => r.id === id);
	if (!item) return `Run #${id} not found`;
	const parts = [`# ${item.agent} #${id}`];
	if (item.task) parts.push(`task: ${item.task}`);
	if (item.sessionFile) parts.push(`session: ${item.sessionFile}`);
	parts.push(item.error ? `status: error — ${item.error}` : "status: ok");
	if (item.events?.length) parts.push("events:", ...item.events.flatMap(formatEvent));
	if (item.output) parts.push("", "output:", item.output);
	else if (!item.events?.length) parts.push("(no output)");
	return parts.join("\n");
}

function formatEvent(evt: { type: string; text?: string; toolName?: string; isError?: boolean; stopReason?: string }): string[] {
	if (evt.type === "tool_start") return [`  → ${evt.toolName}${evt.text ? `: ${previewText(evt.text, 120)}` : ""}`];
	if (evt.type === "tool_update" && evt.text) return [`  ↳ ${evt.toolName ?? "tool"}: ${previewText(evt.text, 120)}`];
	if (evt.type === "tool_end") return [`  ${evt.isError ? "✗" : "✓"} ${evt.toolName ?? "tool"}${evt.text ? `: ${previewText(evt.text, 120)}` : ""}`];
	if (evt.type === "message_delta" && evt.text) return [`  … ${previewText(evt.text, 120)}`];
	if (evt.type === "message" && evt.text) return [`  💬 ${evt.text}`];
	if (evt.type === "agent_end" && evt.stopReason) return [`  done: ${evt.stopReason}`];
	return [];
}
