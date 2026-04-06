import { formatDuration } from "./format.js";
const MAX_VISIBLE = 3;
export function buildWidgetLines(runs, now) {
    return runs.slice(0, MAX_VISIBLE).map((r) => {
        const elapsed = formatDuration(now - r.startedAt);
        return `⟳ ${r.agent} #${r.id} (${elapsed})`;
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
