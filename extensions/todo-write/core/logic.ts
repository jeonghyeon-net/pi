/**
 * Pure business logic for todo-write.
 * Handles task normalization, application, and visibility calculation.
 */

import { TODO_HIDE_COMPLETED_AFTER_MS, TODO_HIDE_COMPLETED_AFTER_TURNS } from "./constants.js";
import type {
  TodoState,
  TodoStatus,
  TodoTask,
  TodoWidgetMeta,
  TodoWidgetVisibility,
} from "./types.js";

// ── Task normalization ───────────────────────────────────────────────────────

/**
 * Enforce the invariant that at most one task is in_progress.
 * If none is in_progress, promote the first pending task.
 * Returns a new array (does not mutate the input).
 */
export function normalizeInProgressTasks(tasks: readonly TodoTask[]): TodoTask[] {
  if (tasks.length === 0) return [];

  let foundFirst = false;
  const result: TodoTask[] = tasks.map((t) => {
    if (t.status !== "in_progress") return { ...t };
    if (!foundFirst) {
      foundFirst = true;
      return { ...t };
    }
    // Demote extra in_progress tasks to pending
    return { ...t, status: "pending" as TodoStatus };
  });

  // If none in_progress, promote first pending
  if (!foundFirst) {
    const firstPendingIdx = result.findIndex((t) => t.status === "pending");
    if (firstPendingIdx >= 0) {
      const task = result[firstPendingIdx];
      if (task) {
        result[firstPendingIdx] = { ...task, status: "in_progress" as TodoStatus };
      }
    }
  }

  return result;
}

// ── Query helpers ────────────────────────────────────────────────────────────

export function hasRemainingTasks(state: TodoState): boolean {
  return state.tasks.some((task) => task.status === "pending" || task.status === "in_progress");
}

export function hasInProgressTask(state: TodoState): boolean {
  return state.tasks.some((task) => task.status === "in_progress");
}

export function getTaskCount(state: TodoState): number {
  return state.tasks.length;
}

// ── Apply todo write ─────────────────────────────────────────────────────────

export type InputTodo = {
  content: string;
  status: TodoStatus;
  activeForm?: string;
  notes?: string;
};

export function applyTodoWrite(todos: readonly InputTodo[]): TodoState {
  const tasks: TodoTask[] = todos.map((todo, index) => {
    const task: TodoTask = {
      id: `task-${String(index + 1)}`,
      content: todo.content,
      status: todo.status,
    };
    if (todo.activeForm !== undefined) {
      task.activeForm = todo.activeForm;
    }
    if (todo.notes !== undefined) {
      task.notes = todo.notes;
    }
    return task;
  });
  const normalized = normalizeInProgressTasks(tasks);
  return { tasks: normalized };
}

// ── Visibility ───────────────────────────────────────────────────────────────

export function getWidgetVisibility(
  state: TodoState,
  meta: TodoWidgetMeta | undefined,
  currentTurn: number,
  now: number,
): TodoWidgetVisibility {
  if (getTaskCount(state) === 0) {
    return { hidden: true, completionGraceActive: false };
  }

  if (hasRemainingTasks(state)) {
    return { hidden: false, completionGraceActive: false };
  }

  const completedTurn = meta?.completedTurn ?? currentTurn;
  const completedAt = meta?.completedAt ?? now;
  const elapsedTurns = Math.max(0, currentTurn - completedTurn);
  const elapsedMs = Math.max(0, now - completedAt);
  const hidden =
    elapsedTurns >= TODO_HIDE_COMPLETED_AFTER_TURNS || elapsedMs >= TODO_HIDE_COMPLETED_AFTER_MS;

  return {
    hidden,
    completionGraceActive: !hidden,
    meta: { completedAt, completedTurn },
  };
}
