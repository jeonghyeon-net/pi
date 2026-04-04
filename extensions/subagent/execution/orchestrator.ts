/**
 * Orchestrator — shared run lifecycle building blocks.
 *
 * Both the tool handler (tool.ts) and the command handler (command.ts) need to:
 *   1. register a new run (or reset an existing one),
 *   2. deliver completion messages (or queue them when the user switched sessions),
 *   3. clean up after a run finishes.
 *
 * This module provides those primitives so each call-site stays small and in sync.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { DEFAULT_TURN_COUNT } from "../core/constants.js";
import type { SubagentStore } from "../core/store.js";
import type { CommandRunState, PendingCompletion } from "../core/types.js";
import { makeSubagentSessionFile } from "../session/context.js";
import { updateCommandRunsWidget } from "../ui/widget.js";
import { trimCommandRunHistory } from "./run.js";

// ━━━ Session helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Minimal context shape required by orchestrator helpers.
 * Both SubagentToolExecuteContext and ExtensionContext satisfy this.
 *
 * Note: sessionManager.getSessionFile and ui.notify are the only methods
 * actually called on this type. Other properties are passed through to
 * widget rendering.
 */
export interface OrchestratorCtx {
  readonly sessionManager: {
    getSessionFile?: (() => string | undefined) | undefined;
  };
  readonly hasUI?: boolean | undefined;
  readonly ui?:
    | {
        notify?: ((message: string, type?: "info" | "warning" | "error") => void) | undefined;
      }
    | undefined;
}

export function getCurrentSessionFile(ctx: OrchestratorCtx): string {
  try {
    const raw = ctx.sessionManager.getSessionFile?.() ?? "";
    return typeof raw === "string" ? raw.replace(/[\r\n\t]+/g, "").trim() : "";
  } catch {
    return "";
  }
}

export function isInOriginSession(ctx: OrchestratorCtx, originSessionFile: string): boolean {
  const currentSessionFile = getCurrentSessionFile(ctx);
  return !currentSessionFile || !originSessionFile || currentSessionFile === originSessionFile;
}

// ━━━ PendingCompletion factory ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function makePendingCompletion(
  message: PendingCompletion["message"],
  triggerTurn = true,
): PendingCompletion {
  return {
    message,
    options: { deliverAs: "followUp", triggerTurn },
    createdAt: Date.now(),
  };
}

// ━━━ Run registration ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type RunLaunchConfig = {
  agent: string;
  taskForDisplay: string;
  taskForAgent: string;
  inheritMainContext: boolean;
  originSessionFile: string;
  continuedFromRunId?: number | undefined;
  batchId?: string | undefined;
  pipelineId?: string | undefined;
  pipelineStepIndex?: number | undefined;
  existingRunState?: CommandRunState | undefined;
  /** "tool" or "command" — written to runState.source */
  source: "tool" | "command";
};

/**
 * Create (or reset) a CommandRunState and register it in the store's live-run maps.
 * Returns the ready-to-use runState with an active AbortController.
 */
export function registerRunLaunch(
  store: SubagentStore,
  ctx: OrchestratorCtx,
  config: RunLaunchConfig,
): CommandRunState {
  let runState: CommandRunState;
  if (config.existingRunState) {
    runState = config.existingRunState;
    runState.agent = config.agent;
    runState.task = config.taskForDisplay;
    runState.status = "running";
    runState.startedAt = Date.now();
    runState.lastActivityAt = Date.now();
    runState.elapsedMs = 0;
    runState.toolCalls = 0;
    runState.lastLine = "";
    runState.lastOutput = "";
    runState.usage = undefined;
    runState.model = undefined;
    runState.removed = false;
    runState.turnCount = Math.max(DEFAULT_TURN_COUNT, runState.turnCount || DEFAULT_TURN_COUNT) + 1;
    runState.contextMode =
      runState.contextMode ?? (config.inheritMainContext ? "main" : "isolated");
    runState.continuedFromRunId = config.continuedFromRunId;
    runState.sessionFile = runState.sessionFile ?? makeSubagentSessionFile(runState.id);
    runState.source = config.source;
  } else {
    const runId = store.nextCommandRunId++;
    runState = {
      id: runId,
      agent: config.agent,
      task: config.taskForDisplay,
      status: "running",
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      elapsedMs: 0,
      toolCalls: 0,
      lastLine: "",
      lastOutput: "",
      continuedFromRunId: config.continuedFromRunId,
      turnCount: DEFAULT_TURN_COUNT,
      sessionFile: makeSubagentSessionFile(runId),
      removed: false,
      contextMode: config.inheritMainContext ? "main" : "isolated",
      source: config.source,
      batchId: config.batchId,
      pipelineId: config.pipelineId,
      pipelineStepIndex: config.pipelineStepIndex,
    };
    store.commandRuns.set(runId, runState);
  }

  runState.batchId = config.batchId;
  runState.pipelineId = config.pipelineId;
  runState.pipelineStepIndex = config.pipelineStepIndex;
  const abortController = new AbortController();
  runState.abortController = abortController;
  store.globalLiveRuns.set(runState.id, {
    runState,
    abortController,
    originSessionFile: config.originSessionFile,
  });
  store.recentLaunchTimestamps.set(runState.id, runState.startedAt);
  store.commandWidgetCtx = ctx;
  updateCommandRunsWidget(store);
  return runState;
}

// ━━━ Delivery / queueing ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type DeliverOptions = {
  /** triggerTurn for the sendMessage call (tool=true, command=false) */
  triggerTurn: boolean;
  /** When delivered, also remove the run from globalLiveRuns + recentLaunchTimestamps */
  cleanupOnDeliver?: boolean;
};

/**
 * If the user is still in the origin session, deliver the message via
 * pi.sendMessage. Otherwise, queue it as a pendingCompletion on the
 * globalLiveRuns entry for later delivery when the user switches back.
 */
export function deliverOrQueueCompletion(
  pi: ExtensionAPI,
  store: SubagentStore,
  ctx: OrchestratorCtx,
  originSessionFile: string,
  runId: number,
  message: PendingCompletion["message"],
  options: DeliverOptions,
): void {
  if (isInOriginSession(ctx, originSessionFile)) {
    pi.sendMessage(message, { deliverAs: "followUp", triggerTurn: options.triggerTurn });
    if (options.cleanupOnDeliver !== false) {
      store.globalLiveRuns.delete(runId);
      store.recentLaunchTimestamps.delete(runId);
    }
  } else {
    const entry = store.globalLiveRuns.get(runId);
    if (entry) {
      entry.pendingCompletion = makePendingCompletion(message, options.triggerTurn);
    }
  }
}

// ━━━ Cleanup ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type FinalizeCleanupOptions = {
  ctx: OrchestratorCtx;
  pi: ExtensionAPI;
};

/**
 * Shared finally-block logic: clear the run's AbortController,
 * trim old run history, and refresh the widget.
 */
export function finalizeAndCleanup(
  store: SubagentStore,
  runState: CommandRunState,
  options: FinalizeCleanupOptions,
): void {
  runState.abortController = undefined;
  trimCommandRunHistory(store, {
    maxRuns: 10,
    ctx: undefined,
    pi: options.pi,
    updateWidget: false,
    removalReason: "trim",
  });
  updateCommandRunsWidget(store);
}
