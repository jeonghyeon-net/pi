import { formatDuration } from "./format.js";

const MAX_VISIBLE = 3;

interface MinimalRun { id: number; agent: string; startedAt: number }
interface MinimalCtx { hasUI: boolean; ui: { setWidget(key: string, content: unknown, opts?: unknown): void } }

const currentTools = new Map<number, string>();

export function setCurrentTool(runId: number, toolName: string | undefined): void {
	if (toolName) currentTools.set(runId, toolName);
	else currentTools.delete(runId);
}

export function buildWidgetLines(runs: MinimalRun[], now: number): string[] {
	return runs.slice(0, MAX_VISIBLE).map((r) => {
		const elapsed = formatDuration(now - r.startedAt);
		const tool = currentTools.get(r.id);
		const suffix = tool ? ` → ${tool}` : "";
		return `⟳ ${r.agent} #${r.id} (${elapsed})${suffix}`;
	});
}

export function syncWidget(ctx: MinimalCtx, runs: MinimalRun[]): void {
	if (!ctx.hasUI) return;
	if (runs.length === 0) { ctx.ui.setWidget("subagent-status", undefined); return; }
	ctx.ui.setWidget("subagent-status", buildWidgetLines(runs, Date.now()), { placement: "belowEditor" });
}

export function clearToolState(runId: number): void { currentTools.delete(runId); }
export function resetWidgetState(): void { currentTools.clear(); }
