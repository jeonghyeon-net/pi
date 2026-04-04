import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  DEFAULT_TURN_COUNT,
  PARENT_ENTRY_TYPE,
  STALE_PENDING_COMPLETION_MS,
  STATUS_LOG_FOOTER,
} from "../core/constants.js";
import { getLastNonEmptyLine, type SubagentStore } from "../core/store.js";
import type { CommandRunState, UsageStats } from "../core/types.js";
import { isCustomEntry, isCustomMessageEntry } from "../core/types.js";
import { toWidgetCtx, updateCommandRunsWidget } from "../ui/widget.js";
import { normalizePath } from "./navigation.js";
import {
  clearPendingGroupCompletion,
  consumePendingGroupCompletionsForSession,
  evictStalePendingGroupCompletions,
  upsertPendingGroupCompletion,
} from "./persist.js";

export function stripStatusLogFooter(text: string): string {
  if (!text) return text;
  const doubleBreakSuffix = `\n\n${STATUS_LOG_FOOTER}`;
  if (text.endsWith(doubleBreakSuffix)) return text.slice(0, -doubleBreakSuffix.length);
  const singleBreakSuffix = `\n${STATUS_LOG_FOOTER}`;
  if (text.endsWith(singleBreakSuffix)) return text.slice(0, -singleBreakSuffix.length);
  if (text.endsWith(STATUS_LOG_FOOTER)) return text.slice(0, -STATUS_LOG_FOOTER.length).trimEnd();
  return text;
}

export function toValidTimestampMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

export function toNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}

/**
 * Clear commandRuns and restore from current session entries.
 * Used by both session_start and session_switch handlers.
 * Also restores `currentParentSessionFile` from the latest `subagent-parent` entry.
 *
 * After restoring session entries, merges any still-running global live runs
 * into commandRuns so they remain visible and controllable across sessions.
 * Also delivers any pending completion messages for runs that finished while
 * the user was in a different session.
 */
export function restoreRunsFromSession(
  store: SubagentStore,
  ctx: ExtensionContext,
  pi?: ExtensionAPI,
): void {
  let currentSessionFile: string | null = null;
  try {
    currentSessionFile = normalizePath(ctx.sessionManager.getSessionFile());
  } catch {
    currentSessionFile = null;
  }

  // Snapshot previous session view before switching away so we can recover
  // transient runs when JSONL persistence lags behind session switching.
  if (store.currentSessionFile && store.currentSessionFile !== currentSessionFile) {
    const snapshot = Array.from(store.commandRuns.values()).map((run) => ({ ...run }));
    if (snapshot.length > 0) {
      store.sessionRunCache.set(store.currentSessionFile, snapshot);
    }
  }
  store.currentSessionFile = currentSessionFile;

  store.commandRuns.clear();
  store.commandWidgetCtx = toWidgetCtx(ctx);
  let sawSubagentMarkers = false;

  try {
    const entries = ctx.sessionManager.getEntries();
    const restoredRuns = new Map<number, CommandRunState>();
    const removedRunIds = new Set<number>();
    let maxRunId = 0;

    // Restore parent link from latest subagent-parent entry (if any).
    let latestParentSessionFile: string | null = null;
    for (const entry of entries) {
      if (isCustomEntry(entry)) {
        if (entry.customType === PARENT_ENTRY_TYPE) {
          sawSubagentMarkers = true;
          const ceData = entry.data as Record<string, unknown> | undefined;
          if (ceData?.parentSessionFile) {
            const cleaned = normalizePath(ceData.parentSessionFile);
            if (cleaned) latestParentSessionFile = cleaned;
          }
        }
      }
    }
    store.currentParentSessionFile = latestParentSessionFile;

    // First pass: collect removed run IDs
    for (const entry of entries) {
      if (isCustomEntry(entry)) {
        if (entry.customType === "subagent-removed") {
          sawSubagentMarkers = true;
          const ceRmData = entry.data as Record<string, unknown> | undefined;
          if (ceRmData?.runId != null) {
            removedRunIds.add(ceRmData.runId as number);
          }
        }
      }
    }

    for (const entry of entries) {
      if (!isCustomMessageEntry(entry)) continue;
      const cm = entry;
      if (cm.customType !== "subagent-command" && cm.customType !== "subagent-tool") continue;
      sawSubagentMarkers = true;
      const d = cm.details as
        | {
            runId?: number;
            agent?: string;
            task?: string;
            status?: string;
            exitCode?: number;
            error?: string;
            startedAt?: unknown;
            elapsedMs?: unknown;
            lastActivityAt?: unknown;
            continuedFromRunId?: number;
            turnCount?: number;
            contextMode?: string;
            sessionFile?: string;
            usage?: {
              input: number;
              output: number;
              cacheRead: number;
              cacheWrite: number;
              cost: number;
              contextTokens?: number;
              turns?: number;
            };
            model?: string;
            thoughtText?: string;
            progressText?: string;
            batchId?: string;
            pipelineId?: string;
            pipelineStepIndex?: number;
          }
        | undefined;
      if (!d || typeof d.runId !== "number") continue;

      const runId = d.runId;
      if (runId > maxRunId) maxRunId = runId;

      const existing = restoredRuns.get(runId);
      const entryTimestampMs = toValidTimestampMs(entry.timestamp);
      const startedAtFromDetails = toValidTimestampMs(d.startedAt);
      const elapsedFromDetails = toNonNegativeNumber(d.elapsedMs);
      const lastActivityAtFromDetails = toValidTimestampMs(d.lastActivityAt);

      // Determine final status primarily from structured metadata.
      const content = typeof cm.content === "string" ? cm.content : "";
      const statusRaw = typeof d.status === "string" ? d.status.trim().toLowerCase() : "";
      const statusFromDetails: "done" | "error" | null =
        statusRaw === "done" || statusRaw === "completed"
          ? "done"
          : statusRaw === "error" || statusRaw === "failed"
            ? "error"
            : null;
      const statusFromExitCode: "done" | "error" | null =
        typeof d.exitCode === "number" ? (d.exitCode === 0 ? "done" : "error") : null;
      const statusFromErrorField: "done" | "error" | null =
        typeof d.error === "string" && d.error.trim() ? "error" : null;

      // Legacy fallback for old sessions where structured fields are missing.
      const legacyStatusFromContent: "done" | "error" | null = content.includes("] completed")
        ? "done"
        : content.includes("] failed") || content.includes("] error")
          ? "error"
          : null;

      const finalStatus =
        statusFromDetails ?? statusFromExitCode ?? statusFromErrorField ?? legacyStatusFromContent;

      // Derive source from customType so tool-invoked runs keep their pixel widget placement after reload.
      const restoredSource: "tool" | "command" =
        cm.customType === "subagent-tool" ? "tool" : "command";

      if (finalStatus) {
        // Final message — create or overwrite with done/error state
        const startedAt =
          startedAtFromDetails ?? existing?.startedAt ?? entryTimestampMs ?? Date.now();
        const elapsedMs =
          elapsedFromDetails ??
          (existing?.elapsedMs && existing.elapsedMs > 0 ? existing.elapsedMs : undefined) ??
          (entryTimestampMs !== undefined ? Math.max(0, entryTimestampMs - startedAt) : 0);
        const lastActivityAt =
          lastActivityAtFromDetails ??
          entryTimestampMs ??
          existing?.lastActivityAt ??
          startedAt + elapsedMs;

        const run: CommandRunState = {
          id: runId,
          agent: d.agent ?? existing?.agent ?? "unknown",
          task: d.task ?? existing?.task ?? "",
          status: finalStatus,
          startedAt,
          lastActivityAt,
          elapsedMs,
          toolCalls: existing?.toolCalls ?? 0,
          lastLine: "",
          lastOutput: "",
          continuedFromRunId: d.continuedFromRunId,
          turnCount: d.turnCount ?? existing?.turnCount ?? DEFAULT_TURN_COUNT,
          sessionFile: d.sessionFile ?? existing?.sessionFile,
          contextMode:
            (d.contextMode === "main" || d.contextMode === "isolated"
              ? d.contextMode
              : undefined) ?? existing?.contextMode,
          usage: (d.usage as UsageStats | undefined) ?? existing?.usage,
          model: d.model ?? existing?.model,
          thoughtText: d.thoughtText ?? d.progressText ?? existing?.thoughtText,
          source: restoredSource,
        };
        // Extract thought/progress and output from content payload
        const lines = content.split("\n");
        if (!run.thoughtText) {
          const thoughtLine = lines.find(
            (l: string) =>
              l.startsWith("Thought: ") || l.startsWith("Result: ") || l.startsWith("Progress: "),
          );
          if (thoughtLine)
            run.thoughtText = thoughtLine.replace(/^(Thought|Result|Progress): /, "").trim();
        }
        const bodyStart = lines.findIndex((l: string) => l === "") + 1;
        if (bodyStart > 0 && bodyStart < lines.length) {
          run.lastOutput = stripStatusLogFooter(lines.slice(bodyStart).join("\n"));
          run.lastLine = getLastNonEmptyLine(run.lastOutput);
        }
        restoredRuns.set(runId, run);
      } else {
        // Started/resumed message — always update so we track the latest continuation.
        // If a completion message follows, it will overwrite this.
        // If not (crash/abort), this "interrupted" state persists.
        const startedAt =
          startedAtFromDetails ?? entryTimestampMs ?? existing?.startedAt ?? Date.now();
        const lastActivityAt =
          lastActivityAtFromDetails ?? entryTimestampMs ?? existing?.lastActivityAt ?? startedAt;

        restoredRuns.set(runId, {
          id: runId,
          agent: d.agent ?? existing?.agent ?? "unknown",
          task: d.task ?? existing?.task ?? "",
          status: "error",
          startedAt,
          lastActivityAt,
          elapsedMs: elapsedFromDetails ?? 0,
          toolCalls: existing?.toolCalls ?? 0,
          lastLine: "(interrupted — started but no completion found)",
          lastOutput: existing?.lastOutput,
          continuedFromRunId: d.continuedFromRunId,
          turnCount: d.turnCount ?? existing?.turnCount ?? DEFAULT_TURN_COUNT,
          sessionFile: d.sessionFile ?? existing?.sessionFile,
          contextMode:
            (d.contextMode === "main" || d.contextMode === "isolated"
              ? d.contextMode
              : undefined) ?? existing?.contextMode,
          usage: existing?.usage,
          model: existing?.model,
          thoughtText: d.thoughtText ?? d.progressText ?? existing?.thoughtText,
          source: restoredSource,
        });
      }
    }

    for (const [id, run] of restoredRuns) {
      if (removedRunIds.has(id)) {
        store.commandRuns.set(id, { ...run, removed: true }); // removed run도 복원, 단 removed=true 유지
        continue;
      }
      store.commandRuns.set(id, run);
    }
    if (maxRunId >= store.nextCommandRunId) {
      store.nextCommandRunId = maxRunId + 1;
    }
  } catch (_e) {
    // Silently ignore restore errors — fresh state is fine
  }

  // ── Merge global live runs (origin session only) ────────────────────
  // Re-integrate all non-removed runs that originated from the current session
  // so grouped batch/chain progress remains visible across session switches.
  const mergeSessionFile = currentSessionFile;
  if (mergeSessionFile) {
    for (const [runId, entry] of store.globalLiveRuns) {
      if (entry.originSessionFile !== mergeSessionFile) continue;
      if (!entry.runState.removed) {
        store.commandRuns.set(runId, entry.runState);
      }
    }
  }

  // ── Deliver pending completions ─────────────────────────────────────
  // If a run/batch/pipeline finished while the user was in a different session
  // and the user has now switched back to the origin session, deliver the stored
  // completion message via pi.sendMessage().
  if (pi && currentSessionFile) {
    for (const [runId, entry] of store.globalLiveRuns) {
      if (!entry.pendingCompletion) continue;
      if (entry.originSessionFile === currentSessionFile) {
        try {
          pi.sendMessage(entry.pendingCompletion.message, entry.pendingCompletion.options);
          store.commandRuns.set(runId, entry.runState);
          store.globalLiveRuns.delete(runId);
        } catch {
          /* keep pending completion for later retry */
        }
      }
    }

    for (const [batchId, batch] of store.batchGroups) {
      if (!batch.pendingCompletion) continue;
      if (batch.originSessionFile !== currentSessionFile) continue;
      try {
        pi.sendMessage(batch.pendingCompletion.message, batch.pendingCompletion.options);
        clearPendingGroupCompletion("batch", batchId);
        for (const runId of batch.runIds) {
          store.globalLiveRuns.delete(runId);
        }
        store.batchGroups.delete(batchId);
      } catch {
        upsertPendingGroupCompletion({
          scope: "batch",
          groupId: batchId,
          originSessionFile: batch.originSessionFile,
          runIds: batch.runIds,
          pendingCompletion: batch.pendingCompletion,
        });
      }
    }

    for (const [pipelineId, pipeline] of store.pipelines) {
      if (!pipeline.pendingCompletion) continue;
      if (pipeline.originSessionFile !== currentSessionFile) continue;
      try {
        pi.sendMessage(pipeline.pendingCompletion.message, pipeline.pendingCompletion.options);
        clearPendingGroupCompletion("chain", pipelineId);
        for (const runId of pipeline.stepRunIds) {
          store.globalLiveRuns.delete(runId);
        }
        store.pipelines.delete(pipelineId);
      } catch {
        upsertPendingGroupCompletion({
          scope: "chain",
          groupId: pipelineId,
          originSessionFile: pipeline.originSessionFile,
          runIds: pipeline.stepRunIds,
          pendingCompletion: pipeline.pendingCompletion,
        });
      }
    }

    for (const pending of consumePendingGroupCompletionsForSession(currentSessionFile)) {
      try {
        pi.sendMessage(pending.pendingCompletion.message, pending.pendingCompletion.options);
      } catch {
        upsertPendingGroupCompletion(pending);
      }
    }
  }

  // ── Evict stale pending completions (memory leak guard) ─────────────
  // If a completed run's pending completion has been sitting for longer
  // than the threshold without the user returning to its origin session,
  // discard it to prevent unbounded memory growth.
  for (const [runId, entry] of store.globalLiveRuns) {
    if (!entry.pendingCompletion) continue;
    if (entry.runState.status === "running") continue;
    const pendingSince =
      entry.pendingCompletion.createdAt ?? entry.runState.startedAt + entry.runState.elapsedMs;
    if (Date.now() - pendingSince > STALE_PENDING_COMPLETION_MS) {
      store.globalLiveRuns.delete(runId);
    }
  }

  for (const [batchId, batch] of store.batchGroups) {
    if (!batch.pendingCompletion) continue;
    const pendingSince = batch.pendingCompletion.createdAt ?? batch.createdAt;
    if (Date.now() - pendingSince > STALE_PENDING_COMPLETION_MS) {
      clearPendingGroupCompletion("batch", batchId);
      store.batchGroups.delete(batchId);
    }
  }

  for (const [pipelineId, pipeline] of store.pipelines) {
    if (!pipeline.pendingCompletion) continue;
    const pendingSince = pipeline.pendingCompletion.createdAt ?? pipeline.createdAt;
    if (Date.now() - pendingSince > STALE_PENDING_COMPLETION_MS) {
      clearPendingGroupCompletion("chain", pipelineId);
      store.pipelines.delete(pipelineId);
    }
  }

  evictStalePendingGroupCompletions(STALE_PENDING_COMPLETION_MS);

  // Fallback: if this session has no subagent markers at all, but we recently
  // had in-memory runs for the same session file, reuse that snapshot so
  // <> / >< hops do not make runs appear to "disappear".
  if (store.commandRuns.size === 0 && !sawSubagentMarkers && currentSessionFile) {
    const cached = store.sessionRunCache.get(currentSessionFile) ?? [];
    for (const run of cached) {
      store.commandRuns.set(run.id, { ...run });
    }
  }

  // Refresh per-session snapshot with the latest reconstructed view.
  if (currentSessionFile) {
    const latestSnapshot = Array.from(store.commandRuns.values()).map((run) => ({ ...run }));
    if (latestSnapshot.length > 0) {
      store.sessionRunCache.set(currentSessionFile, latestSnapshot);
    } else {
      store.sessionRunCache.delete(currentSessionFile);
    }
  }

  updateCommandRunsWidget(store, toWidgetCtx(ctx));
}
