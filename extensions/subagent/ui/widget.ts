/**
 * Subagent run status widget — renders per-run status boxes below the editor.
 */

import type { ExtensionContext, Theme, ThemeColor } from "@mariozechner/pi-coding-agent";
import { Box, Text, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { HANG_WARNING_IDLE_MS, PARENT_HINT } from "../core/constants.js";
import type { SubagentStore } from "../core/store.js";
import {
  AGENT_NAME_PALETTE,
  agentBgIndex,
  formatContextUsageBar,
  getContextBarColorByRemaining,
  getRemainingContextPercent,
  getUsedContextPercent,
  resolveContextWindow,
  truncateText,
} from "./format.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const SPINNER_INTERVAL_MS = 120;
const SPINNER_REFRESH_MS = 150;

const MAX_VISIBLE_RUNS = 3;

type ThemeBg = Parameters<Theme["bg"]>[0];
type WidgetTheme = {
  fg: (color: ThemeColor, text: string) => string;
  bold: (text: string) => string;
  bg: (color: ThemeBg, text: string) => string;
};

type WidgetFactory = (
  tui: unknown,
  theme: WidgetTheme,
) => {
  render(width: number): string[];
  invalidate?(): void;
  dispose?(): void;
};

type WidgetPlacementOptions = { placement?: "aboveEditor" | "belowEditor" };

type WidgetSetWidget = {
  (key: string, content: string[] | undefined, options?: WidgetPlacementOptions): void;
  (key: string, content: WidgetFactory | undefined, options?: WidgetPlacementOptions): void;
};

/**
 * Minimal context shape required by the widget renderer.
 *
 * Callers with `ExtensionContext` or `SubagentToolExecuteContext` should use
 * {@link toWidgetCtx} to create a compatible value without unsafe casts.
 */
export interface WidgetRenderCtx {
  hasUI?: boolean | undefined;
  ui?: { setWidget: WidgetSetWidget } | undefined;
  model?: { contextWindow?: number } | undefined;
  modelRegistry?:
    | { getAll: () => Array<{ provider: string; id: string; contextWindow?: number }> }
    | undefined;
}

/**
 * Extract a {@link WidgetRenderCtx} from an `ExtensionContext` (or compatible shape).
 *
 * This avoids `as unknown as WidgetRenderCtx` casts by copying only the
 * properties the widget module actually needs. The inner `setWidget` wrapper
 * delegates to the real `ctx.ui.setWidget`, adapting our local `WidgetFactory`
 * to the SDK's expected factory signature at the type level.
 */
export function toWidgetCtx(
  ctx: Pick<ExtensionContext, "hasUI" | "ui" | "model" | "modelRegistry">,
): WidgetRenderCtx {
  function wrappedSetWidget(
    key: string,
    content: string[] | undefined,
    options?: WidgetPlacementOptions,
  ): void;
  function wrappedSetWidget(
    key: string,
    content: WidgetFactory | undefined,
    options?: WidgetPlacementOptions,
  ): void;
  function wrappedSetWidget(
    key: string,
    content: string[] | WidgetFactory | undefined,
    options?: WidgetPlacementOptions,
  ): void {
    if (content === undefined || Array.isArray(content)) {
      ctx.ui.setWidget(key, content, options);
    } else {
      // Wrap WidgetFactory → SDK factory. The shapes are runtime-compatible;
      // this wrapper satisfies the SDK's stricter generic types.
      ctx.ui.setWidget(
        key,
        (tui, theme) => {
          const result = content(tui, theme);
          return {
            render: (w: number) => result.render(w),
            invalidate() {
              result.invalidate?.();
            },
            dispose() {
              result.dispose?.();
            },
          };
        },
        options,
      );
    }
  }

  return {
    hasUI: ctx.hasUI,
    ui: { setWidget: wrappedSetWidget },
    model: ctx.model ? { contextWindow: ctx.model.contextWindow } : undefined,
    modelRegistry: {
      getAll: () =>
        ctx.modelRegistry.getAll().map((m) => ({
          provider: m.provider,
          id: m.id,
          contextWindow: m.contextWindow,
        })),
    },
  };
}

/** Fast timer that drives spinner animation while any run is active. */
let spinnerTimer: ReturnType<typeof setInterval> | undefined;

function manageSpinnerTimer(store: SubagentStore): void {
  const hasRunning = Array.from(store.commandRuns.values()).some((r) => r.status === "running");
  if (hasRunning && !spinnerTimer) {
    spinnerTimer = setInterval(() => updateCommandRunsWidget(store), SPINNER_REFRESH_MS);
  } else if (!hasRunning && spinnerTimer) {
    clearInterval(spinnerTimer);
    spinnerTimer = undefined;
  }
}

export function updateCommandRunsWidget(store: SubagentStore, ctx?: WidgetRenderCtx): void {
  const activeCtx = ctx ?? (store.commandWidgetCtx as WidgetRenderCtx | null);
  if (!activeCtx?.hasUI || !activeCtx.ui) return;
  store.commandWidgetCtx = activeCtx;
  const { ui } = activeCtx;

  // Parent session hint — visible when inside a child session (persistent parent link exists)
  if (store.currentParentSessionFile) {
    ui.setWidget(
      "sub-parent",
      (_tui: unknown, theme: WidgetTheme) => {
        const box = new Box(1, 0);
        const content = new Text("", 0, 0);
        box.addChild(content);
        return {
          render(width: number): string[] {
            const innerWidth = Math.max(1, width - 2);
            content.setText(truncateToWidth(theme.fg("accent", PARENT_HINT), innerWidth));
            return box.render(width);
          },
          invalidate() {
            box.invalidate();
          },
        };
      },
      { placement: "belowEditor" },
    );
  } else {
    ui.setWidget("sub-parent", undefined);
  }

  const statusPriority = (status: "running" | "done" | "error") =>
    status === "running" ? 0 : status === "done" ? 1 : 2;
  // Show all subagent runs in the belowEditor widget, regardless of how they were launched.
  const runs = Array.from(store.commandRuns.values())
    .filter((r) => !r.removed)
    .sort((a, b) => {
      const priorityDiff = statusPriority(a.status) - statusPriority(b.status);
      if (priorityDiff !== 0) return priorityDiff;
      const startedDiff = b.startedAt - a.startedAt;
      if (startedDiff !== 0) return startedDiff;
      return b.id - a.id;
    })
    .slice(0, MAX_VISIBLE_RUNS);
  const visibleRunIds = new Set<number>(runs.map((run) => run.id));

  for (const id of Array.from(store.renderedRunWidgetIds)) {
    if (!visibleRunIds.has(id)) {
      ui.setWidget(`sub-${id}`, undefined);
      store.renderedRunWidgetIds.delete(id);
    }
  }

  if (runs.length === 0) {
    ui.setWidget("subagent-runs", undefined);
    manageSpinnerTimer(store);
    return;
  }

  ui.setWidget("subagent-runs", undefined);

  for (const [runIndex, run] of runs.entries()) {
    const showSeparator = runIndex > 0;
    const showBottomSeparator = runIndex === runs.length - 1;
    store.renderedRunWidgetIds.add(run.id);
    ui.setWidget(
      `sub-${run.id}`,
      (_tui: unknown, theme: WidgetTheme) => {
        const box = new Box(1, 0);
        const content = new Text("", 0, 0);
        box.addChild(content);

        return {
          render(width: number): string[] {
            const lines: string[] = [];
            const innerWidth = Math.max(1, width - 2);
            if (showSeparator) lines.push(theme.fg("muted", "─".repeat(innerWidth)));

            const statusColor =
              run.status === "running" ? "warning" : run.status === "done" ? "success" : "error";
            const spinnerFrame =
              SPINNER_FRAMES[Math.floor(Date.now() / SPINNER_INTERVAL_MS) % SPINNER_FRAMES.length];
            const statusIcon =
              run.status === "running" ? spinnerFrame : run.status === "done" ? "✓" : "✗";
            const elapsedSec = Math.max(0, Math.round(run.elapsedMs / 1000));
            const contextWindow = resolveContextWindow(activeCtx, run.model);
            const usedContextPercent = getUsedContextPercent(
              run.usage?.contextTokens,
              contextWindow,
            );
            const remainingContextPercent = getRemainingContextPercent(usedContextPercent);
            const contextBar =
              usedContextPercent !== undefined
                ? formatContextUsageBar(usedContextPercent)
                : undefined;
            const contextBarColor =
              remainingContextPercent !== undefined
                ? getContextBarColorByRemaining(remainingContextPercent)
                : undefined;
            const contextShort = contextBar
              ? contextBarColor
                ? theme.fg(contextBarColor, contextBar)
                : theme.fg("dim", contextBar)
              : "";
            const modeLabel = run.contextMode === "main" ? theme.fg("warning", " · Main") : "";

            // Idle indicator for running runs
            let idleLabel = "";
            if (run.status === "running" && run.lastActivityAt) {
              const idleMs = Date.now() - run.lastActivityAt;
              const idleSec = Math.round(idleMs / 1000);
              if (idleSec >= 5) {
                const idleColor = idleMs >= HANG_WARNING_IDLE_MS ? "error" : "dim";
                idleLabel = theme.fg(idleColor, ` idle:${idleSec}s`);
              }
            }

            const taskSnippet = run.task
              ? theme.fg("dim", ` · ${truncateText(run.task.replace(/\s+/g, " ").trim(), 60)}`)
              : "";
            const statusLeft =
              theme.fg(statusColor, `${statusIcon} #${run.id}`) +
              modeLabel +
              `\x1b[38;5;${AGENT_NAME_PALETTE[agentBgIndex(run.agent)]}m ${run.agent}\x1b[39m` +
              theme.fg("dim", `  (${elapsedSec}s)`) +
              taskSnippet +
              idleLabel;

            if (contextShort) {
              const contextWidth = visibleWidth(contextShort);
              if (contextWidth >= innerWidth) {
                lines.push(truncateToWidth(contextShort, innerWidth));
              } else {
                const maxLeftWidth = Math.max(1, innerWidth - contextWidth - 1);
                const fittedLeft = truncateText(statusLeft, maxLeftWidth);
                const gapWidth = Math.max(1, innerWidth - visibleWidth(fittedLeft) - contextWidth);
                lines.push(`${fittedLeft}${" ".repeat(gapWidth)}${contextShort}`);
              }
            } else {
              lines.push(truncateText(statusLeft, innerWidth));
            }

            if (run.thoughtText && run.status !== "done") {
              const thoughtLine = truncateText(run.thoughtText, Math.max(1, innerWidth - 4));
              lines.push(theme.fg("accent", `  💭 ${thoughtLine}`));
            }

            if (!run.thoughtText && run.status !== "done" && run.lastLine) {
              const normalized = run.lastLine
                .replace(/\s*\n+\s*/g, " ")
                .replace(/\s{2,}/g, " ")
                .trim();
              const outputLine = truncateText(normalized, Math.max(1, innerWidth - 4));
              lines.push(theme.fg("muted", `  ↳ ${outputLine}`));
            }

            if (showBottomSeparator) lines.push(theme.fg("muted", "─".repeat(innerWidth)));

            content.setText(lines.join("\n"));
            return box.render(width);
          },
          invalidate() {
            box.invalidate();
          },
        };
      },
      { placement: "belowEditor" },
    );
  }

  manageSpinnerTimer(store);
}
