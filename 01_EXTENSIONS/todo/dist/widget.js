import { clearTodos, getState, buildEntry } from "./state.js";
import { createWidgetFactory } from "./render.js";
export const WIDGET_KEY = "todo";
const HIDE_AFTER_TURNS = 2;
const HIDE_AFTER_MS = 90_000;
let spinnerTimer;
let hideTimer;
let agentRunning = false;
let currentTurn = 0;
let completedAt;
let completedTurn;
let latestCtx;
let latestPi;
export function setAgentRunning(running) {
    agentRunning = running;
}
export function incrementTurn() {
    currentTurn++;
}
function clearSpinnerTimer() {
    if (!spinnerTimer)
        return;
    clearInterval(spinnerTimer);
    spinnerTimer = undefined;
}
function clearHideTimer() {
    if (!hideTimer)
        return;
    clearTimeout(hideTimer);
    hideTimer = undefined;
}
export function syncWidget(ctx, pi) {
    latestCtx = ctx;
    if (pi)
        latestPi = pi;
    if (!ctx.hasUI)
        return;
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
    }
    else {
        completedAt ??= Date.now();
        completedTurn ??= currentTurn;
        if (currentTurn - completedTurn >= HIDE_AFTER_TURNS || Date.now() - completedAt >= HIDE_AFTER_MS) {
            clearHideTimer();
            clearTodos();
            if (latestPi)
                latestPi.appendEntry("todo-state", buildEntry());
            ctx.ui.setWidget(WIDGET_KEY, undefined);
            return;
        }
        clearHideTimer();
        const remainingMs = Math.max(0, HIDE_AFTER_MS - (Date.now() - completedAt));
        hideTimer = setTimeout(() => {
            hideTimer = undefined;
            if (latestCtx)
                syncWidget(latestCtx, latestPi);
        }, remainingMs);
    }
    const firstActive = todos.find((t) => !t.done);
    const factory = createWidgetFactory(todos, firstActive, agentRunning, (timer) => {
        spinnerTimer = timer;
    });
    ctx.ui.setWidget(WIDGET_KEY, factory);
}
export function cleanupWidget(ctx) {
    clearSpinnerTimer();
    clearHideTimer();
    agentRunning = false;
    currentTurn = 0;
    completedAt = undefined;
    completedTurn = undefined;
    latestCtx = undefined;
    latestPi = undefined;
    if (!ctx.hasUI)
        return;
    ctx.ui.setWidget(WIDGET_KEY, undefined);
}
