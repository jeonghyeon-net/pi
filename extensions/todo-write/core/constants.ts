/**
 * Constants for the todo-write extension.
 */

export const TODO_WIDGET_KEY = "todo-write";
export const TODO_SPINNER_FRAMES = [
  "\u280B",
  "\u2819",
  "\u2839",
  "\u2838",
  "\u283C",
  "\u2834",
  "\u2826",
  "\u2827",
  "\u2807",
  "\u280F",
] as const;
export const TODO_SPINNER_INTERVAL_MS = 120;
export const TODO_HIDE_COMPLETED_AFTER_TURNS = 2;
export const TODO_HIDE_COMPLETED_AFTER_MS = 90_000;
export const TODO_MAX_VISIBLE_COMPLETED_WIDGET_ITEMS = 2;
export const TODO_STATE_ENTRY_TYPE = "todo-write-state";
export const TODO_COMPACTION_REMINDER_TYPE = "todo-write-compaction-reminder";
