// @ts-nocheck — forked from Jonghakseo/my-pi
/**
 * Run lifecycle — create, remove, trim, hang detection, invocation queue.
 * Merges: run-utils.ts + hang-detector.ts + invocation-queue.ts
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { SubagentStore } from "./store.js";
import type { CommandRunState } from "./types.js";
import { HANG_TIMEOUT_MS, SUBAGENT_QUEUE_INTERVAL_MS } from "./types.js";
import { updateCommandRunsWidget, type WidgetRenderCtx } from "./widget.js";

// ━━━ Invocation Queue ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let startQueueTail: Promise<void> = Promise.resolve();
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function enqueueSubagentInvocation<T>(job: () => Promise<T>): Promise<T> {
  const startGate = startQueueTail.then(
    () => sleep(SUBAGENT_QUEUE_INTERVAL_MS),
    () => sleep(SUBAGENT_QUEUE_INTERVAL_MS),
  );
  startQueueTail = startGate.then(
    () => undefined,
    () => undefined,
  );
  return startGate.then(() => job());
}

// ━━━ Run Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function formatCommandRunSummary(run: CommandRunState): string {
  const elapsedSec = Math.max(0, Math.round(run.elapsedMs / 1000));
  const contextLabel = run.contextMode === "main" ? "main" : "isolated";
  return `#${run.id} [${run.status}] ${run.agent} ctx:${contextLabel} turn:${run.turnCount ?? 1} ${elapsedSec}s tools:${run.toolCalls}`;
}

export function getLatestRun(
  store: SubagentStore,
  statusFilter?: CommandRunState["status"] | CommandRunState["status"][],
): CommandRunState | undefined {
  const runs = Array.from(store.commandRuns.values()).sort((a, b) => b.id - a.id);
  if (!statusFilter) return runs[0];
  const allowed = Array.isArray(statusFilter) ? statusFilter : [statusFilter];
  return runs.find((r) => allowed.includes(r.status));
}

// ━━━ Remove / Trim ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RemoveRunOptions {
  ctx?: unknown;
  pi?: ExtensionAPI;
  abortIfRunning?: boolean;
  reason?: string;
  persistRemovedEntry?: boolean;
  updateWidget?: boolean;
  removalReason?: string;
}
export interface RemoveRunResult {
  removed: boolean;
  aborted: boolean;
}

export function removeRun(
  store: SubagentStore,
  runId: number,
  options: RemoveRunOptions = {},
): RemoveRunResult {
  const run = store.commandRuns.get(runId);
  if (!run) return { removed: false, aborted: false };
  const abortIfRunning = options.abortIfRunning ?? true;
  const persistRemovedEntry = options.persistRemovedEntry ?? true;
  const shouldUpdateWidget = options.updateWidget ?? true;
  let aborted = false;
  run.removed = true;
  const globalEntry = store.globalLiveRuns.get(runId);
  const controller = run.abortController ?? globalEntry?.abortController;
  if (abortIfRunning && run.status === "running" && controller) {
    const reason = options.reason ?? "Aborting by remove...";
    run.lastLine = reason;
    run.lastOutput = reason;
    controller.abort();
    aborted = true;
  }
  run.abortController = undefined;
  store.globalLiveRuns.delete(runId);
  if (persistRemovedEntry && options.pi) {
    const payload: Record<string, unknown> = { runId };
    if (options.removalReason) payload.reason = options.removalReason;
    try {
      options.pi.appendEntry("subagent-removed", payload);
    } catch {
      /* ignore */
    }
  }
  if (shouldUpdateWidget)
    updateCommandRunsWidget(store, options.ctx as WidgetRenderCtx | undefined);
  return { removed: true, aborted };
}

export interface TrimCommandRunHistoryOptions {
  maxRuns?: number;
  ctx?: unknown;
  pi?: ExtensionAPI;
  updateWidget?: boolean;
  removalReason?: string;
}

export function trimCommandRunHistory(
  store: SubagentStore,
  options: number | TrimCommandRunHistoryOptions = 10,
): number[] {
  const maxRuns = typeof options === "number" ? options : (options.maxRuns ?? 10);
  const shouldUpdateWidget = typeof options === "number" ? false : (options.updateWidget ?? false);
  const completed = Array.from(store.commandRuns.values())
    .filter((run) => {
      if (run.removed || run.status === "running") return false;
      const ge = store.globalLiveRuns.get(run.id);
      if (ge?.pendingCompletion) return false;
      return true;
    })
    .sort((a, b) => a.id - b.id);
  let activeCount = Array.from(store.commandRuns.values()).filter((r) => !r.removed).length;
  const removedRunIds: number[] = [];
  while (activeCount > maxRuns && completed.length > 0) {
    const oldest = completed.shift();
    if (!oldest) continue;
    const result = removeRun(store, oldest.id, {
      ctx: typeof options === "number" ? undefined : options.ctx,
      pi: typeof options === "number" ? undefined : options.pi,
      abortIfRunning: false,
      updateWidget: false,
      persistRemovedEntry: true,
      removalReason: typeof options === "number" ? undefined : options.removalReason,
    });
    if (result.removed) {
      removedRunIds.push(oldest.id);
      activeCount--;
    }
  }
  if (shouldUpdateWidget && removedRunIds.length > 0)
    updateCommandRunsWidget(
      store,
      (typeof options === "number" ? undefined : options.ctx) as WidgetRenderCtx | undefined,
    );
  return removedRunIds;
}

// ━━━ Hang Detection ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function checkForHungRuns(store: SubagentStore, pi: ExtensionAPI): void {
  const now = Date.now();
  const processed = new Set<number>();
  const tryAbort = (runId: number, run: CommandRunState): void => {
    if (run.status !== "running" || !run.lastActivityAt) return;
    if (run.lastLine?.startsWith("Auto-aborted:")) return;
    const idleMs = now - run.lastActivityAt;
    if (idleMs < HANG_TIMEOUT_MS) return;
    const globalEntry = store.globalLiveRuns.get(runId);
    const controller = run.abortController ?? globalEntry?.abortController;
    const reason = `Auto-aborted: no activity for ${Math.round(idleMs / 1000)}s`;
    run.lastLine = reason;
    run.lastOutput = reason;
    run.status = "error";
    if (controller) controller.abort();
    pi.sendMessage(
      {
        customType: "subagent-command",
        content: `⚠️ worker#${runId} (${run.agent}) — ${Math.round(idleMs / 1000)}초 무응답으로 자동 abort됨`,
        display: true,
        details: { runId, agent: run.agent, task: run.task, status: "auto-aborted", idleMs },
      },
      { deliverAs: "followUp", triggerTurn: false },
    );
  };
  for (const [runId, run] of store.commandRuns) {
    processed.add(runId);
    tryAbort(runId, run);
  }
  for (const [runId, entry] of store.globalLiveRuns) {
    if (!processed.has(runId)) tryAbort(runId, entry.runState);
  }
  updateCommandRunsWidget(store);
}
