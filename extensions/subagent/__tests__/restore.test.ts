import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type {
  CustomEntry,
  CustomMessageEntry,
  ExtensionContext,
  SessionEntry,
} from "@mariozechner/pi-coding-agent";
import { STALE_PENDING_COMPLETION_MS, STATUS_LOG_FOOTER } from "../core/constants.js";
import { createStore } from "../core/store.js";
import type { CommandRunState, PendingCompletion } from "../core/types.js";
import { clearPendingGroupCompletion } from "../session/persist.js";
import {
  restoreRunsFromSession,
  stripStatusLogFooter,
  toNonNegativeNumber,
  toValidTimestampMs,
} from "../session/restore.js";

// ━━━ Helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeBase(id = "entry-1"): { id: string; parentId: null; timestamp: string } {
  return { id, parentId: null, timestamp: new Date().toISOString() };
}

function makeCustomEntry(customType: string, data?: Record<string, unknown>): CustomEntry {
  return { ...makeBase(), type: "custom", customType, data };
}

function makeCustomMessageEntry(
  customType: string,
  content: string,
  details: Record<string, unknown>,
  display = true,
): CustomMessageEntry {
  return { ...makeBase(), type: "custom_message", customType, content, details, display };
}

function makeMockCtx(
  entries: SessionEntry[],
  sessionFile = "/tmp/test-session.jsonl",
): ExtensionContext {
  return {
    hasUI: false,
    ui: {
      setWidget: () => undefined,
      select: () => Promise.resolve(undefined),
      confirm: () => Promise.resolve(false),
      input: () => Promise.resolve(undefined),
      notify: () => undefined,
      onTerminalInput: () => () => undefined,
      setStatus: () => undefined,
      setWorkingMessage: () => undefined,
      setHiddenThinkingLabel: () => undefined,
      setFooter: () => undefined,
      setTitle: () => undefined,
      custom: () => Promise.resolve(undefined),
      pasteToEditor: () => undefined,
      setEditorText: () => undefined,
      getEditorText: () => "",
      editor: () => Promise.resolve(undefined),
      setEditorComponent: () => undefined,
      setHeader: () => undefined,
      theme: {} as ExtensionContext["ui"]["theme"],
      getAllThemes: () => [],
      getTheme: () => undefined,
      setTheme: () => ({ success: true }),
      getToolsExpanded: () => false,
      setToolsExpanded: () => undefined,
    },
    cwd: "/tmp",
    sessionManager: {
      getSessionFile: () => sessionFile,
      getEntries: () => entries,
      getCwd: () => "/tmp",
      getSessionDir: () => "/tmp",
      getSessionId: () => "test-session",
      getLeafId: () => "leaf-id",
      getLeafEntry: () => undefined,
      getEntry: () => undefined,
      getLabel: () => undefined,
      getBranch: () => [],
      getHeader: () => undefined,
      getTree: () => [],
      getSessionName: () => undefined,
    },
    modelRegistry: {
      getAll: () => [],
    } as unknown as ExtensionContext["modelRegistry"],
    model: undefined,
    isIdle: () => true,
    signal: undefined,
    abort: () => undefined,
    hasPendingMessages: () => false,
    shutdown: () => undefined,
    getContextUsage: () => undefined,
    compact: () => undefined,
    getSystemPrompt: () => "",
  } as unknown as ExtensionContext;
}

// ━━━ stripStatusLogFooter ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("stripStatusLogFooter", () => {
  it("returns falsy text as-is", () => {
    assert.equal(stripStatusLogFooter(""), "");
  });

  it("strips double-break footer", () => {
    const text = `Some output\n\n${STATUS_LOG_FOOTER}`;
    assert.equal(stripStatusLogFooter(text), "Some output");
  });

  it("strips single-break footer", () => {
    const text = `Some output\n${STATUS_LOG_FOOTER}`;
    assert.equal(stripStatusLogFooter(text), "Some output");
  });

  it("strips footer directly at end (no break)", () => {
    const text = `Some output${STATUS_LOG_FOOTER}`;
    assert.equal(stripStatusLogFooter(text), "Some output");
  });

  it("returns text unchanged when no footer present", () => {
    assert.equal(stripStatusLogFooter("Hello world"), "Hello world");
  });
});

// ━━━ toValidTimestampMs ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("toValidTimestampMs", () => {
  it("returns number for valid positive number", () => {
    assert.equal(toValidTimestampMs(1234567890), 1234567890);
  });

  it("returns undefined for 0", () => {
    assert.equal(toValidTimestampMs(0), undefined);
  });

  it("returns undefined for negative number", () => {
    assert.equal(toValidTimestampMs(-1), undefined);
  });

  it("returns undefined for NaN", () => {
    assert.equal(toValidTimestampMs(Number.NaN), undefined);
  });

  it("returns undefined for Infinity", () => {
    assert.equal(toValidTimestampMs(Number.POSITIVE_INFINITY), undefined);
  });

  it("parses valid date string", () => {
    const result = toValidTimestampMs("2024-01-15T10:00:00Z");
    assert.ok(result !== undefined);
    assert.ok(result > 0);
  });

  it("returns undefined for empty string", () => {
    assert.equal(toValidTimestampMs(""), undefined);
  });

  it("returns undefined for whitespace-only string", () => {
    assert.equal(toValidTimestampMs("   "), undefined);
  });

  it("returns undefined for invalid date string", () => {
    assert.equal(toValidTimestampMs("not-a-date"), undefined);
  });

  it("returns undefined for non-number non-string", () => {
    assert.equal(toValidTimestampMs(null), undefined);
    assert.equal(toValidTimestampMs(undefined), undefined);
    assert.equal(toValidTimestampMs({}), undefined);
  });
});

// ━━━ toNonNegativeNumber ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("toNonNegativeNumber", () => {
  it("returns number for valid non-negative number", () => {
    assert.equal(toNonNegativeNumber(42), 42);
    assert.equal(toNonNegativeNumber(0), 0);
  });

  it("returns undefined for negative number", () => {
    assert.equal(toNonNegativeNumber(-1), undefined);
  });

  it("returns undefined for NaN", () => {
    assert.equal(toNonNegativeNumber(Number.NaN), undefined);
  });

  it("returns undefined for non-number", () => {
    assert.equal(toNonNegativeNumber("42"), undefined);
    assert.equal(toNonNegativeNumber(null), undefined);
  });
});

// ━━━ restoreRunsFromSession ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("restoreRunsFromSession", () => {
  it("restores empty session without errors", () => {
    const store = createStore();
    const ctx = makeMockCtx([]);
    restoreRunsFromSession(store, ctx);
    assert.equal(store.commandRuns.size, 0);
    assert.equal(store.currentParentSessionFile, null);
  });

  it("restores completed runs from custom_message entries", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "worker#1 completed\n\nResult text", {
        runId: 1,
        agent: "worker",
        task: "test task",
        status: "done",
        startedAt: Date.now() - 5000,
        elapsedMs: 5000,
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    assert.equal(store.commandRuns.size, 1);
    const run = store.commandRuns.get(1);
    assert.ok(run);
    assert.equal(run.agent, "worker");
    assert.equal(run.task, "test task");
    assert.equal(run.status, "done");
  });

  it("restores error runs from exitCode", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "worker#2 failed", {
        runId: 2,
        agent: "worker",
        task: "failing task",
        exitCode: 1,
        startedAt: Date.now() - 3000,
        elapsedMs: 3000,
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(2);
    assert.ok(run);
    assert.equal(run.status, "error");
  });

  it("handles interrupted runs (started but no completion)", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "worker#3 started", {
        runId: 3,
        agent: "worker",
        task: "interrupted task",
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(3);
    assert.ok(run);
    assert.equal(run.status, "error");
    assert.ok(run.lastLine.includes("interrupted"));
  });

  it("marks removed runs", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "worker#4 completed", {
        runId: 4,
        agent: "worker",
        task: "removed task",
        status: "done",
        startedAt: Date.now() - 2000,
        elapsedMs: 2000,
      }),
      makeCustomEntry("subagent-removed", { runId: 4 }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(4);
    assert.ok(run);
    assert.equal(run.removed, true);
  });

  it("restores parent session file from subagent-parent entry", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomEntry("subagent-parent", { parentSessionFile: "/tmp/parent.jsonl" }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    assert.equal(store.currentParentSessionFile, "/tmp/parent.jsonl");
  });

  it("updates nextCommandRunId past restored IDs", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "done", {
        runId: 42,
        agent: "worker",
        task: "task",
        status: "done",
        startedAt: Date.now() - 1000,
        elapsedMs: 1000,
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    assert.ok(store.nextCommandRunId > 42);
  });

  it("restores multiple runs in order", () => {
    const store = createStore();
    const now = Date.now();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "started #1", {
        runId: 1,
        agent: "worker",
        task: "first",
        startedAt: now - 10000,
      }),
      makeCustomMessageEntry("subagent-command", "started #2", {
        runId: 2,
        agent: "reviewer",
        task: "second",
        startedAt: now - 5000,
      }),
      makeCustomMessageEntry("subagent-command", "completed #1\n\nFirst result", {
        runId: 1,
        agent: "worker",
        task: "first",
        status: "done",
        startedAt: now - 10000,
        elapsedMs: 8000,
      }),
      makeCustomMessageEntry("subagent-command", "completed #2\n\nSecond result", {
        runId: 2,
        agent: "reviewer",
        task: "second",
        status: "done",
        startedAt: now - 5000,
        elapsedMs: 4000,
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    assert.equal(store.commandRuns.size, 2);
    assert.equal(store.commandRuns.get(1)?.status, "done");
    assert.equal(store.commandRuns.get(2)?.status, "done");
    assert.equal(store.commandRuns.get(1)?.agent, "worker");
    assert.equal(store.commandRuns.get(2)?.agent, "reviewer");
  });

  it("distinguishes tool vs command source from customType", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-tool", "tool done", {
        runId: 10,
        agent: "worker",
        task: "via tool",
        status: "done",
        startedAt: Date.now() - 1000,
        elapsedMs: 1000,
      }),
      makeCustomMessageEntry("subagent-command", "cmd done", {
        runId: 11,
        agent: "worker",
        task: "via command",
        status: "done",
        startedAt: Date.now() - 1000,
        elapsedMs: 1000,
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    assert.equal(store.commandRuns.get(10)?.source, "tool");
    assert.equal(store.commandRuns.get(11)?.source, "command");
  });

  it("restores usage stats from details", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "done", {
        runId: 20,
        agent: "worker",
        task: "task",
        status: "done",
        startedAt: Date.now() - 2000,
        elapsedMs: 2000,
        usage: {
          input: 100,
          output: 50,
          cacheRead: 10,
          cacheWrite: 5,
          cost: 0.01,
          contextTokens: 500,
          turns: 2,
        },
        model: "gpt-5.4",
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(20);
    assert.ok(run?.usage);
    assert.equal(run.usage.input, 100);
    assert.equal(run.usage.contextTokens, 500);
    assert.equal(run.model, "gpt-5.4");
  });

  // ── Status detection with "completed" alias ────────────────────────

  it("restores done status from details.status='completed'", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "worker#80 done", {
        runId: 80,
        agent: "worker",
        task: "task",
        status: "completed",
        startedAt: Date.now() - 1000,
        elapsedMs: 1000,
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(80);
    assert.ok(run);
    assert.equal(run.status, "done");
  });

  // ── Content non-string branch ──────────────────────────────────────

  it("handles non-string content in custom_message", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      {
        ...makeBase("e90"),
        type: "custom_message" as const,
        customType: "subagent-command",
        content: 42 as unknown as string,
        details: {
          runId: 90,
          agent: "worker",
          task: "numeric content",
          status: "done",
          startedAt: Date.now() - 1000,
          elapsedMs: 1000,
        },
        display: true,
      } as unknown as CustomMessageEntry,
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(90);
    assert.ok(run);
    assert.equal(run.status, "done");
  });

  // ── Thought/progress text extraction from content ──────────────────

  it("extracts thoughtText from Thought: line in content", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry(
        "subagent-command",
        "worker#91 done\nThought: thinking about it\n\nResult body",
        {
          runId: 91,
          agent: "worker",
          task: "task",
          status: "done",
          startedAt: Date.now() - 1000,
          elapsedMs: 1000,
        },
      ),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(91);
    assert.ok(run);
    assert.equal(run.thoughtText, "thinking about it");
  });

  it("prefers thoughtText from details over content", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry(
        "subagent-command",
        "worker#92 done\nThought: content thought\n\nResult body",
        {
          runId: 92,
          agent: "worker",
          task: "task",
          status: "done",
          startedAt: Date.now() - 1000,
          elapsedMs: 1000,
          thoughtText: "details thought",
        },
      ),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(92);
    assert.ok(run);
    assert.equal(run.thoughtText, "details thought");
  });

  it("extracts Progress: line when no Thought: line", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry(
        "subagent-command",
        "worker#93 done\nProgress: making progress\n\nResult body",
        {
          runId: 93,
          agent: "worker",
          task: "task",
          status: "done",
          startedAt: Date.now() - 1000,
          elapsedMs: 1000,
        },
      ),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(93);
    assert.ok(run);
    assert.equal(run.thoughtText, "making progress");
  });

  it("extracts Result: line as thought text", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry(
        "subagent-command",
        "worker#94 done\nResult: result summary\n\nBody here",
        {
          runId: 94,
          agent: "worker",
          task: "task",
          status: "done",
          startedAt: Date.now() - 1000,
          elapsedMs: 1000,
        },
      ),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(94);
    assert.ok(run);
    assert.equal(run.thoughtText, "result summary");
  });

  // ── Fallback chains for completed runs ─────────────────────────────

  it("uses entryTimestampMs as fallback for startedAt", () => {
    const store = createStore();
    const ts = "2024-06-15T12:00:00Z";
    const tsMs = Date.parse(ts);
    const entries: SessionEntry[] = [
      {
        ...makeBase("e95"),
        type: "custom_message" as const,
        customType: "subagent-command",
        content: "worker#95 done",
        timestamp: ts,
        details: {
          runId: 95,
          agent: "worker",
          task: "task",
          status: "done",
          // No startedAt — should fall back to entry timestamp
        },
        display: true,
      } as unknown as CustomMessageEntry,
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(95);
    assert.ok(run);
    assert.equal(run.startedAt, tsMs);
  });

  it("uses entryTimestampMs - startedAt for elapsedMs fallback", () => {
    const store = createStore();
    const startTime = Date.now() - 5000;
    const entryTime = new Date(startTime + 3000).toISOString();
    const entries: SessionEntry[] = [
      {
        ...makeBase("e96"),
        type: "custom_message" as const,
        customType: "subagent-command",
        content: "worker#96 done",
        timestamp: entryTime,
        details: {
          runId: 96,
          agent: "worker",
          task: "task",
          status: "done",
          startedAt: startTime,
          // No elapsedMs — should use entryTimestampMs - startedAt
        },
        display: true,
      } as unknown as CustomMessageEntry,
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(96);
    assert.ok(run);
    // elapsedMs should be approximately entryTimestampMs - startedAt = ~3000
    assert.ok(run.elapsedMs >= 2900 && run.elapsedMs <= 3100);
  });

  it("uses entryTimestampMs for lastActivityAt fallback", () => {
    const store = createStore();
    const ts = "2024-06-15T12:00:00Z";
    const tsMs = Date.parse(ts);
    const entries: SessionEntry[] = [
      {
        ...makeBase("e97"),
        type: "custom_message" as const,
        customType: "subagent-command",
        content: "worker#97 done",
        timestamp: ts,
        details: {
          runId: 97,
          agent: "worker",
          task: "task",
          status: "done",
          startedAt: tsMs - 5000,
          elapsedMs: 5000,
          // No lastActivityAt — should fall back to entryTimestampMs
        },
        display: true,
      } as unknown as CustomMessageEntry,
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(97);
    assert.ok(run);
    assert.equal(run.lastActivityAt, tsMs);
  });

  it("uses 'unknown' for agent when not provided in details or existing", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "[#98] done", {
        runId: 98,
        // No agent
        task: "task",
        status: "done",
        startedAt: Date.now() - 1000,
        elapsedMs: 1000,
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(98);
    assert.ok(run);
    assert.equal(run.agent, "unknown");
  });

  // ── Interrupted run fallback branches ──────────────────────────────

  it("interrupted run uses entryTimestampMs for startedAt and lastActivityAt", () => {
    const store = createStore();
    const ts = "2024-06-15T12:00:00Z";
    const tsMs = Date.parse(ts);
    const entries: SessionEntry[] = [
      {
        ...makeBase("e100"),
        type: "custom_message" as const,
        customType: "subagent-command",
        content: "worker#100 started",
        timestamp: ts,
        details: {
          runId: 100,
          agent: "worker",
          task: "interrupted",
          // No status, no startedAt, no lastActivityAt
        },
        display: true,
      } as unknown as CustomMessageEntry,
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(100);
    assert.ok(run);
    assert.equal(run.status, "error"); // interrupted
    assert.equal(run.startedAt, tsMs);
    assert.equal(run.lastActivityAt, tsMs);
  });

  it("interrupted run uses 'unknown' agent when not provided", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "started", {
        runId: 101,
        // No agent
        task: "task",
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(101);
    assert.ok(run);
    assert.equal(run.agent, "unknown");
  });

  it("interrupted run preserves existing usage and model", () => {
    const store = createStore();
    const now = Date.now();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "worker#102 partial", {
        runId: 102,
        agent: "worker",
        task: "task",
        startedAt: now - 10000,
        elapsedMs: 5000,
        usage: {
          input: 100,
          output: 50,
          cacheRead: 0,
          cacheWrite: 0,
          cost: 0.01,
          contextTokens: 200,
          turns: 2,
        },
        model: "opus",
        status: "done",
      }),
      // Second entry is a "resume" — no final status
      makeCustomMessageEntry("subagent-command", "worker#102 resumed", {
        runId: 102,
        agent: "worker",
        task: "task",
        startedAt: now - 5000,
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(102);
    assert.ok(run);
    // The second entry overwrites with interrupted status
    assert.equal(run.status, "error");
    // But usage and model should be preserved from first entry
    assert.ok(run.usage);
    assert.equal(run.model, "opus");
  });

  // ── Pending completion branches with no pendingCompletion ──────────

  it("skips batch group without pendingCompletion during delivery", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";
    const sendMessageFn = mock.fn(() => {
      /* noop */
    });
    const pi = {
      sendMessage: sendMessageFn,
      appendEntry: () => {
        /* noop */
      },
    };

    store.batchGroups.set("batch-no-pending", {
      batchId: "batch-no-pending",
      runIds: [110],
      completedRunIds: new Set([110]),
      failedRunIds: new Set(),
      originSessionFile: sessionFile,
      createdAt: Date.now(),
      pendingResults: new Map(),
      // No pendingCompletion
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx, pi as never);

    // sendMessage should NOT be called for this batch (no pending)
    // But the batch should remain
    assert.ok(store.batchGroups.has("batch-no-pending"));
  });

  it("skips pipeline without pendingCompletion during delivery", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";
    const sendMessageFn = mock.fn(() => {
      /* noop */
    });
    const pi = {
      sendMessage: sendMessageFn,
      appendEntry: () => {
        /* noop */
      },
    };

    store.pipelines.set("pipe-no-pending", {
      pipelineId: "pipe-no-pending",
      currentIndex: 0,
      stepRunIds: [120],
      stepResults: [],
      originSessionFile: sessionFile,
      createdAt: Date.now(),
      // No pendingCompletion
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx, pi as never);

    // Pipeline should remain
    assert.ok(store.pipelines.has("pipe-no-pending"));
  });

  it("skips batch from different session during delivery", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";
    const sendMessageFn = mock.fn(() => {
      /* noop */
    });
    const pi = {
      sendMessage: sendMessageFn,
      appendEntry: () => {
        /* noop */
      },
    };

    store.batchGroups.set("batch-other", {
      batchId: "batch-other",
      runIds: [130],
      completedRunIds: new Set([130]),
      failedRunIds: new Set(),
      originSessionFile: "/tmp/other-session.jsonl",
      createdAt: Date.now(),
      pendingResults: new Map(),
      pendingCompletion: {
        message: { customType: "test", content: "batch", display: true, details: {} },
        options: { deliverAs: "followUp" },
        createdAt: Date.now(),
      },
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx, pi as never);

    // Should NOT deliver — different session
    assert.ok(store.batchGroups.has("batch-other"));
  });

  it("skips pipeline from different session during delivery", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";
    const sendMessageFn = mock.fn(() => {
      /* noop */
    });
    const pi = {
      sendMessage: sendMessageFn,
      appendEntry: () => {
        /* noop */
      },
    };

    store.pipelines.set("pipe-other", {
      pipelineId: "pipe-other",
      currentIndex: 0,
      stepRunIds: [140],
      stepResults: [],
      originSessionFile: "/tmp/other-session.jsonl",
      createdAt: Date.now(),
      pendingCompletion: {
        message: { customType: "test", content: "pipe", display: true, details: {} },
        options: { deliverAs: "followUp" },
        createdAt: Date.now(),
      },
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx, pi as never);

    assert.ok(store.pipelines.has("pipe-other"));
  });

  // ── Stale eviction fallback for missing createdAt ──────────────────

  it("evicts stale batch using createdAt fallback", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";

    store.batchGroups.set("stale-batch-no-ca", {
      batchId: "stale-batch-no-ca",
      runIds: [150],
      completedRunIds: new Set([150]),
      failedRunIds: new Set(),
      originSessionFile: "/tmp/other.jsonl",
      createdAt: Date.now() - STALE_PENDING_COMPLETION_MS - 60_000,
      pendingResults: new Map(),
      pendingCompletion: {
        message: { customType: "test", content: "x", display: true, details: {} },
        options: { deliverAs: "followUp" },
        createdAt: undefined as unknown as number, // nullish → uses batch.createdAt via ??
      } as PendingCompletion,
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx);

    assert.equal(store.batchGroups.has("stale-batch-no-ca"), false);
  });

  it("evicts stale pipeline using createdAt fallback", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";

    store.pipelines.set("stale-pipe-no-ca", {
      pipelineId: "stale-pipe-no-ca",
      currentIndex: 0,
      stepRunIds: [160],
      stepResults: [],
      originSessionFile: "/tmp/other.jsonl",
      createdAt: Date.now() - STALE_PENDING_COMPLETION_MS - 60_000,
      pendingCompletion: {
        message: { customType: "test", content: "x", display: true, details: {} },
        options: { deliverAs: "followUp" },
        createdAt: undefined as unknown as number, // nullish → uses pipeline.createdAt via ??
      } as PendingCompletion,
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx);

    assert.equal(store.pipelines.has("stale-pipe-no-ca"), false);
  });

  it("does not evict batch without pending completion during stale check", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";

    store.batchGroups.set("no-pending-batch", {
      batchId: "no-pending-batch",
      runIds: [170],
      completedRunIds: new Set([170]),
      failedRunIds: new Set(),
      originSessionFile: "/tmp/other.jsonl",
      createdAt: Date.now() - STALE_PENDING_COMPLETION_MS - 60_000,
      pendingResults: new Map(),
      // No pendingCompletion
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx);

    assert.ok(store.batchGroups.has("no-pending-batch"));
  });

  it("does not evict pipeline without pending completion during stale check", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";

    store.pipelines.set("no-pending-pipe", {
      pipelineId: "no-pending-pipe",
      currentIndex: 0,
      stepRunIds: [180],
      stepResults: [],
      originSessionFile: "/tmp/other.jsonl",
      createdAt: Date.now() - STALE_PENDING_COMPLETION_MS - 60_000,
      // No pendingCompletion
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx);

    assert.ok(store.pipelines.has("no-pending-pipe"));
  });

  // ── Entry without valid details or runId ────────────────────────────

  it("completed run uses Date.now() when all startedAt fallbacks are exhausted", () => {
    const store = createStore();
    const before = Date.now();
    const entries: SessionEntry[] = [
      {
        type: "custom_message" as const,
        id: "e-no-start",
        parentId: null,
        timestamp: "invalid-date",
        customType: "subagent-command",
        content: "done",
        details: {
          runId: 300,
          status: "done",
          // No agent, no task, no startedAt → all fallbacks exhausted → Date.now(), "unknown", ""
        },
        display: true,
      } as unknown as CustomMessageEntry,
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(300);
    assert.ok(run);
    assert.ok(run.startedAt >= before);
    assert.equal(run.agent, "unknown");
    assert.equal(run.task, "");
  });

  it("interrupted run uses Date.now() when all startedAt fallbacks are exhausted", () => {
    const store = createStore();
    const before = Date.now();
    const entries: SessionEntry[] = [
      {
        type: "custom_message" as const,
        id: "e-no-start-int",
        parentId: null,
        timestamp: "invalid-date",
        customType: "subagent-command",
        content: "started",
        details: {
          runId: 301,
          // No status, no agent, no task, no startedAt → interrupted with Date.now(), "unknown", ""
        },
        display: true,
      } as unknown as CustomMessageEntry,
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(301);
    assert.ok(run);
    assert.equal(run.status, "error");
    assert.ok(run.startedAt >= before);
    assert.equal(run.agent, "unknown");
    assert.equal(run.task, "");
  });

  it("evicts stale globalLiveRun using startedAt+elapsedMs fallback when createdAt is missing", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";

    store.globalLiveRuns.set(302, {
      runState: {
        id: 302,
        agent: "worker",
        task: "stale run",
        status: "done",
        startedAt: 1000,
        elapsedMs: 500,
        toolCalls: 0,
        lastLine: "",
        turnCount: 1,
        lastActivityAt: 1500,
      },
      abortController: new AbortController(),
      originSessionFile: "/tmp/other.jsonl",
      pendingCompletion: {
        message: { customType: "test", content: "x", display: true, details: {} },
        options: { deliverAs: "followUp" },
        createdAt: undefined as unknown as number,
      },
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx);

    // pendingSince = undefined ?? (1000 + 500) = 1500. Date.now() - 1500 > STALE_PENDING_COMPLETION_MS → evicted
    assert.equal(store.globalLiveRuns.has(302), false);
  });

  it("interrupted run falls back to existing agent and task when details omits them", () => {
    const store = createStore();
    const now = Date.now();
    const entries: SessionEntry[] = [
      // First entry establishes agent and task
      makeCustomMessageEntry("subagent-command", "worker#310 started", {
        runId: 310,
        agent: "existing-agent",
        task: "existing-task",
        startedAt: now - 10000,
      }),
      // Second entry (resume) omits agent and task → should fall back to existing
      {
        type: "custom_message" as const,
        id: "e310-resume",
        parentId: null,
        timestamp: "invalid-ts",
        customType: "subagent-command",
        content: "resumed",
        details: {
          runId: 310,
          // No status → interrupted; no agent, no task → fallback to existing
        },
        display: true,
      } as unknown as CustomMessageEntry,
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(310);
    assert.ok(run);
    assert.equal(run.status, "error"); // interrupted
    assert.equal(run.agent, "existing-agent");
    assert.equal(run.task, "existing-task");
  });

  it("skips custom_message entries without valid runId", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "no runId", {
        // No runId
        agent: "worker",
        task: "task",
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    assert.equal(store.commandRuns.size, 0);
  });

  it("skips entries with non-subagent customType", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("other-type", "not subagent", {
        runId: 999,
        agent: "worker",
        task: "task",
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    assert.equal(store.commandRuns.size, 0);
  });

  // ── globalLiveRun without pendingCompletion during delivery ────────

  it("skips globalLiveRun without pendingCompletion during delivery", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";
    const sendMessageFn = mock.fn(() => {
      /* noop */
    });
    const pi = {
      sendMessage: sendMessageFn,
      appendEntry: () => {
        /* noop */
      },
    };

    store.globalLiveRuns.set(190, {
      runState: {
        id: 190,
        agent: "worker",
        task: "no pending",
        status: "running",
        startedAt: Date.now(),
        elapsedMs: 0,
        toolCalls: 0,
        lastLine: "",
        turnCount: 1,
        lastActivityAt: Date.now(),
      },
      abortController: new AbortController(),
      originSessionFile: sessionFile,
      // No pendingCompletion
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx, pi as never);

    // Should NOT call sendMessage for this entry
    // The run should be merged via the globalLiveRuns merge (not delivery)
    assert.ok(store.commandRuns.has(190));
  });

  it("skips globalLiveRun pending delivery from different session", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";
    const sendMessageFn = mock.fn(() => {
      /* noop */
    });
    const pi = {
      sendMessage: sendMessageFn,
      appendEntry: () => {
        /* noop */
      },
    };

    store.globalLiveRuns.set(191, {
      runState: {
        id: 191,
        agent: "worker",
        task: "other session pending",
        status: "done",
        startedAt: Date.now() - 5000,
        elapsedMs: 5000,
        toolCalls: 0,
        lastLine: "",
        turnCount: 1,
        lastActivityAt: Date.now(),
      },
      abortController: new AbortController(),
      originSessionFile: "/tmp/other-session.jsonl",
      pendingCompletion: {
        message: { customType: "test", content: "done", display: true, details: {} },
        options: { deliverAs: "followUp" },
        createdAt: Date.now(),
      },
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx, pi as never);

    // Should NOT deliver — different session
    assert.ok(store.globalLiveRuns.has(191));
  });

  // ── Session snapshot save — no runs case ───────────────────────────

  // ── exitCode=0 as sole status indicator ─────────────────────────────

  it("restores done status from exitCode=0 when no status field", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "worker#200 exitcode", {
        runId: 200,
        agent: "worker",
        task: "task",
        exitCode: 0,
        startedAt: Date.now() - 1000,
        elapsedMs: 1000,
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(200);
    assert.ok(run);
    assert.equal(run.status, "done");
  });

  // ── existing?.startedAt fallback ───────────────────────────────────

  it("uses existing run startedAt when details lacks startedAt", () => {
    const store = createStore();
    const now = Date.now();
    const entries: SessionEntry[] = [
      // First entry sets startedAt
      makeCustomMessageEntry("subagent-command", "worker#201 started", {
        runId: 201,
        agent: "worker",
        task: "task",
        startedAt: now - 10000,
      }),
      // Second entry completes but has no startedAt and invalid timestamp
      {
        type: "custom_message" as const,
        id: "e201-done",
        parentId: null,
        timestamp: "not-a-date",
        customType: "subagent-command",
        content: "worker#201 done",
        details: {
          runId: 201,
          agent: "worker",
          task: "task",
          status: "done",
          elapsedMs: 8000,
          // No startedAt — falls back to existing.startedAt
        },
        display: true,
      } as unknown as CustomMessageEntry,
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(201);
    assert.ok(run);
    assert.equal(run.startedAt, now - 10000);
  });

  // ── elapsedMs fallback to 0 when existing has 0 ─────────────────────

  it("uses 0 elapsedMs when existing has 0 and no other fallback", () => {
    const store = createStore();
    const now = Date.now();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "worker#202 started", {
        runId: 202,
        agent: "worker",
        task: "task",
        startedAt: now - 10000,
        elapsedMs: 0, // 0 is not > 0, so this fallback branch returns undefined
      }),
      {
        type: "custom_message" as const,
        id: "e202-done",
        parentId: null,
        timestamp: "not-a-date",
        customType: "subagent-command",
        content: "worker#202 done",
        details: {
          runId: 202,
          agent: "worker",
          task: "task",
          status: "done",
          startedAt: now - 10000,
          // No elapsedMs, existing.elapsedMs=0 (falsy for > 0 check), no valid timestamp → falls to 0
        },
        display: true,
      } as unknown as CustomMessageEntry,
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(202);
    assert.ok(run);
    assert.equal(run.elapsedMs, 0);
  });

  // ── existing?.agent and existing?.task fallback ─────────────────────

  it("uses existing agent and task when details lacks them", () => {
    const store = createStore();
    const now = Date.now();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "started", {
        runId: 203,
        agent: "original-agent",
        task: "original-task",
        startedAt: now - 5000,
      }),
      makeCustomMessageEntry("subagent-command", "done", {
        runId: 203,
        // No agent, no task — falls back to existing
        status: "done",
        startedAt: now - 5000,
        elapsedMs: 5000,
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(203);
    assert.ok(run);
    assert.equal(run.agent, "original-agent");
    assert.equal(run.task, "original-task");
  });

  // ── Interrupted run with existing values ────────────────────────────

  it("interrupted run uses existing startedAt and lastActivityAt", () => {
    const store = createStore();
    const now = Date.now();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "worker#204 first", {
        runId: 204,
        agent: "worker",
        task: "task",
        startedAt: now - 20000,
        lastActivityAt: now - 15000,
      }),
      // Second entry is a resume with no startedAt, no lastActivityAt, invalid timestamp
      {
        type: "custom_message" as const,
        id: "e204-resume",
        parentId: null,
        timestamp: "invalid",
        customType: "subagent-command",
        content: "worker#204 resumed",
        details: {
          runId: 204,
          agent: "worker",
          task: "task",
          // No status → interrupted
          // No startedAt → falls to existing
          // No lastActivityAt → falls to existing
        },
        display: true,
      } as unknown as CustomMessageEntry,
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(204);
    assert.ok(run);
    assert.equal(run.status, "error"); // interrupted
    assert.equal(run.startedAt, now - 20000);
    assert.equal(run.lastActivityAt, now - 15000);
  });

  it("interrupted run falls back to startedAt for lastActivityAt", () => {
    const store = createStore();
    const now = Date.now();
    const entries: SessionEntry[] = [
      {
        type: "custom_message" as const,
        id: "e205",
        parentId: null,
        timestamp: "invalid",
        customType: "subagent-command",
        content: "worker#205 started",
        details: {
          runId: 205,
          agent: "worker",
          task: "task",
          startedAt: now - 5000,
          // No lastActivityAt, no valid timestamp, no existing → lastActivityAt = startedAt
        },
        display: true,
      } as unknown as CustomMessageEntry,
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(205);
    assert.ok(run);
    assert.equal(run.lastActivityAt, now - 5000);
  });

  // ── Stale eviction with valid createdAt ─────────────────────────────

  it("evicts stale globalLiveRun with valid createdAt", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";

    store.globalLiveRuns.set(300, {
      runState: {
        id: 300,
        agent: "worker",
        task: "stale",
        status: "done",
        startedAt: Date.now() - STALE_PENDING_COMPLETION_MS - 60_000,
        elapsedMs: 5000,
        toolCalls: 0,
        lastLine: "",
        turnCount: 1,
        lastActivityAt: Date.now(),
      },
      abortController: new AbortController(),
      originSessionFile: "/tmp/other.jsonl",
      pendingCompletion: {
        message: { customType: "test", content: "x", display: true, details: {} },
        options: { deliverAs: "followUp" },
        createdAt: Date.now() - STALE_PENDING_COMPLETION_MS - 60_000,
      },
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx);
    assert.equal(store.globalLiveRuns.has(300), false);
  });

  it("evicts stale batch with valid createdAt on pendingCompletion", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";

    store.batchGroups.set("stale-batch-valid-ca", {
      batchId: "stale-batch-valid-ca",
      runIds: [310],
      completedRunIds: new Set([310]),
      failedRunIds: new Set(),
      originSessionFile: "/tmp/other.jsonl",
      createdAt: Date.now(), // fresh createdAt on group
      pendingResults: new Map(),
      pendingCompletion: {
        message: { customType: "test", content: "x", display: true, details: {} },
        options: { deliverAs: "followUp" },
        createdAt: Date.now() - STALE_PENDING_COMPLETION_MS - 60_000, // stale on completion
      },
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx);
    assert.equal(store.batchGroups.has("stale-batch-valid-ca"), false);
  });

  it("evicts stale pipeline with valid createdAt on pendingCompletion", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";

    store.pipelines.set("stale-pipe-valid-ca", {
      pipelineId: "stale-pipe-valid-ca",
      currentIndex: 0,
      stepRunIds: [320],
      stepResults: [],
      originSessionFile: "/tmp/other.jsonl",
      createdAt: Date.now(), // fresh
      pendingCompletion: {
        message: { customType: "test", content: "x", display: true, details: {} },
        options: { deliverAs: "followUp" },
        createdAt: Date.now() - STALE_PENDING_COMPLETION_MS - 60_000, // stale
      },
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx);
    assert.equal(store.pipelines.has("stale-pipe-valid-ca"), false);
  });

  // ── Session snapshot save — no runs case ───────────────────────────

  it("cleans up session run cache when no runs exist", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";
    // Pre-populate cache
    store.sessionRunCache.set(sessionFile, []);

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx);

    // Empty cache should be deleted
    assert.equal(store.sessionRunCache.has(sessionFile), false);
  });

  // ── Error status from details / exitCode / error field / legacy ─────

  it("restores error status from details.status='failed'", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "worker#60 failed", {
        runId: 60,
        agent: "worker",
        task: "fail task",
        status: "failed",
        startedAt: Date.now() - 3000,
        elapsedMs: 3000,
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(60);
    assert.ok(run);
    assert.equal(run.status, "error");
  });

  it("restores error status from details.error field", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "worker#61 had error", {
        runId: 61,
        agent: "worker",
        task: "error field task",
        error: "Something went wrong",
        startedAt: Date.now() - 2000,
        elapsedMs: 2000,
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(61);
    assert.ok(run);
    assert.equal(run.status, "error");
  });

  it("restores status from legacy content ('] completed')", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "[worker#62] completed\n\nResult text", {
        runId: 62,
        agent: "worker",
        task: "legacy done",
        startedAt: Date.now() - 4000,
        elapsedMs: 4000,
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(62);
    assert.ok(run);
    assert.equal(run.status, "done");
  });

  it("restores status from legacy content ('] failed')", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "[worker#63] failed\n\nError output", {
        runId: 63,
        agent: "worker",
        task: "legacy fail",
        startedAt: Date.now() - 4000,
        elapsedMs: 4000,
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(63);
    assert.ok(run);
    assert.equal(run.status, "error");
  });

  it("restores status from legacy content ('] error')", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "[worker#64] error\n\nError output", {
        runId: 64,
        agent: "worker",
        task: "legacy error",
        startedAt: Date.now() - 4000,
        elapsedMs: 4000,
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(64);
    assert.ok(run);
    assert.equal(run.status, "error");
  });

  // ── Fallback paths for elapsedMs / lastActivityAt / contextMode ────

  it("falls back to existing elapsedMs when details.elapsedMs is missing", () => {
    const store = createStore();
    const now = Date.now();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "worker#70 started", {
        runId: 70,
        agent: "worker",
        task: "task",
        startedAt: now - 10000,
        elapsedMs: 5000,
      }),
      makeCustomMessageEntry("subagent-command", "worker#70 completed\n\nDone", {
        runId: 70,
        agent: "worker",
        task: "task",
        status: "done",
        startedAt: now - 10000,
        // No elapsedMs in second entry — should fall back to existing (5000) > 0
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(70);
    assert.ok(run);
    assert.equal(run.elapsedMs, 5000);
  });

  it("falls back to existing lastActivityAt when all others are undefined", () => {
    const store = createStore();
    const now = Date.now();
    const entries: SessionEntry[] = [
      // First entry has lastActivityAt
      makeCustomMessageEntry("subagent-command", "worker#71 started", {
        runId: 71,
        agent: "worker",
        task: "task",
        startedAt: now - 10000,
        lastActivityAt: now - 5000,
      }),
      // Second entry has no timestamps or lastActivityAt
      {
        ...makeBase("e71-done"),
        type: "custom_message",
        customType: "subagent-command",
        content: "worker#71 done",
        details: {
          runId: 71,
          agent: "worker",
          task: "task",
          status: "done",
          startedAt: now - 10000,
          // No lastActivityAt, no timestamp
        },
        display: true,
      } as unknown as CustomMessageEntry,
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(71);
    assert.ok(run);
    // lastActivityAt should have fallen back through the chain
  });

  it("falls back to existing lastActivityAt when timestamp and details are missing", () => {
    const store = createStore();
    const now = Date.now();
    const entries: SessionEntry[] = [
      // First entry establishes the run with a lastActivityAt
      makeCustomMessageEntry("subagent-command", "worker#73 started", {
        runId: 73,
        agent: "worker",
        task: "task",
        startedAt: now - 10000,
        lastActivityAt: now - 3000,
      }),
      // Second entry with status but NO lastActivityAt and invalid timestamp
      {
        type: "custom_message" as const,
        id: "e73-done",
        parentId: null,
        timestamp: "invalid-timestamp",
        customType: "subagent-command",
        content: "worker#73 done",
        details: {
          runId: 73,
          agent: "worker",
          task: "task",
          status: "done",
          startedAt: now - 10000,
          elapsedMs: 7000,
          // No lastActivityAt
        },
        display: true,
      } as unknown as CustomMessageEntry,
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(73);
    assert.ok(run);
    assert.equal(run.status, "done");
    // lastActivityAt should have fallen back to existing?.lastActivityAt (now - 3000)
    assert.equal(run.lastActivityAt, now - 3000);
  });

  it("falls back to startedAt + elapsedMs for lastActivityAt when no other sources exist", () => {
    const store = createStore();
    const now = Date.now();
    const entries: SessionEntry[] = [
      // Single completed entry with invalid timestamp, no lastActivityAt, and no previous entry
      {
        type: "custom_message" as const,
        id: "e74-done",
        parentId: null,
        timestamp: "not-a-date",
        customType: "subagent-command",
        content: "worker#74 done",
        details: {
          runId: 74,
          agent: "worker",
          task: "task",
          status: "done",
          startedAt: now - 10000,
          elapsedMs: 7000,
          // No lastActivityAt
        },
        display: true,
      } as unknown as CustomMessageEntry,
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(74);
    assert.ok(run);
    // lastActivityAt should be startedAt + elapsedMs = (now - 10000) + 7000 = now - 3000
    assert.equal(run.lastActivityAt, now - 3000);
  });

  it("restores contextMode in completed run from details", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "worker#72 done", {
        runId: 72,
        agent: "worker",
        task: "task",
        status: "done",
        startedAt: Date.now() - 1000,
        elapsedMs: 1000,
        contextMode: "isolated",
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(72);
    assert.ok(run);
    assert.equal(run.contextMode, "isolated");
  });

  it("maps legacy contextMode 'sub' to 'isolated' for backward compat", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "worker#73 done", {
        runId: 73,
        agent: "worker",
        task: "task",
        status: "done",
        startedAt: Date.now() - 1000,
        elapsedMs: 1000,
        contextMode: "sub",
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(73);
    assert.ok(run);
    assert.equal(run.contextMode, "isolated");
  });

  it("restores main contextMode from details", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "worker#74 done", {
        runId: 74,
        agent: "worker",
        task: "task",
        status: "done",
        startedAt: Date.now() - 1000,
        elapsedMs: 1000,
        contextMode: "main",
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(74);
    assert.ok(run);
    assert.equal(run.contextMode, "main");
  });

  // ── getSessionFile throwing ────────────────────────────────────────

  it("handles getSessionFile throwing gracefully", () => {
    const store = createStore();
    const ctx = {
      ...makeMockCtx([]),
      sessionManager: {
        ...makeMockCtx([]).sessionManager,
        getSessionFile: () => {
          throw new Error("no session file");
        },
        getEntries: () => [] as SessionEntry[],
      },
    } as unknown as ExtensionContext;
    restoreRunsFromSession(store, ctx);
    assert.equal(store.currentSessionFile, null);
  });

  // ── Global live runs merge ──────────────────────────────────────────

  it("merges global live runs from the current session", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";

    // Simulate a global live run that originated from this session
    const liveRun: CommandRunState = {
      id: 100,
      agent: "worker",
      task: "live task",
      status: "running",
      startedAt: Date.now() - 1000,
      elapsedMs: 1000,
      toolCalls: 5,
      lastLine: "working...",
      turnCount: 1,
      lastActivityAt: Date.now(),
    };
    store.globalLiveRuns.set(100, {
      runState: liveRun,
      abortController: new AbortController(),
      originSessionFile: sessionFile,
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx);

    // The live run should appear in commandRuns
    assert.ok(store.commandRuns.has(100));
    assert.equal(store.commandRuns.get(100)?.status, "running");
  });

  it("does not merge global live runs from other sessions", () => {
    const store = createStore();

    const liveRun: CommandRunState = {
      id: 100,
      agent: "worker",
      task: "other session task",
      status: "running",
      startedAt: Date.now() - 1000,
      elapsedMs: 1000,
      toolCalls: 0,
      lastLine: "",
      turnCount: 1,
      lastActivityAt: Date.now(),
    };
    store.globalLiveRuns.set(100, {
      runState: liveRun,
      abortController: new AbortController(),
      originSessionFile: "/tmp/OTHER-session.jsonl",
    });

    const ctx = makeMockCtx([], "/tmp/test-session.jsonl");
    restoreRunsFromSession(store, ctx);

    assert.equal(store.commandRuns.has(100), false);
  });

  it("does not merge removed global live runs", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";

    const liveRun: CommandRunState = {
      id: 100,
      agent: "worker",
      task: "removed task",
      status: "done",
      startedAt: Date.now() - 1000,
      elapsedMs: 1000,
      toolCalls: 0,
      lastLine: "",
      turnCount: 1,
      lastActivityAt: Date.now(),
      removed: true,
    };
    store.globalLiveRuns.set(100, {
      runState: liveRun,
      abortController: new AbortController(),
      originSessionFile: sessionFile,
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx);

    // Removed global live run should NOT be merged
    assert.equal(store.commandRuns.has(100), false);
  });

  // ── Pending completion delivery ─────────────────────────────────────

  it("delivers pending completion when returning to origin session", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";
    const sendMessageFn = mock.fn(() => {
      /* noop */
    });
    const pi = {
      sendMessage: sendMessageFn,
      appendEntry: () => {
        /* noop */
      },
    };

    const pendingCompletion: PendingCompletion = {
      message: { customType: "subagent-command", content: "done", display: true, details: {} },
      options: { deliverAs: "followUp" },
      createdAt: Date.now(),
    };
    const liveRun: CommandRunState = {
      id: 200,
      agent: "worker",
      task: "pending task",
      status: "done",
      startedAt: Date.now() - 5000,
      elapsedMs: 5000,
      toolCalls: 3,
      lastLine: "completed",
      turnCount: 1,
      lastActivityAt: Date.now(),
    };
    store.globalLiveRuns.set(200, {
      runState: liveRun,
      abortController: new AbortController(),
      originSessionFile: sessionFile,
      pendingCompletion,
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx, pi as never);

    assert.equal(sendMessageFn.mock.callCount(), 1);
    // After delivery, the global live run should be removed
    assert.equal(store.globalLiveRuns.has(200), false);
    // But the run should be in commandRuns
    assert.ok(store.commandRuns.has(200));
  });

  it("delivers batch pending completion when returning to origin session", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";
    const sendMessageFn = mock.fn(() => {
      /* noop */
    });
    const pi = {
      sendMessage: sendMessageFn,
      appendEntry: () => {
        /* noop */
      },
    };

    store.batchGroups.set("batch-1", {
      batchId: "batch-1",
      runIds: [10, 11],
      completedRunIds: new Set([10, 11]),
      failedRunIds: new Set(),
      originSessionFile: sessionFile,
      createdAt: Date.now() - 10_000,
      pendingResults: new Map(),
      pendingCompletion: {
        message: {
          customType: "subagent-command",
          content: "batch done",
          display: true,
          details: {},
        },
        options: { deliverAs: "followUp" },
        createdAt: Date.now(),
      },
    });
    // Add corresponding global live runs
    for (const runId of [10, 11]) {
      store.globalLiveRuns.set(runId, {
        runState: {
          id: runId,
          agent: "worker",
          task: "batch task",
          status: "done",
          startedAt: Date.now() - 5000,
          elapsedMs: 5000,
          toolCalls: 0,
          lastLine: "",
          turnCount: 1,
          lastActivityAt: Date.now(),
        },
        abortController: new AbortController(),
        originSessionFile: sessionFile,
      });
    }

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx, pi as never);

    assert.equal(sendMessageFn.mock.callCount(), 1);
    assert.equal(store.batchGroups.has("batch-1"), false);
    assert.equal(store.globalLiveRuns.has(10), false);
    assert.equal(store.globalLiveRuns.has(11), false);
  });

  it("delivers pipeline pending completion when returning to origin session", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";
    const sendMessageFn = mock.fn(() => {
      /* noop */
    });
    const pi = {
      sendMessage: sendMessageFn,
      appendEntry: () => {
        /* noop */
      },
    };

    store.pipelines.set("pipe-1", {
      pipelineId: "pipe-1",
      currentIndex: 2,
      stepRunIds: [30, 31],
      stepResults: [],
      originSessionFile: sessionFile,
      createdAt: Date.now() - 10_000,
      pendingCompletion: {
        message: {
          customType: "subagent-command",
          content: "pipeline done",
          display: true,
          details: {},
        },
        options: { deliverAs: "followUp" },
        createdAt: Date.now(),
      },
    });
    for (const runId of [30, 31]) {
      store.globalLiveRuns.set(runId, {
        runState: {
          id: runId,
          agent: "worker",
          task: "pipeline task",
          status: "done",
          startedAt: Date.now() - 5000,
          elapsedMs: 5000,
          toolCalls: 0,
          lastLine: "",
          turnCount: 1,
          lastActivityAt: Date.now(),
        },
        abortController: new AbortController(),
        originSessionFile: sessionFile,
      });
    }

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx, pi as never);

    assert.equal(sendMessageFn.mock.callCount(), 1);
    assert.equal(store.pipelines.has("pipe-1"), false);
  });

  // ── Stale eviction ─────────────────────────────────────────────────

  it("evicts stale pending completions from globalLiveRuns", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";

    const stalePendingRun: CommandRunState = {
      id: 300,
      agent: "worker",
      task: "stale task",
      status: "done",
      startedAt: Date.now() - STALE_PENDING_COMPLETION_MS - 60_000,
      elapsedMs: 5000,
      toolCalls: 0,
      lastLine: "",
      turnCount: 1,
      lastActivityAt: Date.now() - STALE_PENDING_COMPLETION_MS - 60_000,
    };
    store.globalLiveRuns.set(300, {
      runState: stalePendingRun,
      abortController: new AbortController(),
      originSessionFile: "/tmp/other-session.jsonl",
      pendingCompletion: {
        message: { customType: "test", content: "stale", display: true, details: {} },
        options: { deliverAs: "followUp" },
        createdAt: Date.now() - STALE_PENDING_COMPLETION_MS - 60_000,
      },
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx);

    // Should be evicted
    assert.equal(store.globalLiveRuns.has(300), false);
  });

  it("evicts stale batch pending completions", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";

    store.batchGroups.set("stale-batch", {
      batchId: "stale-batch",
      runIds: [400],
      completedRunIds: new Set([400]),
      failedRunIds: new Set(),
      originSessionFile: "/tmp/other-session.jsonl",
      createdAt: Date.now() - STALE_PENDING_COMPLETION_MS - 60_000,
      pendingResults: new Map(),
      pendingCompletion: {
        message: { customType: "test", content: "stale batch", display: true, details: {} },
        options: { deliverAs: "followUp" },
        createdAt: Date.now() - STALE_PENDING_COMPLETION_MS - 60_000,
      },
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx);

    assert.equal(store.batchGroups.has("stale-batch"), false);
  });

  it("evicts stale pipeline pending completions", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";

    store.pipelines.set("stale-pipe", {
      pipelineId: "stale-pipe",
      currentIndex: 1,
      stepRunIds: [500],
      stepResults: [],
      originSessionFile: "/tmp/other-session.jsonl",
      createdAt: Date.now() - STALE_PENDING_COMPLETION_MS - 60_000,
      pendingCompletion: {
        message: { customType: "test", content: "stale pipe", display: true, details: {} },
        options: { deliverAs: "followUp" },
        createdAt: Date.now() - STALE_PENDING_COMPLETION_MS - 60_000,
      },
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx);

    assert.equal(store.pipelines.has("stale-pipe"), false);
  });

  it("does not evict fresh pending completions", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";

    const freshRun: CommandRunState = {
      id: 600,
      agent: "worker",
      task: "fresh task",
      status: "done",
      startedAt: Date.now() - 5000,
      elapsedMs: 5000,
      toolCalls: 0,
      lastLine: "",
      turnCount: 1,
      lastActivityAt: Date.now(),
    };
    store.globalLiveRuns.set(600, {
      runState: freshRun,
      abortController: new AbortController(),
      originSessionFile: "/tmp/other-session.jsonl",
      pendingCompletion: {
        message: { customType: "test", content: "fresh", display: true, details: {} },
        options: { deliverAs: "followUp" },
        createdAt: Date.now(),
      },
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx);

    // Should NOT be evicted
    assert.ok(store.globalLiveRuns.has(600));
  });

  // ── Session run cache fallback ──────────────────────────────────────

  it("falls back to session run cache when no subagent markers found", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";

    // Pre-populate the session run cache
    const cachedRun: CommandRunState = {
      id: 700,
      agent: "worker",
      task: "cached task",
      status: "done",
      startedAt: Date.now() - 5000,
      elapsedMs: 5000,
      toolCalls: 0,
      lastLine: "cached result",
      turnCount: 1,
      lastActivityAt: Date.now(),
    };
    store.sessionRunCache.set(sessionFile, [cachedRun]);

    // Restore with empty entries (no subagent markers)
    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx);

    assert.ok(store.commandRuns.has(700));
    assert.equal(store.commandRuns.get(700)?.lastLine, "cached result");
  });

  it("does not use cache when session has subagent markers", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";

    // Pre-populate the cache with a run
    const cachedRun: CommandRunState = {
      id: 800,
      agent: "worker",
      task: "should not appear",
      status: "done",
      startedAt: Date.now() - 5000,
      elapsedMs: 5000,
      toolCalls: 0,
      lastLine: "cached",
      turnCount: 1,
      lastActivityAt: Date.now(),
    };
    store.sessionRunCache.set(sessionFile, [cachedRun]);

    // Entries with subagent markers — cache should NOT be used
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "worker#1 completed\n\nResult", {
        runId: 1,
        agent: "worker",
        task: "real task",
        status: "done",
        startedAt: Date.now() - 5000,
        elapsedMs: 5000,
      }),
    ];
    const ctx = makeMockCtx(entries, sessionFile);
    restoreRunsFromSession(store, ctx);

    assert.ok(store.commandRuns.has(1));
    // The cached run 800 should NOT be present since subagent markers were found
    assert.equal(store.commandRuns.has(800), false);
  });

  // ── Session snapshot save on session switch ─────────────────────────

  it("snapshots previous session runs when switching sessions", () => {
    const store = createStore();
    const oldSession = "/tmp/old-session.jsonl";
    const newSession = "/tmp/new-session.jsonl";

    // Set up store as if we're in oldSession with some runs
    store.currentSessionFile = oldSession;
    store.commandRuns.set(900, {
      id: 900,
      agent: "worker",
      task: "old session task",
      status: "done",
      startedAt: Date.now() - 5000,
      elapsedMs: 5000,
      toolCalls: 0,
      lastLine: "old result",
      turnCount: 1,
      lastActivityAt: Date.now(),
    });

    // Now switch to newSession
    const ctx = makeMockCtx([], newSession);
    restoreRunsFromSession(store, ctx);

    // The old session's runs should be cached
    const cached = store.sessionRunCache.get(oldSession);
    assert.ok(cached);
    assert.equal(cached.length, 1);
    assert.equal(cached[0]?.id, 900);
  });

  // ── Handles getEntries throwing ──────────────────────────────────────

  it("handles getEntries throwing gracefully", () => {
    const store = createStore();
    const ctx = {
      hasUI: false,
      ui: {
        setWidget: () => undefined,
        select: () => Promise.resolve(undefined),
        confirm: () => Promise.resolve(false),
        input: () => Promise.resolve(undefined),
        notify: () => undefined,
        onTerminalInput: () => () => undefined,
        setStatus: () => undefined,
        setWorkingMessage: () => undefined,
        setHiddenThinkingLabel: () => undefined,
        setFooter: () => undefined,
        setTitle: () => undefined,
        custom: () => Promise.resolve(undefined),
        pasteToEditor: () => undefined,
        setEditorText: () => undefined,
        getEditorText: () => "",
        editor: () => Promise.resolve(undefined),
        setEditorComponent: () => undefined,
        setHeader: () => undefined,
        theme: {} as ExtensionContext["ui"]["theme"],
        getAllThemes: () => [],
        getTheme: () => undefined,
        setTheme: () => ({ success: true }),
        getToolsExpanded: () => false,
        setToolsExpanded: () => undefined,
      },
      cwd: "/tmp",
      sessionManager: {
        getSessionFile: () => "/tmp/test.jsonl",
        getEntries: () => {
          throw new Error("entries error");
        },
        getCwd: () => "/tmp",
        getSessionDir: () => "/tmp",
        getSessionId: () => "test-session",
        getLeafId: () => "leaf-id",
        getLeafEntry: () => undefined,
        getEntry: () => undefined,
        getLabel: () => undefined,
        getBranch: () => [],
        getHeader: () => undefined,
        getTree: () => [],
        getSessionName: () => undefined,
      },
      modelRegistry: {
        getAll: () => [],
      } as unknown as ExtensionContext["modelRegistry"],
      model: undefined,
      isIdle: () => true,
      signal: undefined,
      abort: () => undefined,
      hasPendingMessages: () => false,
      shutdown: () => undefined,
      getContextUsage: () => undefined,
      compact: () => undefined,
      getSystemPrompt: () => "",
    } as unknown as ExtensionContext;

    // Should not throw
    restoreRunsFromSession(store, ctx);
    assert.equal(store.commandRuns.size, 0);
  });

  // ── Stale eviction with missing createdAt ──────────────────────────

  it("evicts stale globalLiveRun using fallback pendingSince", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";

    const oldStartedAt = Date.now() - STALE_PENDING_COMPLETION_MS - 60_000;
    const staleRun: CommandRunState = {
      id: 950,
      agent: "worker",
      task: "stale-no-createdAt",
      status: "done",
      startedAt: oldStartedAt,
      elapsedMs: 1000,
      toolCalls: 0,
      lastLine: "",
      turnCount: 1,
      lastActivityAt: oldStartedAt + 1000,
    };
    store.globalLiveRuns.set(950, {
      runState: staleRun,
      abortController: new AbortController(),
      originSessionFile: "/tmp/other-session.jsonl",
      pendingCompletion: {
        message: { customType: "test", content: "x", display: true, details: {} },
        options: { deliverAs: "followUp" },
        createdAt: 0, // falsy but type-valid; fallback uses startedAt+elapsedMs
      } as PendingCompletion,
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx);

    // createdAt is 0 (falsy), so pendingSince = startedAt + elapsedMs = very old => evicted
    assert.equal(store.globalLiveRuns.has(950), false);
  });

  // ── Pending completion delivery — error paths ──────────────────────

  it("keeps pending completion when sendMessage throws for individual run", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";
    const sendMessageFn = mock.fn(() => {
      throw new Error("delivery failed");
    });
    const pi = {
      sendMessage: sendMessageFn,
      appendEntry: () => {
        /* noop */
      },
    };

    const pendingCompletion: PendingCompletion = {
      message: { customType: "subagent-command", content: "done", display: true, details: {} },
      options: { deliverAs: "followUp" },
      createdAt: Date.now(),
    };
    const liveRun: CommandRunState = {
      id: 250,
      agent: "worker",
      task: "pending-fail",
      status: "done",
      startedAt: Date.now() - 5000,
      elapsedMs: 5000,
      toolCalls: 0,
      lastLine: "",
      turnCount: 1,
      lastActivityAt: Date.now(),
    };
    store.globalLiveRuns.set(250, {
      runState: liveRun,
      abortController: new AbortController(),
      originSessionFile: sessionFile,
      pendingCompletion,
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx, pi as never);

    // Pending completion should be kept for retry
    assert.ok(store.globalLiveRuns.has(250));
    assert.ok(store.globalLiveRuns.get(250)?.pendingCompletion);
  });

  it("persists batch pending completion when sendMessage throws", () => {
    const store = createStore();
    // Use unique session file to avoid cross-test contamination via persisted file
    const sessionFile = `/tmp/test-batch-fail-${Date.now()}.jsonl`;
    const sendMessageFn = mock.fn(() => {
      throw new Error("batch delivery failed");
    });
    const pi = {
      sendMessage: sendMessageFn,
      appendEntry: () => {
        /* noop */
      },
    };

    store.batchGroups.set("batch-fail", {
      batchId: "batch-fail",
      runIds: [60],
      completedRunIds: new Set([60]),
      failedRunIds: new Set(),
      originSessionFile: sessionFile,
      createdAt: Date.now() - 10_000,
      pendingResults: new Map(),
      pendingCompletion: {
        message: {
          customType: "subagent-command",
          content: "batch done",
          display: true,
          details: {},
        },
        options: { deliverAs: "followUp" },
        createdAt: Date.now(),
      },
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx, pi as never);

    // sendMessage was called at least once (for batch), and it threw
    assert.ok(sendMessageFn.mock.callCount() >= 1);
    // Clean up persisted state to avoid contaminating other tests
    clearPendingGroupCompletion("batch", "batch-fail");
  });

  it("persists pipeline pending completion when sendMessage throws", () => {
    const store = createStore();
    // Use unique session file to avoid cross-test contamination via persisted file
    const sessionFile = `/tmp/test-pipe-fail-${Date.now()}.jsonl`;
    const sendMessageFn = mock.fn(() => {
      throw new Error("pipeline delivery failed");
    });
    const pi = {
      sendMessage: sendMessageFn,
      appendEntry: () => {
        /* noop */
      },
    };

    store.pipelines.set("pipe-fail", {
      pipelineId: "pipe-fail",
      currentIndex: 1,
      stepRunIds: [70],
      stepResults: [],
      originSessionFile: sessionFile,
      createdAt: Date.now() - 10_000,
      pendingCompletion: {
        message: {
          customType: "subagent-command",
          content: "pipe done",
          display: true,
          details: {},
        },
        options: { deliverAs: "followUp" },
        createdAt: Date.now(),
      },
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx, pi as never);

    assert.ok(sendMessageFn.mock.callCount() >= 1);
    // Clean up persisted state
    clearPendingGroupCompletion("chain", "pipe-fail");
  });

  // ── Interrupted run with contextMode ──────────────────────────────

  it("restores interrupted run with isolated contextMode", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "worker#50 started", {
        runId: 50,
        agent: "worker",
        task: "isolated task",
        contextMode: "isolated",
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(50);
    assert.ok(run);
    assert.equal(run.status, "error");
    assert.equal(run.contextMode, "isolated");
    assert.ok(run.lastLine.includes("interrupted"));
  });

  it("restores interrupted run with main contextMode", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "worker#51 started", {
        runId: 51,
        agent: "worker",
        task: "main task",
        contextMode: "main",
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(51);
    assert.ok(run);
    assert.equal(run.contextMode, "main");
  });

  it("restores interrupted run with invalid contextMode falls back to undefined", () => {
    const store = createStore();
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "worker#52 started", {
        runId: 52,
        agent: "worker",
        task: "invalid mode task",
        contextMode: "bogus",
      }),
    ];
    const ctx = makeMockCtx(entries);
    restoreRunsFromSession(store, ctx);
    const run = store.commandRuns.get(52);
    assert.ok(run);
    assert.equal(run.contextMode, undefined);
  });

  // ── Does not evict running pending completions ─────────────────────

  it("does not evict stale but still running pending completions", () => {
    const store = createStore();
    const sessionFile = "/tmp/test-session.jsonl";

    const runningRun: CommandRunState = {
      id: 960,
      agent: "worker",
      task: "still running but old",
      status: "running",
      startedAt: Date.now() - STALE_PENDING_COMPLETION_MS - 60_000,
      elapsedMs: 0,
      toolCalls: 0,
      lastLine: "",
      turnCount: 1,
      lastActivityAt: Date.now(),
    };
    store.globalLiveRuns.set(960, {
      runState: runningRun,
      abortController: new AbortController(),
      originSessionFile: "/tmp/other-session.jsonl",
      pendingCompletion: {
        message: { customType: "test", content: "x", display: true, details: {} },
        options: { deliverAs: "followUp" },
        createdAt: Date.now() - STALE_PENDING_COMPLETION_MS - 60_000,
      },
    });

    const ctx = makeMockCtx([], sessionFile);
    restoreRunsFromSession(store, ctx);

    // Running runs should NOT be evicted even if stale
    assert.ok(store.globalLiveRuns.has(960));
  });
});
