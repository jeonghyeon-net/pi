/**
 * Persistence and restoration for todo-write state.
 * Handles saving state entries and restoring from session branches.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { TODO_STATE_ENTRY_TYPE } from "./constants.js";
import { normalizeInProgressTasks } from "./logic.js";
import { createEmptyState, writeState } from "./state.js";
import type {
  PersistedTodoStateEntryData,
  PersistedTodoStatus,
  PersistedTodoTask,
  StateKeyContext,
  TodoState,
  TodoTask,
} from "./types.js";

// ── Type guards ──────────────────────────────────────────────────────────────

function isPersistedStatus(value: unknown): value is PersistedTodoStatus {
  return (
    value === "pending" || value === "in_progress" || value === "completed" || value === "abandoned"
  );
}

function isPersistedTodoTask(value: unknown): value is PersistedTodoTask {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.content === "string" &&
    isPersistedStatus(candidate.status) &&
    (candidate.activeForm === undefined || typeof candidate.activeForm === "string") &&
    (candidate.notes === undefined || typeof candidate.notes === "string")
  );
}

function isPersistedTodoStateEntryData(value: unknown): value is PersistedTodoStateEntryData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.updatedAt === "number" &&
    Array.isArray(candidate.tasks) &&
    (candidate.tasks as unknown[]).every((task) => isPersistedTodoTask(task))
  );
}

// ── Migration ────────────────────────────────────────────────────────────────

/** Map legacy `abandoned` status to `completed`. */
function migrateLegacyTasks(tasks: readonly PersistedTodoTask[]): TodoTask[] {
  return tasks.map((task) => ({
    ...task,
    status: task.status === "abandoned" ? ("completed" as const) : task.status,
  }));
}

// ── Persist ──────────────────────────────────────────────────────────────────

type TodoStateEntryData = {
  tasks: TodoTask[];
  updatedAt: number;
};

export function persistStateEntry(pi: Pick<ExtensionAPI, "appendEntry">, state: TodoState): void {
  pi.appendEntry<TodoStateEntryData>(TODO_STATE_ENTRY_TYPE, {
    tasks: state.tasks.map((t) => ({ ...t })),
    updatedAt: Date.now(),
  });
}

export function clearState(ctx: StateKeyContext, pi: Pick<ExtensionAPI, "appendEntry">): void {
  const empty = createEmptyState();
  writeState(ctx, empty);
  persistStateEntry(pi, empty);
}

// ── Restore ──────────────────────────────────────────────────────────────────

export function restoreState(ctx: StateKeyContext): TodoState {
  const branch = ctx.sessionManager.getBranch();
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (entry?.type !== "custom" || entry.customType !== TODO_STATE_ENTRY_TYPE) {
      continue;
    }
    if (isPersistedTodoStateEntryData(entry.data)) {
      const tasks = normalizeInProgressTasks(migrateLegacyTasks(entry.data.tasks));
      const restored: TodoState = { tasks };
      writeState(ctx, restored);
      return restored;
    }
  }

  const empty = createEmptyState();
  writeState(ctx, empty);
  return empty;
}
