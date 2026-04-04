/**
 * State-modifying actions: abort, remove.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { SubagentStore } from "../../core/store.js";
import type { SubagentDetails } from "../../core/types.js";
import { removeRun } from "../../execution/run.js";
import { toWidgetCtx, updateCommandRunsWidget } from "../../ui/widget.js";
import type { LaunchMode, SubagentExecuteResult, SubagentToolExecuteContext } from "../types.js";

export function handleAbortAction(
  targetRunIds: number[],
  store: SubagentStore,
  ctx: SubagentToolExecuteContext,
  makeDetails: (modeOverride?: LaunchMode) => SubagentDetails,
): SubagentExecuteResult {
  const aborting: number[] = [];
  const notRunning: number[] = [];
  const unknown: number[] = [];

  for (const runId of targetRunIds) {
    const run = store.commandRuns.get(runId);
    if (!run) {
      unknown.push(runId);
      continue;
    }

    const abortCtrl = run.abortController ?? store.globalLiveRuns.get(run.id)?.abortController;
    if (run.status !== "running" || !abortCtrl) {
      notRunning.push(runId);
      continue;
    }

    run.lastLine = "Aborting by subagent tool...";
    run.lastOutput = run.lastLine;
    abortCtrl.abort();
    aborting.push(runId);
  }

  if (aborting.length > 0) {
    updateCommandRunsWidget(store, toWidgetCtx(ctx));
  }

  if (
    targetRunIds.length === 1 &&
    aborting.length === 1 &&
    notRunning.length === 0 &&
    unknown.length === 0
  ) {
    return {
      content: [{ type: "text", text: `Aborting subagent run #${aborting[0]}...` }],
      details: makeDetails("single"),
    };
  }

  const lines: string[] = [];
  if (aborting.length > 0) lines.push(`Aborting: ${aborting.map((id) => `#${id}`).join(", ")}.`);
  if (notRunning.length > 0)
    lines.push(`Not running: ${notRunning.map((id) => `#${id}`).join(", ")}.`);
  if (unknown.length > 0) lines.push(`Unknown: ${unknown.map((id) => `#${id}`).join(", ")}.`);
  if (lines.length === 0) lines.push("No subagent runs matched.");

  return {
    content: [{ type: "text", text: lines.join("\n") }],
    details: makeDetails("single"),
  };
}

export function handleRemoveAction(
  targetRunIds: number[],
  store: SubagentStore,
  ctx: SubagentToolExecuteContext,
  pi: ExtensionAPI,
  makeDetails: (modeOverride?: LaunchMode) => SubagentDetails,
): SubagentExecuteResult {
  const removed: number[] = [];
  const abortedWhileRemoving: number[] = [];
  const unknown: number[] = [];

  for (const runId of targetRunIds) {
    const run = store.commandRuns.get(runId);
    if (!run) {
      unknown.push(runId);
      continue;
    }

    const { removed: didRemove, aborted } = removeRun(store, run.id, {
      ctx: toWidgetCtx(ctx),
      pi,
      reason: "Aborting by subagent tool remove...",
      removalReason: "tool-remove",
      updateWidget: false,
    });
    if (!didRemove) {
      unknown.push(runId);
      continue;
    }

    removed.push(runId);
    store.recentLaunchTimestamps.delete(runId);
    if (aborted) abortedWhileRemoving.push(runId);
  }

  if (removed.length > 0) {
    updateCommandRunsWidget(store, toWidgetCtx(ctx));
  }

  if (targetRunIds.length === 1 && removed.length === 1 && unknown.length === 0) {
    return {
      content: [
        {
          type: "text",
          text:
            abortedWhileRemoving.length > 0
              ? `Removed subagent run #${removed[0]} (aborting in background).`
              : `Removed subagent run #${removed[0]}.`,
        },
      ],
      details: makeDetails("single"),
    };
  }

  const lines: string[] = [];
  if (removed.length > 0) lines.push(`Removed: ${removed.map((id) => `#${id}`).join(", ")}.`);
  if (abortedWhileRemoving.length > 0)
    lines.push(`Aborting in background: ${abortedWhileRemoving.map((id) => `#${id}`).join(", ")}.`);
  if (unknown.length > 0) lines.push(`Unknown: ${unknown.map((id) => `#${id}`).join(", ")}.`);
  if (lines.length === 0) lines.push("No subagent runs matched.");

  return {
    content: [{ type: "text", text: lines.join("\n") }],
    details: makeDetails("single"),
  };
}
