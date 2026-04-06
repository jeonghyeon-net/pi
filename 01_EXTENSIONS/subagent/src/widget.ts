import { formatDuration } from "./format.js";

const MAX_VISIBLE = 3;
const SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
const IDLE_THRESHOLD_MS = 120_000;

interface MinimalRun { id: number; agent: string; startedAt: number }
interface MinimalCtx { hasUI: boolean; ui: { setWidget(key: string, content: unknown, opts?: unknown): void } }

const currentTools = new Map<number, string>();
const lastEventTime = new Map<number, number>();
let frame = 0;
let timerCtx: MinimalCtx | undefined;
let timerRuns: (() => MinimalRun[]) | undefined;
let timerId: ReturnType<typeof setInterval> | undefined;

export function setCurrentTool(runId: number, toolName: string | undefined, preview?: string): void {
	lastEventTime.set(runId, Date.now());
	if (toolName) {
		const detail = preview ? `${toolName}: ${preview.slice(0, 30)}` : toolName;
		currentTools.set(runId, detail);
	} else { currentTools.delete(runId); }
}

export function buildWidgetLines(runs: MinimalRun[], now: number): string[] {
	frame++;
	const spin = SPINNER[frame % SPINNER.length];
	return runs.slice(0, MAX_VISIBLE).map((r) => {
		const elapsed = formatDuration(now - r.startedAt);
		const lastEvt = lastEventTime.get(r.id) ?? r.startedAt;
		const idle = now - lastEvt;
		if (idle > IDLE_THRESHOLD_MS) {
			return `⚠ ${r.agent} #${r.id} (${elapsed}) idle ${formatDuration(idle)}`;
		}
		const tool = currentTools.get(r.id);
		const suffix = tool ? ` → ${tool}` : "";
		return `${spin} ${r.agent} #${r.id} (${elapsed})${suffix}`;
	});
}

export function syncWidget(ctx: MinimalCtx, runs: MinimalRun[]): void {
	if (!ctx.hasUI) return;
	if (runs.length === 0) { ctx.ui.setWidget("subagent-status", undefined); return; }
	ctx.ui.setWidget("subagent-status", buildWidgetLines(runs, Date.now()), { placement: "belowEditor" });
}

export function startWidgetTimer(ctx: MinimalCtx, getRuns: () => MinimalRun[]): void {
	stopWidgetTimer();
	timerCtx = ctx; timerRuns = getRuns;
	timerId = setInterval(() => { if (timerCtx && timerRuns) syncWidget(timerCtx, timerRuns()); }, 150);
}

export function stopWidgetTimer(): void {
	if (timerId) { clearInterval(timerId); timerId = undefined; }
	timerCtx = undefined; timerRuns = undefined;
}

export function clearToolState(runId: number): void {
	currentTools.delete(runId); lastEventTime.delete(runId);
}

export function resetWidgetState(): void {
	currentTools.clear(); lastEventTime.clear(); frame = 0; stopWidgetTimer();
}
