import { formatDuration, previewText } from "./format.js";

const MAX_VISIBLE = 3;
const SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
const IDLE_THRESHOLD_MS = 120_000;

interface MinimalRun { id: number; agent: string; task?: string; startedAt: number }
interface MinimalCtx { hasUI: boolean; ui: { setWidget(key: string, content: unknown, opts?: unknown): void } }

const currentActivity = new Map<number, string>();
const lastEventTime = new Map<number, number>();
let frame = 0;
let timerCtx: MinimalCtx | undefined;
let timerRuns: (() => MinimalRun[]) | undefined;
let timerId: ReturnType<typeof setInterval> | undefined;

function setActivity(runId: number, activity: string | undefined): void {
	lastEventTime.set(runId, Date.now());
	if (activity) currentActivity.set(runId, activity);
	else currentActivity.delete(runId);
}

export function setCurrentTool(runId: number, toolName: string | undefined, preview?: string): void {
	if (!toolName) { setActivity(runId, undefined); return; }
	const detail = preview ? `${toolName}: ${previewText(preview, 30)}` : toolName;
	setActivity(runId, detail);
}

export function setCurrentMessage(runId: number, preview: string | undefined): void {
	setActivity(runId, preview ? `reply: ${previewText(preview, 30)}` : undefined);
}

export function advanceFrame(): void { frame++; }

export function buildWidgetLines(runs: MinimalRun[], now: number): string[] {
	const spin = SPINNER[frame % SPINNER.length];
	return runs.slice(0, MAX_VISIBLE).map((r) => {
		const elapsed = formatDuration(now - r.startedAt);
		const lastEvt = lastEventTime.get(r.id) ?? r.startedAt;
		const idle = now - lastEvt;
		const activity = currentActivity.get(r.id);
		const task = r.task ? ` — ${previewText(r.task, 28)}` : "";
		if (idle > IDLE_THRESHOLD_MS) {
			return `⚠ ${r.agent} #${r.id}${task} (${elapsed}) idle ${formatDuration(idle)}`;
		}
		const suffix = activity ? ` → ${activity}` : "";
		return `${spin} ${r.agent} #${r.id}${task} (${elapsed})${suffix}`;
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
	timerId = setInterval(() => { frame++; if (timerCtx && timerRuns) syncWidget(timerCtx, timerRuns()); }, 150);
}

export function stopWidgetTimer(): void {
	if (timerId) { clearInterval(timerId); timerId = undefined; }
	timerCtx = undefined; timerRuns = undefined;
}

export function clearToolState(runId: number): void {
	currentActivity.delete(runId); lastEventTime.delete(runId);
}

export function resetWidgetState(): void {
	currentActivity.clear(); lastEventTime.clear(); frame = 0; stopWidgetTimer();
}
