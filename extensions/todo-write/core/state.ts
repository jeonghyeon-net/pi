/**
 * In-memory state management for todo-write.
 * Manages the session-keyed state stores, turn counters, and agent-running flags.
 */

import type { StateKeyContext, TodoState, TodoTask, TodoWidgetMeta } from "./types.js";

// ── Internal stores ──────────────────────────────────────────────────────────

const todoStateStore = new Map<string, TodoState>();
const todoWidgetMetaStore = new Map<string, TodoWidgetMeta>();
const todoWidgetAgentRunningStore = new Map<string, boolean>();
const todoTurnStore = new Map<string, number>();

// ── Helpers ──────────────────────────────────────────────────────────────────

function cloneTasks(tasks: readonly TodoTask[]): TodoTask[] {
  return tasks.map((task) => ({ ...task }));
}

export function createEmptyState(): TodoState {
  return { tasks: [] };
}

export function getStateKey(ctx: StateKeyContext): string {
  const sessionFile = ctx.sessionManager.getSessionFile?.();
  return sessionFile ? `session:${sessionFile}` : `cwd:${ctx.cwd}`;
}

// ── State read/write ─────────────────────────────────────────────────────────

export function readState(ctx: StateKeyContext): TodoState {
  const key = getStateKey(ctx);
  const state = todoStateStore.get(key);
  return state ? { tasks: cloneTasks(state.tasks) } : createEmptyState();
}

export function writeState(ctx: StateKeyContext, state: TodoState): void {
  const key = getStateKey(ctx);
  if (state.tasks.length === 0) {
    todoStateStore.delete(key);
    return;
  }
  todoStateStore.set(key, { tasks: cloneTasks(state.tasks) });
}

// ── Widget meta ──────────────────────────────────────────────────────────────

export function getWidgetMeta(key: string): TodoWidgetMeta | undefined {
  return todoWidgetMetaStore.get(key);
}

export function setWidgetMeta(key: string, meta: TodoWidgetMeta): void {
  todoWidgetMetaStore.set(key, meta);
}

export function deleteWidgetMeta(key: string): void {
  todoWidgetMetaStore.delete(key);
}

// ── Agent running ────────────────────────────────────────────────────────────

export function getAgentRunning(key: string): boolean {
  return todoWidgetAgentRunningStore.get(key) ?? false;
}

export function setAgentRunning(ctx: StateKeyContext, running: boolean): void {
  const key = getStateKey(ctx);
  todoWidgetAgentRunningStore.set(key, running);
}

export function deleteAgentRunning(key: string): void {
  todoWidgetAgentRunningStore.delete(key);
}

// ── Turn counter ─────────────────────────────────────────────────────────────

export function getTurn(key: string): number {
  return todoTurnStore.get(key) ?? 0;
}

export function incrementTurn(ctx: StateKeyContext): void {
  const key = getStateKey(ctx);
  todoTurnStore.set(key, getTurn(key) + 1);
}

export function deleteTurn(key: string): void {
  todoTurnStore.delete(key);
}
