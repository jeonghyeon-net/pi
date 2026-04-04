/**
 * Shared type definitions for the todo-write extension.
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

export type TodoStatus = "pending" | "in_progress" | "completed";

export type TodoTask = {
  id: string;
  content: string;
  status: TodoStatus;
  activeForm?: string;
  notes?: string;
};

export type TodoState = {
  tasks: TodoTask[];
};

export type TodoWidgetVisibility = {
  hidden: boolean;
  completionGraceActive: boolean;
  meta?: { completedAt: number; completedTurn: number };
};

export type TodoWidgetMeta = {
  completedAt?: number;
  completedTurn?: number;
};

/**
 * Minimal context subset used to derive a unique state key.
 */
export type StateKeyContext = Pick<ExtensionContext, "cwd" | "sessionManager">;

/** Legacy status that may appear in persisted entries. */
export type PersistedTodoStatus = TodoStatus | "abandoned";

export type PersistedTodoTask = {
  id: string;
  content: string;
  status: PersistedTodoStatus;
  activeForm?: string;
  notes?: string;
};

export type PersistedTodoStateEntryData = {
  tasks: PersistedTodoTask[];
  updatedAt: number;
};
