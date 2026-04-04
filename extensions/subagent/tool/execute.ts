/**
 * Subagent tool — execute handler factory.
 * Thin dispatcher that parses the CLI command, sets up shared context,
 * and delegates to the appropriate action handler.
 */

import { discoverAgents } from "../agent/discovery.js";
import { parseSubagentToolCommand, SUBAGENT_CLI_HELP_TEXT } from "../cli/parser.js";
import {
  IDLE_RUN_WARNING_THRESHOLD,
  MAX_CONCURRENT_ASYNC_SUBAGENT_RUNS,
} from "../core/constants.js";
import type { SubagentDeps } from "../core/deps.js";
import { updateRunFromResult } from "../core/store.js";
import type {
  BatchOrChainItem,
  CommandRunState,
  OnUpdateCallback,
  SingleResult,
  SubagentDetails,
  SubagentLaunchSummary,
} from "../core/types.js";
import type { RunLaunchConfig } from "../execution/orchestrator.js";
import { getCurrentSessionFile, registerRunLaunch } from "../execution/orchestrator.js";
import { enqueueSubagentInvocation } from "../execution/run.js";
import { runSingleAgent } from "../execution/runner.js";
import { buildMainContextText } from "../session/context.js";
import { updateCommandRunsWidget } from "../ui/widget.js";
import { handleBatchAction } from "./actions/batch.js";
import { handleChainAction } from "./actions/chain.js";
import { handleLaunchAction } from "./actions/launch.js";
import { handleAbortAction, handleRemoveAction } from "./actions/mutate.js";
import { handleDetailAction, handleListAction, handleStatusAction } from "./actions/query.js";
import {
  createEmptyDetails,
  finalizeRunState,
  formatIdleRunWarning,
  getRunCounts,
} from "./helpers.js";
import type {
  FinalizedRun,
  LaunchMode,
  SubagentExecuteResult,
  SubagentToolExecuteContext,
} from "./types.js";

export function createSubagentToolExecute(deps: SubagentDeps) {
  const { pi, store } = deps;

  return async (
    _toolCallId: string,
    params: Record<string, unknown>,
    _signal: AbortSignal | undefined,
    _onUpdate: OnUpdateCallback | undefined,
    ctx: SubagentToolExecuteContext,
  ): Promise<SubagentExecuteResult> => {
    const knownRunIds = Array.from(store.commandRuns.values())
      .filter((run) => !run.removed)
      .map((run) => run.id);
    const parsedCommand = parseSubagentToolCommand(params.command, { knownRunIds });

    if (parsedCommand.type === "error") {
      return {
        content: [{ type: "text", text: `${parsedCommand.message}\n\n${SUBAGENT_CLI_HELP_TEXT}` }],
        details: createEmptyDetails("single", false, null),
        isError: true,
      };
    }

    if (parsedCommand.type === "help") {
      return {
        content: [{ type: "text", text: SUBAGENT_CLI_HELP_TEXT }],
        details: createEmptyDetails("single", false, null),
      };
    }

    const discovery = discoverAgents(ctx.cwd);
    const agents = discovery.agents;

    if (parsedCommand.type === "agents") {
      if (agents.length === 0) {
        return {
          content: [{ type: "text", text: "No subagents found." }],
          details: createEmptyDetails("single", false, discovery.projectAgentsDir),
        };
      }

      const lines = agents.map((agent) => {
        const model = agent.model ?? "(inherit current model)";
        const thinking = agent.thinking ?? "(inherit current thinking)";
        const tools = agent.tools && agent.tools.length > 0 ? agent.tools.join(",") : "default";
        const description = agent.description ? ` · ${agent.description}` : "";
        return `${agent.name} [${agent.source}] · model: ${model} · thinking: ${thinking} · tools: ${tools}${description}`;
      });

      return {
        content: [{ type: "text", text: `Available subagents\n\n${lines.join("\n")}` }],
        details: createEmptyDetails("single", false, discovery.projectAgentsDir),
      };
    }

    const resolvedParams = parsedCommand.params;
    const asyncAction = resolvedParams.asyncAction ?? "run";
    const contextMode = resolvedParams.contextMode ?? "isolated";
    const inheritMainContext = contextMode === "main";
    const rawMainContext = inheritMainContext
      ? buildMainContextText(ctx)
      : { text: "", totalMessageCount: 0 };
    const mainContextText = rawMainContext.text;
    const totalMessageCount = rawMainContext.totalMessageCount;
    const mainSessionFile = inheritMainContext
      ? getCurrentSessionFile(ctx) || undefined
      : undefined;
    const originSessionFile = getCurrentSessionFile(ctx);

    const runCounts = getRunCounts(store);
    const idleRunWarning =
      runCounts.idle >= IDLE_RUN_WARNING_THRESHOLD
        ? formatIdleRunWarning(runCounts.idle)
        : undefined;
    const withIdleRunWarning = (text: string): string =>
      idleRunWarning ? `${idleRunWarning}\n\n${text}` : text;

    if (idleRunWarning && ctx.hasUI) {
      ctx.ui?.notify?.(idleRunWarning, "warning");
    }

    const hasBatch = asyncAction === "batch";
    const hasChain = asyncAction === "chain";
    const hasSingle = asyncAction === "run" || asyncAction === "continue";
    const mode: LaunchMode = hasBatch ? "batch" : hasChain ? "chain" : "single";
    const makeDetails = (
      modeOverride: LaunchMode = mode,
      results: SingleResult[] = [],
      launches: SubagentLaunchSummary[] = [],
    ): SubagentDetails => ({
      mode: modeOverride,
      inheritMainContext,
      projectAgentsDir: discovery.projectAgentsDir,
      results,
      launches,
    });

    if ((hasSingle || hasBatch || hasChain) && inheritMainContext && !mainSessionFile) {
      return {
        content: [
          {
            type: "text",
            text: "contextMode=main requires an active main session. Current session is unavailable (e.g. --no-session).",
          },
        ],
        details: makeDetails(),
        isError: true,
      };
    }

    // Early validation: check that all requested agent names exist before launching
    if (hasSingle || hasBatch || hasChain) {
      const requestedNames: string[] = [];
      if (hasSingle) {
        const name =
          (resolvedParams.agent as string | undefined) ??
          (resolvedParams.continueFromRunId ? undefined : "worker");
        if (name) requestedNames.push(name);
      }
      if (hasBatch && Array.isArray(resolvedParams.runs)) {
        for (const item of resolvedParams.runs as BatchOrChainItem[])
          requestedNames.push(item.agent);
      }
      if (hasChain && Array.isArray(resolvedParams.steps)) {
        for (const step of resolvedParams.steps as BatchOrChainItem[])
          requestedNames.push(step.agent);
      }
      const unknownNames = [...new Set(requestedNames)].filter(
        (name) => !agents.some((a) => a.name === name),
      );
      if (unknownNames.length > 0) {
        const available = agents.map((a) => `"${a.name}"`).join(", ") || "none";
        return {
          content: [
            {
              type: "text",
              text: `❌ Unknown agent${unknownNames.length > 1 ? "s" : ""}: ${unknownNames.map((n) => `"${n}"`).join(", ")}.\n\nAvailable agents: ${available}`,
            },
          ],
          details: makeDetails(),
          isError: true,
        };
      }
    }

    // ── Query actions ──────────────────────────────────────────────────
    if (asyncAction === "list") {
      return handleListAction(store, ctx, makeDetails, withIdleRunWarning);
    }

    // ── RunId / RunIds resolution for non-launch actions ───────────────
    const rawRunIds = Array.isArray(resolvedParams.runIds) ? resolvedParams.runIds : undefined;
    const invalidRunIds = (rawRunIds ?? []).filter((value) => !Number.isInteger(value));
    if (invalidRunIds.length > 0) {
      return {
        content: [{ type: "text", text: "runIds must be an array of integer run IDs." }],
        details: makeDetails("single"),
        isError: true,
      };
    }

    const runIdsFromArray = ((rawRunIds ?? []) as number[]).filter((value) =>
      Number.isInteger(value),
    );
    const hasRunId = Number.isInteger(resolvedParams.runId);
    const hasRunIds = runIdsFromArray.length > 0;
    const isBulkAction = asyncAction === "abort" || asyncAction === "remove";

    if (!hasSingle && !hasBatch && !hasChain) {
      if (!isBulkAction && rawRunIds !== undefined) {
        return {
          content: [
            {
              type: "text",
              text: `asyncAction=${asyncAction} does not support runIds. Use runId.`,
            },
          ],
          details: makeDetails("single"),
          isError: true,
        };
      }

      if (hasRunId && hasRunIds) {
        return {
          content: [{ type: "text", text: "Use either runId or runIds, not both." }],
          details: makeDetails("single"),
          isError: true,
        };
      }

      if (!hasRunId && !hasRunIds) {
        const required = isBulkAction ? "runId or runIds" : "runId";
        return {
          content: [{ type: "text", text: `asyncAction=${asyncAction} requires ${required}.` }],
          details: makeDetails("single"),
          isError: true,
        };
      }

      const targetRunIds = hasRunIds
        ? Array.from(new Set(runIdsFromArray))
        : [resolvedParams.runId as number];
      const firstRunId = targetRunIds[0] ?? 0;

      if (asyncAction === "status") {
        return handleStatusAction(firstRunId, store, makeDetails);
      }

      if (asyncAction === "detail") {
        return handleDetailAction(firstRunId, store, makeDetails);
      }

      if (asyncAction === "abort") {
        return handleAbortAction(targetRunIds, store, ctx, makeDetails);
      }

      if (asyncAction === "remove") {
        return handleRemoveAction(targetRunIds, store, ctx, pi, makeDetails);
      }
    }

    // ── Concurrent run limit check ─────────────────────────────────────
    const requestedLaunchCount = hasBatch
      ? Array.isArray(resolvedParams.runs)
        ? resolvedParams.runs.length
        : 0
      : hasChain
        ? 1
        : 1;
    if (runCounts.running + requestedLaunchCount > MAX_CONCURRENT_ASYNC_SUBAGENT_RUNS) {
      return {
        content: [
          {
            type: "text",
            text: withIdleRunWarning(
              `Too many running subagent runs (${runCounts.running}). Max is ${MAX_CONCURRENT_ASYNC_SUBAGENT_RUNS}. Wait for completion, abort unnecessary runs, or remove stale runs before starting more runs.`,
            ),
          },
        ],
        details: makeDetails(),
        isError: true,
      };
    }

    // ── Shared launch helpers ──────────────────────────────────────────
    function launchRun(config: Omit<RunLaunchConfig, "source">): CommandRunState {
      return registerRunLaunch(store, ctx, { ...config, source: "tool" });
    }

    function cleanupRunAfterFinalDelivery(runId: number) {
      store.globalLiveRuns.delete(runId);
      store.recentLaunchTimestamps.delete(runId);
    }

    function launchRunInBackground(
      runState: CommandRunState,
      taskForAgent: string,
    ): Promise<FinalizedRun> {
      return enqueueSubagentInvocation(() =>
        runSingleAgent(
          ctx.cwd,
          agents,
          runState.agent,
          taskForAgent,
          runState.pipelineStepIndex,
          runState.abortController?.signal,
          (partial) => {
            if (runState.removed) return;
            const current = partial.details?.results?.[0];
            if (!current) return;
            updateRunFromResult(runState, current);
            updateCommandRunsWidget(store);
          },
          (results) => makeDetails(mode, results),
          runState.sessionFile,
        ),
      ).then((result) => finalizeRunState(runState, result));
    }

    // ── Launch actions ─────────────────────────────────────────────────
    const sharedLaunchCtx = {
      store,
      ctx,
      pi,
      agents,
      mainContextText,
      totalMessageCount,
      mainSessionFile,
      originSessionFile,
      inheritMainContext,
      mode,
      makeDetails,
      withIdleRunWarning,
      launchRun,
      launchRunInBackground,
      cleanupRunAfterFinalDelivery,
    };

    if (hasSingle) {
      return handleLaunchAction(params, sharedLaunchCtx);
    }

    if (hasBatch) {
      return handleBatchAction(params, sharedLaunchCtx);
    }

    if (hasChain) {
      return handleChainAction(params, sharedLaunchCtx);
    }

    return {
      content: [{ type: "text", text: withIdleRunWarning("Invalid subagent invocation.") }],
      details: makeDetails(),
      isError: true,
    };
  };
}
