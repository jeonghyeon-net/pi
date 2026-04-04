/**
 * Chain/pipeline orchestration logic.
 */

import { MAX_CHAIN_STEPS, SUBAGENT_STRONG_WAIT_MESSAGE } from "../../core/constants.js";
import type {
  BatchOrChainItem,
  CommandRunState,
  PipelineStepResult,
  SubagentLaunchSummary,
} from "../../core/types.js";
import {
  buildPipelineReferenceSection,
  stripTaskEchoFromMainContext,
  wrapTaskWithMainContext,
  wrapTaskWithPipelineContext,
} from "../../session/context.js";
import { updateCommandRunsWidget } from "../../ui/widget.js";
import { formatPipelineSummary, toLaunchSummary } from "../helpers.js";
import type { SubagentExecuteResult } from "../types.js";
import { deliverGroupCompletion, type GroupActionContext } from "./shared.js";

export type ChainContext = GroupActionContext;

export function handleChainAction(
  params: Record<string, unknown>,
  cctx: ChainContext,
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
  } = cctx;

  const steps = Array.isArray(params.steps) ? (params.steps as BatchOrChainItem[]) : [];
  if (steps.length < 2) {
    return {
      content: [{ type: "text", text: "chain requires at least 2 steps." }],
      details: makeDetails("chain"),
      isError: true,
    };
  }
  if (steps.length > MAX_CHAIN_STEPS) {
    return {
      content: [{ type: "text", text: `chain supports at most ${MAX_CHAIN_STEPS} steps.` }],
      details: makeDetails("chain"),
      isError: true,
    };
  }

  const pipelineId = `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const chainLaunches: SubagentLaunchSummary[] = [];
  store.pipelines.set(pipelineId, {
    pipelineId,
    currentIndex: 0,
    stepRunIds: [],
    stepResults: [],
    originSessionFile,
    createdAt: Date.now(),
  });

  (async () => {
    let previousOutput = "";
    let terminalStatus: "completed" | "stopped" | "error" = "completed";
    try {
      for (let index = 0; index < steps.length; index++) {
        const pipeline = store.pipelines.get(pipelineId);
        if (!pipeline) return;
        pipeline.currentIndex = index;

        const step = steps[index];
        if (!step) continue;
        const pipelineReferenceSection =
          index > 0
            ? buildPipelineReferenceSection(previousOutput, {
                agent: steps[index - 1]?.agent,
                task: steps[index - 1]?.task,
                stepNumber: index,
                totalSteps: steps.length,
              })
            : "";
        let taskForAgent = step.task;
        if (inheritMainContext) {
          taskForAgent = wrapTaskWithMainContext(
            step.task,
            stripTaskEchoFromMainContext(mainContextText, step.task),
            {
              mainSessionFile,
              totalMessageCount,
              referenceSections: pipelineReferenceSection ? [pipelineReferenceSection] : undefined,
            },
          );
        } else if (pipelineReferenceSection) {
          taskForAgent = wrapTaskWithPipelineContext(step.task, previousOutput, {
            agent: steps[index - 1]?.agent,
            task: steps[index - 1]?.task,
            stepNumber: index,
            totalSteps: steps.length,
          });
        }

        const runState = launchRun({
          agent: step.agent,
          taskForDisplay: step.task,
          taskForAgent,
          inheritMainContext,
          originSessionFile,
          pipelineId,
          pipelineStepIndex: index,
        });
        pipeline.stepRunIds.push(runState.id);
        chainLaunches.push(toLaunchSummary(runState, "chain"));

        const finalized = await launchRunInBackground(runState, taskForAgent);
        if (runState.removed) {
          terminalStatus = finalized.isError ? "error" : "stopped";
          pipeline.stepResults.push({
            runId: runState.id,
            agent: runState.agent,
            task: step.task,
            output: finalized.rawOutput || "Run removed before pipeline completion.",
            status: "error",
          });
          break;
        }

        const stepResult: PipelineStepResult = {
          runId: runState.id,
          agent: runState.agent,
          task: step.task,
          output: finalized.rawOutput,
          status: finalized.isError ? "error" : "done",
        };
        pipeline.stepResults.push(stepResult);
        previousOutput = finalized.rawOutput;
        updateCommandRunsWidget(store);

        if (finalized.isError) {
          terminalStatus = "error";
          break;
        }
      }
    } catch (error: unknown) {
      terminalStatus = "error";
      const pipeline = store.pipelines.get(pipelineId);
      if (pipeline) {
        pipeline.stepResults.push({
          runId: -1,
          agent: "pipeline",
          task: "internal error",
          output: error instanceof Error ? error.message : "Subagent execution failed",
          status: "error",
        });
      }
    } finally {
      const pipeline = store.pipelines.get(pipelineId);
      if (pipeline) {
        const hasError = pipeline.stepResults.some((step) => step.status === "error");
        if (terminalStatus === "completed" && hasError) {
          terminalStatus = "error";
        }
        const orderedRuns = pipeline.stepRunIds
          .map((runId) => store.commandRuns.get(runId))
          .filter((run): run is CommandRunState => Boolean(run));

        deliverGroupCompletion({
          scope: "chain",
          groupId: pipelineId,
          runIds: pipeline.stepRunIds,
          originSessionFile: pipeline.originSessionFile,
          contentText: formatPipelineSummary(pipelineId, pipeline.stepResults, terminalStatus),
          terminalStatus: terminalStatus === "completed" ? "done" : terminalStatus,
          orderedRuns,
          store,
          ctx,
          pi,
          cleanupRunAfterFinalDelivery,
          deleteGroup: () => store.pipelines.delete(pipelineId),
          setPendingCompletion: (pending) => {
            pipeline.pendingCompletion = pending;
          },
        });
      }
      updateCommandRunsWidget(store);
    }
  })().catch(() => {
    /* fire-and-forget */
  });

  return {
    content: [
      {
        type: "text",
        text: withIdleRunWarning(
          `Started async subagent chain ${pipelineId} (${steps.length} steps). ${SUBAGENT_STRONG_WAIT_MESSAGE}`,
        ),
      },
    ],
    details: makeDetails("chain", [], [...chainLaunches]),
  };
}
