import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { clearTodos, getState, buildEntry } from "./state.js";
import { createWidgetFactory } from "./render.js";

export const WIDGET_KEY = "todo";
const HIDE_AFTER_TURNS = 2;
const HIDE_AFTER_MS = 90_000;

export type Persister = { appendEntry(type: string, data: unknown): void };

type WidgetCtx = Pick<ExtensionContext, "hasUI"> & {
	ui: { setWidget(key: string, content: unknown, options?: unknown): void };
};

let spinnerTimer: ReturnType<typeof setInterval> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let agentRunning = false;
let currentTurn = 0;
let completedAt: number | undefined;
let completedTurn: number | undefined;
let latestCtx: WidgetCtx | undefined;
let latestPi: Persister | undefined;

export function setAgentRunning(running: boolean): void {
	agentRunning = running;
}

export function incrementTurn(): void {
	currentTurn++;
}

function clearSpinnerTimer(): void {
	if (!spinnerTimer) return;
	clearInterval(spinnerTimer);
	spinnerTimer = undefined;
}

function clearHideTimer(): void {
	if (!hideTimer) return;
	clearTimeout(hideTimer);
	hideTimer = undefined;
}

export function syncWidget(ctx: WidgetCtx, pi?: Persister): void {
	latestCtx = ctx;
	if (pi) latestPi = pi;
	if (!ctx.hasUI) return;

	clearSpinnerTimer();
	const { todos } = getState();

	if (todos.length === 0) {
		clearHideTimer();
		ctx.ui.setWidget(WIDGET_KEY, undefined);
		return;
	}

	const hasRemaining = todos.some((t) => !t.done);

	if (hasRemaining) {
		completedAt = undefined;
		completedTurn = undefined;
	} else {
		completedAt ??= Date.now();
		completedTurn ??= currentTurn;
		if (currentTurn - completedTurn >= HIDE_AFTER_TURNS || Date.now() - completedAt >= HIDE_AFTER_MS) {
			clearHideTimer();
			clearTodos();
			if (latestPi) latestPi.appendEntry("todo-state", buildEntry());
			ctx.ui.setWidget(WIDGET_KEY, undefined);
			return;
		}
		clearHideTimer();
		const remainingMs = Math.max(0, HIDE_AFTER_MS - (Date.now() - completedAt));
		hideTimer = setTimeout(() => {
			hideTimer = undefined;
			if (latestCtx) syncWidget(latestCtx, latestPi);
		}, remainingMs);
	}

	const firstActive = todos.find((t) => !t.done);
	const factory = createWidgetFactory(todos, firstActive, agentRunning, (timer) => {
		spinnerTimer = timer;
	});
	ctx.ui.setWidget(WIDGET_KEY, factory);
}

export function cleanupWidget(ctx: WidgetCtx): void {
	clearSpinnerTimer();
	clearHideTimer();
	agentRunning = false;
	currentTurn = 0;
	completedAt = undefined;
	completedTurn = undefined;
	latestCtx = undefined;
	latestPi = undefined;
	if (!ctx.hasUI) return;
	ctx.ui.setWidget(WIDGET_KEY, undefined);
}
