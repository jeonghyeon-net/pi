import { previewText } from "./format.js";
import { buildNestedRunSnapshots, buildNestedRunSnapshotsForRun, buildWidgetComponent, buildWidgetLinesWithFrame, type MinimalRun } from "./widget-view.js";
import { clearNestedRunsState, clearToolStateState, resetWidgetStore, setActivity, setNestedRunsState } from "./widget-state.js";
import type { NestedRunSnapshot } from "./types.js";

interface MinimalCtx { hasUI: boolean; ui: { setWidget(key: string, content: unknown, opts?: unknown): void } }
let frame = 0, timerCtx: MinimalCtx | undefined, timerRuns: (() => MinimalRun[]) | undefined, timerId: ReturnType<typeof setInterval> | undefined, completedWidget: unknown | undefined;

export function setCurrentTool(runId: number, toolName: string | undefined, preview?: string): void {
	if (!toolName) { setActivity(runId, undefined); return; }
	setActivity(runId, preview ? `${toolName}: ${previewText(preview, 30)}` : toolName);
}

export const setCurrentMessage = (runId: number, preview: string | undefined) => setActivity(runId, preview ? `reply: ${previewText(preview, 30)}` : undefined);
export const setNestedRuns = (runId: number, runs: NestedRunSnapshot[] | undefined) => setNestedRunsState(runId, runs);
export const clearNestedRuns = (runId: number) => clearNestedRunsState(runId);
export const buildNestedRunSnapshotsForRunId = buildNestedRunSnapshotsForRun;
export const buildNestedRunSnapshotsFromRuns = buildNestedRunSnapshots;
export const advanceFrame = () => void frame++;
export const buildWidgetLines = (runs: MinimalRun[], now: number) => buildWidgetLinesWithFrame(runs, now, frame);

export function rememberCompletedWidget(runs: MinimalRun[]): void {
	if (runs.length === 0) return;
	completedWidget = buildWidgetComponent(runs, Date.now(), frame);
}

export function syncWidget(ctx: MinimalCtx, runs: MinimalRun[]): void {
	if (!ctx.hasUI) return;
	if (runs.length === 0) {
		ctx.ui.setWidget("subagent-status", completedWidget, completedWidget ? { placement: "belowEditor" } : undefined);
		return;
	}
	completedWidget = undefined;
	ctx.ui.setWidget("subagent-status", buildWidgetComponent(runs, Date.now(), frame), { placement: "belowEditor" });
}

export function startWidgetTimer(ctx: MinimalCtx, getRuns: () => MinimalRun[]): void {
	stopWidgetTimer();
	timerCtx = ctx;
	timerRuns = getRuns;
	timerId = setInterval(() => {
		frame++;
		if (timerCtx && timerRuns) syncWidget(timerCtx, timerRuns());
	}, 150);
}

export function stopWidgetTimer(): void {
	if (timerId) { clearInterval(timerId); timerId = undefined; }
	timerCtx = undefined;
	timerRuns = undefined;
}

export function clearToolState(runId: number): void { clearToolStateState(runId); }
export function resetWidgetState(): void { resetWidgetStore(); frame = 0; completedWidget = undefined; stopWidgetTimer(); }
export { buildNestedRunSnapshotsFromRuns as buildNestedRunSnapshots, buildNestedRunSnapshotsForRunId as buildNestedRunSnapshotsForRun };
