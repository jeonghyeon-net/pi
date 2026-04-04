/**
 * Single run/continue launch logic.
 */

import { ESCALATION_EXIT_CODE, SUBAGENT_STRONG_WAIT_MESSAGE } from "../../core/constants.js";
import type { AgentConfig, CommandRunState } from "../../core/types.js";
import { deliverOrQueueCompletion, finalizeAndCleanup } from "../../execution/orchestrator.js";
// orchestrator types used transitively by BaseActionContext
import { stripTaskEchoFromMainContext, wrapTaskWithMainContext } from "../../session/context.js";
import { updateCommandRunsWidget } from "../../ui/widget.js";
import {
  buildEscalationMessage,
  buildRunCompletionMessage,
  buildRunStartMessage,
  toLaunchSummary,
} from "../helpers.js";
import type { SubagentExecuteResult } from "../types.js";
import type { BaseActionContext } from "./shared.js";

export type LaunchContext = BaseActionContext & {
  agents: AgentConfig[];
};

export function handleLaunchAction(
  params: Record<string, unknown>,
  lctx: LaunchContext,
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
  } = lctx;

  const continuationRunId = Number.isInteger(params.runId) ? (params.runId as number) : undefined;
  let continueFromRun: CommandRunState | undefined;
  if (continuationRunId !== undefined) {
    continueFromRun = store.commandRuns.get(continuationRunId);
    if (!continueFromRun) {
      return {
        content: [
          {
            type: "text",
            text: withIdleRunWarning(
              `Unknown subagent run #${continuationRunId}. Use \`subagent runs\` to see available runs.`,
            ),
          },
        ],
        details: makeDetails("single"),
        isError: true,
      };
    }
    if (continueFromRun.status === "running") {
      return {
        content: [
          {
            type: "text",
            text: withIdleRunWarning(
              `Subagent #${continuationRunId} is still running. Wait for it to finish or abort it first.`,
            ),
          },
        ],
        details: makeDetails("single"),
        isError: true,
      };
    }
  }

  const resolvedAgent = (params.agent ?? continueFromRun?.agent ?? "worker") as string;
  const rawTask = typeof params.task === "string" ? params.task : "";
  if (!rawTask.trim()) {
    return {
      content: [{ type: "text", text: withIdleRunWarning("subagent run/continue requires task.") }],
      details: makeDetails("single"),
      isError: true,
    };
  }

  const taskForDisplay = continueFromRun ? `[continue #${continueFromRun.id}] ${rawTask}` : rawTask;
  const taskForAgent = wrapTaskWithMainContext(
    rawTask,
    stripTaskEchoFromMainContext(mainContextText, rawTask),
    {
      mainSessionFile,
      totalMessageCount,
    },
  );
  const runState = launchRun({
    agent: resolvedAgent,
    taskForDisplay,
    taskForAgent,
    inheritMainContext,
    originSessionFile,
    continuedFromRunId: continuationRunId,
    existingRunState: continueFromRun,
  });
  const startedState = continueFromRun ? "resumed" : "started";
  pi.sendMessage(buildRunStartMessage(runState, startedState), {
    deliverAs: "followUp",
    triggerTurn: false,
  });
  ctx.ui?.notify?.(
    `${continueFromRun ? `Resumed subagent #${runState.id}` : `Started subagent #${runState.id}`}: ${resolvedAgent}`,
    "info",
  );

  (async () => {
    try {
      const finalized = await launchRunInBackground(runState, taskForAgent);
      if (runState.removed) return;
      updateCommandRunsWidget(store);

      if (finalized.result?.exitCode === ESCALATION_EXIT_CODE) {
        const escalationMsg = finalized.rawOutput.replace(/^\[ESCALATION\]\s*/, "");
        const message = buildEscalationMessage(runState, escalationMsg, finalized.result);
        deliverOrQueueCompletion(pi, store, ctx, originSessionFile, runState.id, message, {
          triggerTurn: true,
        });
        return;
      }

      const completionMessage = buildRunCompletionMessage(finalized);
      deliverOrQueueCompletion(pi, store, ctx, originSessionFile, runState.id, completionMessage, {
        triggerTurn: true,
      });

      ctx.ui?.notify?.(
        finalized.isError
          ? `subagent tool run #${runState.id} (${resolvedAgent}) failed`
          : `subagent tool run #${runState.id} (${resolvedAgent}) completed`,
        finalized.isError ? "error" : "info",
      );
    } catch (error: unknown) {
      if (runState.removed) return;
      runState.status = "error";
      runState.elapsedMs = Date.now() - runState.startedAt;
      runState.lastLine = error instanceof Error ? error.message : "Subagent execution failed";
      runState.lastOutput = runState.lastLine;
      const errorMessage = buildRunCompletionMessage({
        runState,
        isError: true,
        rawOutput: runState.lastLine,
      });
      deliverOrQueueCompletion(pi, store, ctx, originSessionFile, runState.id, errorMessage, {
        triggerTurn: true,
      });
      ctx.ui?.notify?.(`subagent tool run #${runState.id} failed: ${runState.lastLine}`, "error");
      updateCommandRunsWidget(store);
    } finally {
      finalizeAndCleanup(store, runState, { ctx, pi });
    }
  })().catch(() => {
    /* fire-and-forget */
  });

  return {
    content: [
      {
        type: "text",
        text: withIdleRunWarning(
          `${continueFromRun ? `Resumed async subagent run #${runState.id}` : `Started async subagent run #${runState.id}`} (${resolvedAgent}). ${SUBAGENT_STRONG_WAIT_MESSAGE}`,
        ),
      },
    ],
    details: makeDetails(
      "single",
      [],
      [toLaunchSummary(runState, continueFromRun ? "continue" : "run")],
    ),
  };
}
