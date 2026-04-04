/**
 * Widget management for todo-write.
 * Handles synchronising the TUI widget with current state,
 * including spinner animation and auto-hide timers.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth } from "@mariozechner/pi-tui";
import {
  TODO_HIDE_COMPLETED_AFTER_MS,
  TODO_SPINNER_FRAMES,
  TODO_SPINNER_INTERVAL_MS,
  TODO_WIDGET_KEY,
} from "./constants.js";
import { getWidgetVisibility, hasInProgressTask, hasRemainingTasks } from "./logic.js";
import { clearState } from "./persistence.js";
import { renderWidgetLines } from "./render.js";
import {
  deleteWidgetMeta,
  getAgentRunning,
  getStateKey,
  getTurn,
  getWidgetMeta,
  readState,
  setWidgetMeta,
} from "./state.js";

// ── Timer state ──────────────────────────────────────────────────────────────

let widgetTimer: ReturnType<typeof setInterval> | undefined;
const hideTimerByKey = new Map<string, ReturnType<typeof setTimeout>>();

/** When true, the above-editor widget is suppressed (todo-sidebar renders instead). */
const SUPPRESS_TODO_WIDGET = true;

// ── Timer helpers ────────────────────────────────────────────────────────────

export function clearWidgetTimer(): void {
  if (!widgetTimer) return;
  clearInterval(widgetTimer);
  widgetTimer = undefined;
}

export function clearHideTimer(key: string): void {
  const timer = hideTimerByKey.get(key);
  if (!timer) return;
  clearTimeout(timer);
  hideTimerByKey.delete(key);
}

// ── Sync widget ──────────────────────────────────────────────────────────────

export async function syncWidget(
  ctx: ExtensionContext,
  pi: Pick<ExtensionAPI, "appendEntry">,
): Promise<void> {
  if (!ctx.hasUI) return;
  if (SUPPRESS_TODO_WIDGET) {
    ctx.ui.setWidget(TODO_WIDGET_KEY, undefined);
    return;
  }

  const key = getStateKey(ctx);
  const state = readState(ctx);
  const visibility = getWidgetVisibility(state, getWidgetMeta(key), getTurn(key), Date.now());

  if (visibility.meta) {
    setWidgetMeta(key, visibility.meta);
  } else {
    deleteWidgetMeta(key);
  }

  const lines = visibility.hidden ? [] : renderWidgetLines(state);
  if (lines.length === 0) {
    if (visibility.hidden && state.tasks.length > 0) {
      clearState(ctx, pi);
      deleteWidgetMeta(key);
    }
    clearWidgetTimer();
    clearHideTimer(key);
    ctx.ui.setWidget(TODO_WIDGET_KEY, undefined);
    return;
  }

  clearHideTimer(key);
  if (
    visibility.completionGraceActive &&
    !hasRemainingTasks(state) &&
    visibility.meta?.completedAt !== undefined
  ) {
    const elapsedMs = Math.max(0, Date.now() - visibility.meta.completedAt);
    const remainingMs = Math.max(0, TODO_HIDE_COMPLETED_AFTER_MS - elapsedMs);
    const hideTimer = setTimeout(() => {
      hideTimerByKey.delete(key);
      syncWidget(ctx, pi).catch(() => {
        // intentionally swallowed – fire-and-forget re-sync
      });
    }, remainingMs);
    hideTimerByKey.set(key, hideTimer);
  }

  const isRunning = hasInProgressTask(state) && getAgentRunning(key);

  ctx.ui.setWidget(TODO_WIDGET_KEY, (tui, theme) => {
    const renderedLines = [...lines];
    const content = new Text("", 0, 0);

    clearWidgetTimer();
    if (isRunning) {
      widgetTimer = setInterval(() => tui.requestRender(), TODO_SPINNER_INTERVAL_MS);
    }

    return {
      render(width: number): string[] {
        const lineWidth = Math.max(8, width);
        const frameIndex =
          Math.floor(Date.now() / TODO_SPINNER_INTERVAL_MS) % TODO_SPINNER_FRAMES.length;
        const spinner = TODO_SPINNER_FRAMES[frameIndex] ?? "\u2022";
        const styledLines = renderedLines.map((line) => {
          if (line.startsWith("\u2192 ")) {
            if (isRunning) {
              const runningLine = `${spinner} ${line.slice(2)}`;
              return theme.bold(theme.fg("accent", truncateToWidth(runningLine, lineWidth)));
            }
            return theme.fg("accent", truncateToWidth(`\u25CB ${line.slice(2)}`, lineWidth));
          }
          if (line.startsWith("~~")) {
            return theme.fg("dim", theme.strikethrough(truncateToWidth(line.slice(2), lineWidth)));
          }
          if (line.startsWith("...")) {
            return theme.fg("dim", truncateToWidth(line, lineWidth));
          }
          return theme.fg("toolOutput", truncateToWidth(line, lineWidth));
        });
        content.setText(styledLines.join("\n"));
        return content.render(width);
      },
      invalidate() {
        content.invalidate();
      },
    };
  });
}
