/**
 * Read-only query actions: list, status, detail.
 */

import {
  MAX_LISTED_RUNS,
  STATUS_OUTPUT_PREVIEW_MAX_CHARS,
  SUBAGENT_POLL_COOLDOWN_MS,
} from "../../core/constants.js";
import type { SubagentStore } from "../../core/store.js";
import type { SubagentDetails } from "../../core/types.js";
import {
  formatCommandRunSummary,
  formatContextUsageBar,
  getUsedContextPercent,
  resolveContextWindow,
  truncateLines,
} from "../../ui/format.js";
import { buildStrongWaitMessage, formatRunDetailOutput } from "../helpers.js";
import type { LaunchMode, SubagentExecuteResult, SubagentToolExecuteContext } from "../types.js";

export function handleListAction(
  store: SubagentStore,
  ctx: SubagentToolExecuteContext,
  makeDetails: (modeOverride?: LaunchMode) => SubagentDetails,
  withIdleRunWarning: (text: string) => string,
): SubagentExecuteResult {
  // Anti-polling guard: block list while any run is within launch cooldown
  const now = Date.now();
  const cooldownRunId = Array.from(store.commandRuns.values()).find((run) => {
    if (run.status !== "running") return false;
    const launchedAt = store.recentLaunchTimestamps.get(run.id);
    return typeof launchedAt === "number" && now - launchedAt <= SUBAGENT_POLL_COOLDOWN_MS;
  })?.id;
  if (cooldownRunId !== undefined) {
    return {
      content: [{ type: "text", text: buildStrongWaitMessage(cooldownRunId) }],
      details: makeDetails("single"),
      isError: true,
    };
  }

  const allRuns = Array.from(store.commandRuns.values()).sort((a, b) => b.id - a.id);
  if (allRuns.length === 0) {
    return {
      content: [{ type: "text", text: withIdleRunWarning("No subagent runs found.") }],
      details: makeDetails("single"),
    };
  }
  const visibleRuns = allRuns.slice(0, MAX_LISTED_RUNS);
  const hiddenCount = allRuns.length - visibleRuns.length;
  const lines = visibleRuns.map((run) => {
    const contextWindow = resolveContextWindow(ctx, run.model);
    const usedPercent = getUsedContextPercent(run.usage?.contextTokens, contextWindow);
    const usageSuffix =
      usedPercent === undefined ? "" : ` usage:${formatContextUsageBar(usedPercent)}`;
    const taskPreview = truncateLines(run.task, 2).replace(/\n/g, "\n  ");
    return `${formatCommandRunSummary(run)}${usageSuffix}\n  ${taskPreview}`;
  });
  const header =
    hiddenCount > 0
      ? `Subagent runs (showing ${visibleRuns.length} of ${allRuns.length}, oldest ${hiddenCount} hidden)`
      : "Subagent runs";
  return {
    content: [{ type: "text", text: withIdleRunWarning(`${header}\n\n${lines.join("\n\n")}`) }],
    details: makeDetails("single"),
  };
}

export function handleStatusAction(
  runId: number,
  store: SubagentStore,
  makeDetails: (modeOverride?: LaunchMode) => SubagentDetails,
): SubagentExecuteResult {
  const run = store.commandRuns.get(runId);
  if (!run) {
    return {
      content: [{ type: "text", text: `Unknown subagent run #${runId}.` }],
      details: makeDetails("single"),
      isError: true,
    };
  }

  const launchedAt = store.recentLaunchTimestamps.get(run.id);
  const withinCooldown =
    run.status === "running" &&
    typeof launchedAt === "number" &&
    Date.now() - launchedAt <= SUBAGENT_POLL_COOLDOWN_MS;
  if (withinCooldown) {
    return {
      content: [{ type: "text", text: buildStrongWaitMessage(run.id) }],
      details: makeDetails("single"),
      isError: true,
    };
  }

  const output = run.lastOutput ?? run.lastLine ?? "(no output yet)";
  const preview =
    output.length > STATUS_OUTPUT_PREVIEW_MAX_CHARS
      ? `${output.slice(0, STATUS_OUTPUT_PREVIEW_MAX_CHARS)}\n\n... [truncated]`
      : output;
  return {
    content: [{ type: "text", text: `${formatCommandRunSummary(run)}\n${run.task}\n\n${preview}` }],
    details: makeDetails("single"),
  };
}

export function handleDetailAction(
  runId: number,
  store: SubagentStore,
  makeDetails: (modeOverride?: LaunchMode) => SubagentDetails,
): SubagentExecuteResult {
  const run = store.commandRuns.get(runId);
  if (!run) {
    return {
      content: [{ type: "text", text: `Unknown subagent run #${runId}.` }],
      details: makeDetails("single"),
      isError: true,
    };
  }

  const launchedAt = store.recentLaunchTimestamps.get(run.id);
  const withinCooldown =
    run.status === "running" &&
    typeof launchedAt === "number" &&
    Date.now() - launchedAt <= SUBAGENT_POLL_COOLDOWN_MS;
  if (withinCooldown) {
    return {
      content: [{ type: "text", text: buildStrongWaitMessage(run.id) }],
      details: makeDetails("single"),
      isError: true,
    };
  }

  if (run.status === "running") {
    return {
      content: [
        {
          type: "text",
          text: `Subagent run #${run.id} is still running. detail is available after completion.`,
        },
      ],
      details: makeDetails("single"),
      isError: true,
    };
  }

  return {
    content: [{ type: "text", text: formatRunDetailOutput(run) }],
    details: makeDetails("single"),
  };
}
