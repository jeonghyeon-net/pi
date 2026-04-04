import * as fs from "node:fs";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  COMMAND_COMPLETION_LIMIT,
  COMMAND_TASK_PREVIEW_CHARS,
  DEFAULT_TURN_COUNT,
  MS_PER_SECOND,
  SUBVIEW_OVERLAY_MAX_HEIGHT,
  SUBVIEW_OVERLAY_WIDTH,
} from "../../core/constants.js";
import type { SubagentDeps } from "../../core/deps.js";
import type { CommandRunState } from "../../core/types.js";
import { getLatestRun, removeRun } from "../../execution/run.js";
import { captureSwitchSession, subBackHandler, subTransHandler } from "../../session/navigation.js";
import { formatUsageStats, truncateText } from "../../ui/format.js";
import { SubagentHistoryOverlay } from "../../ui/history-overlay.js";
import { readSessionReplayItems, SubagentSessionReplayOverlay } from "../../ui/replay.js";
import { toWidgetCtx, updateCommandRunsWidget } from "../../ui/widget.js";

export function registerManagementCommands(deps: SubagentDeps): {
  handleSubClear: (args: string, ctx: ExtensionContext) => Promise<void>;
  handleSubAbort: (args: string, ctx: ExtensionContext) => Promise<void>;
} {
  const { pi, store } = deps;

  // ── sub:open ─────────────────────────────────────────────────────────
  pi.registerCommand("sub:open", {
    description: "Open a subagent session replay overlay: /sub:open [runId]",
    getArgumentCompletions: (argumentPrefix) => {
      const trimmedStart = argumentPrefix.trimStart();
      if (trimmedStart.includes(" ")) return null;

      const items = Array.from(store.commandRuns.values())
        .sort((a, b) => b.id - a.id)
        .filter((run) => !trimmedStart || run.id.toString().startsWith(trimmedStart))
        .slice(0, COMMAND_COMPLETION_LIMIT)
        .map((run) => ({
          value: `${run.id}`,
          label: `${run.id}`,
          description: `${run.status} ${run.agent}: ${truncateText(run.task, COMMAND_TASK_PREVIEW_CHARS)}`,
        }));

      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      captureSwitchSession(store, ctx);
      const raw = (args ?? "").trim();
      let id: number;
      let run: CommandRunState | undefined;

      if (!raw) {
        run = getLatestRun(store);
        if (!run) {
          ctx.ui.notify("No subagent runs yet.", "info");
          return;
        }
        id = run.id;
      } else if (/^\d+$/.test(raw)) {
        id = Number(raw);
        run = store.commandRuns.get(id);
      } else {
        ctx.ui.notify("Usage: /sub:open [runId]", "info");
        return;
      }
      if (!run) {
        const availableRunIds = Array.from(store.commandRuns.keys()).sort((a, b) => a - b);
        const availableText =
          availableRunIds.length > 0
            ? `Available run IDs: ${availableRunIds.join(", ")}`
            : "No recent subagent runs available.";
        ctx.ui.notify(`Unknown subagent run #${id}. ${availableText}`, "error");
        return;
      }

      const elapsedSec = Math.max(0, Math.round(run.elapsedMs / MS_PER_SECOND));
      const usageLine = run.usage ? `\nUsage: ${formatUsageStats(run.usage, run.model)}` : "";
      const output = (run.lastOutput ?? "").trim();
      const fallback =
        run.status === "running"
          ? "(still running; no final output yet)"
          : run.lastLine || "(no output captured)";
      const contextLabel = run.contextMode === "main" ? "main" : "isolated";
      const content =
        `Subagent #${run.id} [${run.status}] ${run.agent} ctx:${contextLabel} turn:${run.turnCount ?? DEFAULT_TURN_COUNT} ${elapsedSec}s tools:${run.toolCalls}` +
        `\n${run.task}` +
        usageLine +
        `\n\n${output || fallback}`;

      if (!ctx.hasUI) {
        return;
      }

      if (!run.sessionFile || !fs.existsSync(run.sessionFile)) {
        ctx.ui.notify(content, "info");
        return;
      }

      const replayItems = readSessionReplayItems(run.sessionFile);
      if (replayItems.length === 0) {
        ctx.ui.notify(content, "info");
        return;
      }

      await ctx.ui.custom(
        (tui, theme, _kb, done) => {
          const overlay = new SubagentSessionReplayOverlay(run, replayItems, () => done(undefined));
          return {
            render: (w) => overlay.render(w, 0 /* height computed internally */, theme),
            handleInput: (data) => overlay.handleInput(data, tui),
            invalidate: () => {
              /* noop */
            },
          };
        },
        {
          overlay: true,
          overlayOptions: {
            width: SUBVIEW_OVERLAY_WIDTH,
            maxHeight: SUBVIEW_OVERLAY_MAX_HEIGHT,
            anchor: "center",
          },
        },
      );
    },
  });

  // ── sub:history ──────────────────────────────────────────────────────
  pi.registerCommand("sub:history", {
    description: "Show all subagent run history (including removed) in an overlay: /sub:history",
    handler: async (_args, ctx) => {
      captureSwitchSession(store, ctx);

      const allRuns = Array.from(store.commandRuns.values()).sort(
        (a, b) => b.startedAt - a.startedAt,
      );

      if (allRuns.length === 0) {
        ctx.ui.notify("No subagent run history yet.", "info");
        return;
      }

      if (!ctx.hasUI) {
        // Fallback: plain text list
        const lines = allRuns.map((r) => {
          const removed = r.removed ? " [removed]" : "";
          const task = r.task
            .replace(/\s*\n+\s*/g, " ")
            .trim()
            .slice(0, COMMAND_TASK_PREVIEW_CHARS);
          return `#${r.id} [${r.status}]${removed} ${r.agent}: ${task}`;
        });
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      ctx.ui.setWidget("pixel-subagents", undefined);

      await ctx.ui.custom(
        (tui, theme, _kb, done) => {
          const overlay = new SubagentHistoryOverlay(
            allRuns,
            async (run) => {
              done(undefined);
              // Check if the selected run has a session file before trying to trans
              if (!run.sessionFile) {
                ctx.ui.notify(
                  `Run #${run.id} (${run.agent}) does not have a session file yet and cannot be opened.`,
                  "warning",
                );
                return;
              }
              await subTransHandler(run.id.toString(), ctx, store, pi);
            },
            () => done(undefined),
          );
          return {
            render: (w) => overlay.render(w, 0, theme),
            handleInput: (data) => overlay.handleInput(data, tui),
            invalidate: () => {
              /* noop */
            },
          };
        },
        {
          overlay: true,
          overlayOptions: {
            width: SUBVIEW_OVERLAY_WIDTH,
            maxHeight: SUBVIEW_OVERLAY_MAX_HEIGHT,
            anchor: "center",
          },
        },
      );
    },
  });

  // ── sub:rm ───────────────────────────────────────────────────────────
  pi.registerCommand("sub:rm", {
    description: "Remove one /sub job entry (aborts it if running): /sub:rm [runId]",
    handler: async (args, ctx) => {
      captureSwitchSession(store, ctx);
      const raw = (args ?? "").trim();
      let id: number;
      let run: CommandRunState | undefined;

      if (!raw) {
        run = getLatestRun(store);
        if (!run) {
          ctx.ui.notify("No subagent runs to remove.", "info");
          return;
        }
        id = run.id;
      } else if (/^\d+$/.test(raw)) {
        id = Number(raw);
        run = store.commandRuns.get(id);
      } else {
        ctx.ui.notify("Usage: /sub:rm [runId]", "info");
        return;
      }
      if (!run) {
        ctx.ui.notify(`Unknown subagent run #${id}.`, "error");
        return;
      }

      const { aborted } = removeRun(store, id, {
        ctx: toWidgetCtx(ctx),
        pi,
        reason: "Aborting by /sub:rm...",
        removalReason: "sub-rm",
      });
      ctx.ui.notify(
        aborted ? `Removed subagent #${id} (aborting in background).` : `Removed subagent #${id}.`,
        aborted ? "warning" : "info",
      );
    },
  });

  // ── sub:clear ────────────────────────────────────────────────────────
  const handleSubClear = async (args: string, ctx: ExtensionContext) => {
    captureSwitchSession(store, ctx);
    const mode = (args ?? "").trim().toLowerCase();
    if (mode === "all") {
      let removed = 0;
      let aborted = 0;
      for (const id of Array.from(store.commandRuns.keys())) {
        const result = removeRun(store, id, {
          ctx: toWidgetCtx(ctx),
          pi,
          updateWidget: false,
          reason: "Aborting by /sub:clear all...",
          removalReason: "sub-clear",
        });
        if (!result.removed) continue;
        removed++;
        if (result.aborted) aborted++;
      }
      updateCommandRunsWidget(store, toWidgetCtx(ctx));
      ctx.ui.notify(
        aborted > 0
          ? `Cleared ${removed} subagent job(s), aborting ${aborted} running job(s).`
          : `Cleared ${removed} subagent job(s).`,
        aborted > 0 ? "warning" : "info",
      );
      return;
    }

    let removed = 0;
    for (const [id, run] of Array.from(store.commandRuns.entries())) {
      if (run.status === "running") continue;
      const result = removeRun(store, id, {
        ctx: toWidgetCtx(ctx),
        pi,
        updateWidget: false,
        abortIfRunning: false,
        removalReason: "sub-clear",
      });
      if (result.removed) removed++;
    }
    updateCommandRunsWidget(store, toWidgetCtx(ctx));
    ctx.ui.notify(`Cleared ${removed} finished subagent job(s).`, "info");
  };

  pi.registerCommand("sub:clear", {
    description: "Clear /sub job widget entries. /sub:clear (finished only) or /sub:clear all",
    handler: async (args, ctx) => {
      await handleSubClear(args, ctx);
    },
  });

  // ── sub:abort ────────────────────────────────────────────────────────
  const handleSubAbort = async (args: string, ctx: ExtensionContext) => {
    const raw = (args ?? "").trim().toLowerCase();
    const running = Array.from(store.commandRuns.values())
      .filter((run) => run.status === "running")
      .sort((a, b) => b.id - a.id);

    if (running.length === 0) {
      ctx.ui.notify("No running subagent jobs.", "info");
      return;
    }

    const abortRun = (run: CommandRunState): boolean => {
      // Try the run's own controller first, then fall back to globalLiveRuns
      // (the run's controller may have been cleared after a session switch).
      const controller = run.abortController ?? store.globalLiveRuns.get(run.id)?.abortController;
      if (!controller) return false;
      run.lastLine = "Aborting by user...";
      run.lastOutput = run.lastLine;
      controller.abort();
      return true;
    };

    if (!raw) {
      const target = running[0];
      if (!target || !abortRun(target)) {
        ctx.ui.notify(
          target
            ? `Subagent #${target.id} is not abortable right now.`
            : "No abortable subagent jobs.",
          "warning",
        );
        return;
      }
      updateCommandRunsWidget(store, toWidgetCtx(ctx));
      ctx.ui.notify(`Aborting subagent #${target.id} (${target.agent})...`, "warning");
      return;
    }

    if (raw === "all") {
      let count = 0;
      for (const run of running) {
        if (abortRun(run)) count++;
      }
      updateCommandRunsWidget(store, toWidgetCtx(ctx));
      ctx.ui.notify(
        count > 0 ? `Aborting ${count} running subagent job(s)...` : "No abortable subagent jobs.",
        count > 0 ? "warning" : "info",
      );
      return;
    }

    if (/^\d+$/.test(raw)) {
      const id = Number(raw);
      const run = store.commandRuns.get(id);
      if (!run) {
        ctx.ui.notify(`Unknown subagent run #${id}.`, "error");
        return;
      }
      if (run.status !== "running") {
        ctx.ui.notify(`Subagent #${id} is not running.`, "info");
        return;
      }
      if (!abortRun(run)) {
        ctx.ui.notify(`Subagent #${id} is not abortable right now.`, "warning");
        return;
      }
      updateCommandRunsWidget(store, toWidgetCtx(ctx));
      ctx.ui.notify(`Aborting subagent #${id} (${run.agent})...`, "warning");
      return;
    }

    ctx.ui.notify("Usage: /sub:abort [runId|all]", "info");
  };

  pi.registerCommand("sub:abort", {
    description: "Abort running subagent job(s). /sub:abort [runId|all]",
    handler: async (args, ctx) => {
      captureSwitchSession(store, ctx);
      await handleSubAbort(args, ctx);
    },
  });

  // ── sub:back ─────────────────────────────────────────────────────────
  pi.registerCommand("sub:back", {
    description: "Return to parent session (pop from session stack): /sub:back",
    handler: async (_args, ctx) => {
      captureSwitchSession(store, ctx);
      await subBackHandler(ctx, store);
    },
  });

  return { handleSubClear, handleSubAbort };
}
