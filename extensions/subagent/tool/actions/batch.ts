/**
 * Batch orchestration logic.
 */

import { MAX_BATCH_RUNS, SUBAGENT_STRONG_WAIT_MESSAGE } from "../../core/constants.js";
import type { BatchOrChainItem, CommandRunState } from "../../core/types.js";
import { stripTaskEchoFromMainContext, wrapTaskWithMainContext } from "../../session/context.js";
import { updateCommandRunsWidget, type WidgetRenderCtx } from "../../ui/widget.js";
import { formatBatchSummary, toLaunchSummary } from "../helpers.js";
import type { SubagentExecuteResult } from "../types.js";
import { deliverGroupCompletion, type GroupActionContext } from "./shared.js";

export type BatchContext = GroupActionContext;

export function handleBatchAction(
  params: Record<string, unknown>,
  bctx: BatchContext,
): SubagentExecuteResult {
  const {
    store,
    ctx,
    pi,
    mainContextText,
    totalMessageCount,
    mainSessionFile,
    originSessionFile,
    inheritMainContext,
    makeDetails,
    withIdleRunWarning,
    launchRun,
    launchRunInBackground,
    cleanupRunAfterFinalDelivery,
  } = bctx;

  const runs = Array.isArray(params.runs) ? (params.runs as BatchOrChainItem[]) : [];
  if (runs.length < 2) {
    return {
      content: [{ type: "text", text: "batch requires at least 2 runs." }],
      details: makeDetails("batch"),
      isError: true,
    };
  }
  if (runs.length > MAX_BATCH_RUNS) {
    return {
      content: [{ type: "text", text: `batch supports at most ${MAX_BATCH_RUNS} runs.` }],
      details: makeDetails("batch"),
      isError: true,
    };
  }

  const batchId = `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const runStates = runs.map((item, index) => {
    const taskForAgent = wrapTaskWithMainContext(
      item.task,
      stripTaskEchoFromMainContext(mainContextText, item.task),
      { mainSessionFile, totalMessageCount },
    );
    const runState = launchRun({
      agent: item.agent,
      taskForDisplay: item.task,
      taskForAgent,
      inheritMainContext,
      originSessionFile,
      batchId,
      pipelineStepIndex: index,
    });
    return { runState, taskForAgent };
  });

  store.batchGroups.set(batchId, {
    batchId,
    runIds: runStates.map(({ runState }) => runState.id),
    completedRunIds: new Set(),
    failedRunIds: new Set(),
    originSessionFile,
    createdAt: Date.now(),
    pendingResults: new Map(),
  });
  updateCommandRunsWidget(store, ctx as WidgetRenderCtx);

  for (const { runState, taskForAgent } of runStates) {
    (async () => {
      try {
        const finalized = await launchRunInBackground(runState, taskForAgent);

        const batch = store.batchGroups.get(batchId);
        if (!batch) return;
        batch.completedRunIds.add(runState.id);
        if (finalized.isError) batch.failedRunIds.add(runState.id);
        batch.pendingResults.set(runState.id, finalized.rawOutput);
        updateCommandRunsWidget(store);

        if (batch.completedRunIds.size === batch.runIds.length) {
          const orderedRuns = batch.runIds
            .map((runId) => store.commandRuns.get(runId))
            .filter((run): run is CommandRunState => Boolean(run));
          const batchTerminalStatus = batch.failedRunIds.size > 0 ? "error" : "completed";

          deliverGroupCompletion({
            scope: "batch",
            groupId: batchId,
            runIds: batch.runIds,
            originSessionFile: batch.originSessionFile,
            contentText: formatBatchSummary(batchId, orderedRuns, batchTerminalStatus),
            terminalStatus: batchTerminalStatus,
            orderedRuns,
            store,
            ctx,
            pi,
            cleanupRunAfterFinalDelivery,
            deleteGroup: () => store.batchGroups.delete(batchId),
            setPendingCompletion: (pending) => {
              batch.pendingCompletion = pending;
            },
          });

          ctx.ui?.notify?.(
            batch.failedRunIds.size > 0
              ? `subagent batch ${batchId} finished with errors`
              : `subagent batch ${batchId} completed`,
            batch.failedRunIds.size > 0 ? "error" : "info",
          );
        }
      } catch (error: unknown) {
        runState.status = "error";
        runState.elapsedMs = Date.now() - runState.startedAt;
        runState.lastLine = error instanceof Error ? error.message : "Subagent execution failed";
        runState.lastOutput = runState.lastLine;
        const batch = store.batchGroups.get(batchId);
        if (!batch) return;
        batch.completedRunIds.add(runState.id);
        batch.failedRunIds.add(runState.id);
        batch.pendingResults.set(runState.id, runState.lastLine);
        if (batch.completedRunIds.size === batch.runIds.length) {
          const orderedRuns = batch.runIds
            .map((runId) => store.commandRuns.get(runId))
            .filter((run): run is CommandRunState => Boolean(run));

          deliverGroupCompletion({
            scope: "batch",
            groupId: batchId,
            runIds: batch.runIds,
            originSessionFile: batch.originSessionFile,
            contentText: formatBatchSummary(batchId, orderedRuns, "error"),
            terminalStatus: "error",
            orderedRuns,
            store,
            ctx,
            pi,
            cleanupRunAfterFinalDelivery,
            deleteGroup: () => store.batchGroups.delete(batchId),
            setPendingCompletion: (pending) => {
              batch.pendingCompletion = pending;
            },
          });
        }
        updateCommandRunsWidget(store);
      }
    })().catch(() => {
      /* fire-and-forget: errors handled internally */
    });
  }

  return {
    content: [
      {
        type: "text",
        text: withIdleRunWarning(
          `Started async subagent batch ${batchId} (${runStates.length} runs). ${SUBAGENT_STRONG_WAIT_MESSAGE}`,
        ),
      },
    ],
    details: makeDetails(
      "batch",
      [],
      runStates.map(({ runState }) => toLaunchSummary(runState, "batch")),
    ),
  };
}
