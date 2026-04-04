/**
 * Rendering functions for todo-write.
 * Produces text output for the widget display and tool result summaries.
 */

import { TODO_MAX_VISIBLE_COMPLETED_WIDGET_ITEMS } from "./constants.js";
import { getTaskCount, hasRemainingTasks } from "./logic.js";
import type { TodoState, TodoTask } from "./types.js";

// ── Widget line rendering ────────────────────────────────────────────────────

function renderTaskLine(task: TodoTask): string {
  const isDone = task.status === "completed";
  const marker = task.status === "in_progress" ? "\u2192" : isDone ? "\u25CF" : "\u25CB";
  const displayText =
    task.status === "in_progress" && task.activeForm ? task.activeForm : task.content;
  return isDone ? `~~${marker} ${displayText}` : `${marker} ${displayText}`;
}

export function renderWidgetLines(state: TodoState): string[] {
  if (getTaskCount(state) === 0) return [];

  const completedTasks = state.tasks.filter((task) => task.status === "completed");
  const hiddenCompletedCount = Math.max(
    0,
    completedTasks.length - TODO_MAX_VISIBLE_COMPLETED_WIDGET_ITEMS,
  );
  const lines: string[] = [];
  let seenCompletedCount = 0;
  let insertedCompletedSummary = false;

  for (const task of state.tasks) {
    if (task.status !== "completed") {
      lines.push(renderTaskLine(task));
      continue;
    }

    seenCompletedCount += 1;
    if (seenCompletedCount <= hiddenCompletedCount) {
      if (!insertedCompletedSummary) {
        lines.push(`\uC644\uB8CC +${String(hiddenCompletedCount)}`);
        insertedCompletedSummary = true;
      }
      continue;
    }

    lines.push(renderTaskLine(task));
  }

  return lines;
}

// ── Summary rendering (for tool result) ──────────────────────────────────────

export function renderSummary(state: TodoState): string {
  if (state.tasks.length === 0) return "Todo list cleared.";

  const remainingTasks = state.tasks.filter(
    (task) => task.status === "pending" || task.status === "in_progress",
  );
  const doneCount = state.tasks.filter((task) => task.status === "completed").length;

  const lines: string[] = [];
  if (remainingTasks.length === 0) {
    lines.push("Remaining items: none.");
  } else {
    lines.push(`Remaining items (${String(remainingTasks.length)}):`);
    for (const task of remainingTasks) {
      lines.push(`  - ${task.id} ${task.content} [${task.status}]`);
    }
  }

  lines.push(`Progress: ${String(doneCount)}/${String(state.tasks.length)} tasks complete`);

  for (const task of state.tasks) {
    const marker =
      task.status === "completed" ? "\u2713" : task.status === "in_progress" ? "\u2192" : "\u25CB";
    lines.push(`  ${marker} ${task.id} ${task.content}`);
  }

  return lines.join("\n");
}

// ── Turn context (injected before agent turns) ───────────────────────────────

export function buildTurnContext(state: TodoState): string | null {
  if (state.tasks.length === 0) return null;
  const summary = renderSummary(state);
  const activeTask = state.tasks.find((task) => task.status === "in_progress");
  const directive = activeTask
    ? [
        `Active task: ${activeTask.id} ${activeTask.content}`,
        "When this task becomes done, your next action must be todo_write " +
          "before any other tool call or response.",
      ].join("\n")
    : hasRemainingTasks(state)
      ? "There are remaining tasks but no active in_progress task. " +
        "Before doing more work, call todo_write to select the next active task."
      : "All todo items are complete.";
  return [
    "[todo-reminder] internal todo_write state snapshot",
    "Source: in-memory session state maintained by the todo_write tool.",
    "Treat this as the latest authoritative todo status for the current turn.",
    "Do not contradict this snapshot. If progress/status differs, " + "update todo_write first.",
    "",
    summary,
    "",
    directive,
  ].join("\n");
}

// ── Post-compaction reminder ─────────────────────────────────────────────────

export function buildPostCompactionReminder(state: TodoState): string | null {
  if (!hasRemainingTasks(state)) return null;
  return [
    "[todo-reminder] todo_write still has remaining items after compaction.",
    "Please continue from the authoritative snapshot below.",
    "",
    renderSummary(state),
  ].join("\n");
}
