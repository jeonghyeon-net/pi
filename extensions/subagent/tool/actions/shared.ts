/**
 * Shared helpers for batch and chain completion delivery.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { SubagentStore } from "../../core/store.js";
import type {
  CommandRunState,
  SingleResult,
  SubagentDetails,
  SubagentLaunchSummary,
} from "../../core/types.js";
import type { RunLaunchConfig } from "../../execution/orchestrator.js";
import { isInOriginSession, makePendingCompletion } from "../../execution/orchestrator.js";
import { trimCommandRunHistory } from "../../execution/run.js";
import {
  clearPendingGroupCompletion,
  upsertPendingGroupCompletion,
} from "../../session/persist.js";
import { buildRunAnalyticsSummary } from "../helpers.js";
import type { FinalizedRun, LaunchMode, SubagentToolExecuteContext } from "../types.js";

// ━━━ Shared Action Context ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Base context shared by all action handlers (launch, batch, chain). */
export type BaseActionContext = {
  store: SubagentStore;
  ctx: SubagentToolExecuteContext;
  pi: ExtensionAPI;
  mainContextText: string;
  totalMessageCount: number;
  mainSessionFile: string | undefined;
  originSessionFile: string;
  inheritMainContext: boolean;
  mode: LaunchMode;
  makeDetails: (
    modeOverride?: LaunchMode,
    results?: SingleResult[],
    launches?: SubagentLaunchSummary[],
  ) => SubagentDetails;
  withIdleRunWarning: (text: string) => string;
  launchRun: (config: Omit<RunLaunchConfig, "source">) => CommandRunState;
  launchRunInBackground: (runState: CommandRunState, taskForAgent: string) => Promise<FinalizedRun>;
};

/** Extended context for batch/chain that also handles cleanup. */
export type GroupActionContext = BaseActionContext & {
  cleanupRunAfterFinalDelivery: (runId: number) => void;
};

// ━━━ Group Completion Delivery ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type GroupCompletionConfig = {
  scope: "batch" | "chain";
  groupId: string;
  runIds: number[];
  originSessionFile: string;
  contentText: string;
  terminalStatus: string;
  orderedRuns: CommandRunState[];
  store: SubagentStore;
  ctx: SubagentToolExecuteContext;
  pi: ExtensionAPI;
  cleanupRunAfterFinalDelivery: (runId: number) => void;
  deleteGroup: () => void;
  setPendingCompletion: (pending: ReturnType<typeof makePendingCompletion>) => void;
};

/**
 * Delivers or queues the final completion message for a batch or chain group.
 * Handles origin-session detection, message delivery, cleanup, and trim.
 */
export function deliverGroupCompletion(config: GroupCompletionConfig): void {
  const {
    scope,
    groupId,
    runIds,
    originSessionFile,
    contentText,
    terminalStatus,
    orderedRuns,
    store,
    ctx,
    pi,
    cleanupRunAfterFinalDelivery,
    deleteGroup,
    setPendingCompletion,
  } = config;

  const message = {
    customType: "subagent-tool" as const,
    content: contentText,
    display: true,
    details: {
      ...(scope === "batch" ? { batchId: groupId } : { pipelineId: groupId }),
      ...(scope === "batch" ? { runIds } : { stepRunIds: runIds }),
      status: terminalStatus === "completed" || terminalStatus === "done" ? "done" : terminalStatus,
      runSummaries: orderedRuns.map((run) => buildRunAnalyticsSummary(run)),
    },
  };

  if (isInOriginSession(ctx, originSessionFile)) {
    pi.sendMessage(message, { deliverAs: "followUp", triggerTurn: true });
    clearPendingGroupCompletion(scope, groupId);
    for (const runId of runIds) cleanupRunAfterFinalDelivery(runId);
    deleteGroup();
  } else {
    const pending = makePendingCompletion(message, true);
    setPendingCompletion(pending);
    upsertPendingGroupCompletion({
      scope,
      groupId,
      originSessionFile,
      runIds,
      pendingCompletion: pending,
    });
  }

  trimCommandRunHistory(store, {
    maxRuns: 10,
    ctx: undefined,
    pi,
    updateWidget: false,
    removalReason: "trim",
  });
}
