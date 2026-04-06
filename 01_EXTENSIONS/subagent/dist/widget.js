import { formatDuration } from "./format.js";
const MAX_VISIBLE = 3;
const currentTools = new Map();
export function setCurrentTool(runId, toolName) {
    if (toolName)
        currentTools.set(runId, toolName);
    else
        currentTools.delete(runId);
}
export function buildWidgetLines(runs, now) {
    return runs.slice(0, MAX_VISIBLE).map((r) => {
        const elapsed = formatDuration(now - r.startedAt);
        const tool = currentTools.get(r.id);
        const suffix = tool ? ` → ${tool}` : "";
        return `⟳ ${r.agent} #${r.id} (${elapsed})${suffix}`;
    });
}
export function syncWidget(ctx, runs) {
    if (!ctx.hasUI)
        return;
    if (runs.length === 0) {
        ctx.ui.setWidget("subagent-status", undefined);
        return;
    }
    ctx.ui.setWidget("subagent-status", buildWidgetLines(runs, Date.now()), { placement: "belowEditor" });
}
export function clearToolState(runId) { currentTools.delete(runId); }
export function resetWidgetState() { currentTools.clear(); }
