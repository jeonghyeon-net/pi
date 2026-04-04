import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { HANG_TIMEOUT_MS } from "../core/constants.js";
import { createStore } from "../core/store.js";
import type { CommandRunState } from "../core/types.js";
import {
  checkForHungRuns,
  enqueueSubagentInvocation,
  getLatestRun,
  removeRun,
  trimCommandRunHistory,
} from "../execution/run.js";

// ━━━ Helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeRun(id: number, overrides: Partial<CommandRunState> = {}): CommandRunState {
  return {
    id,
    agent: "worker",
    task: `task-${id}`,
    status: "done",
    startedAt: Date.now() - 5000,
    elapsedMs: 5000,
    toolCalls: 0,
    lastLine: "",
    turnCount: 1,
    lastActivityAt: Date.now(),
    ...overrides,
  };
}

function makePi() {
  return {
    sendMessage: mock.fn(() => {
      /* noop */
    }),
    appendEntry: mock.fn(() => {
      /* noop */
    }),
  };
}

// ━━━ enqueueSubagentInvocation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("enqueueSubagentInvocation", () => {
  it("executes a single job and returns its result", async () => {
    const result = await enqueueSubagentInvocation(async () => 42);
    assert.equal(result, 42);
  });

  it("executes sequential jobs in order", async () => {
    const order: number[] = [];
    const p1 = enqueueSubagentInvocation(async () => {
      order.push(1);
      return 1;
    });
    const p2 = enqueueSubagentInvocation(async () => {
      order.push(2);
      return 2;
    });
    const p3 = enqueueSubagentInvocation(async () => {
      order.push(3);
      return 3;
    });
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    assert.equal(r1, 1);
    assert.equal(r2, 2);
    assert.equal(r3, 3);
    assert.deepStrictEqual(order, [1, 2, 3]);
  });

  it("continues queue even if a job rejects", async () => {
    const p1 = enqueueSubagentInvocation(async () => {
      throw new Error("boom");
    });
    const p2 = enqueueSubagentInvocation(async () => "ok");
    await assert.rejects(p1, { message: "boom" });
    const r2 = await p2;
    assert.equal(r2, "ok");
  });
});

// ━━━ getLatestRun ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getLatestRun", () => {
  it("returns undefined for empty store", () => {
    const store = createStore();
    assert.equal(getLatestRun(store), undefined);
  });

  it("returns the run with highest id when no filter", () => {
    const store = createStore();
    store.commandRuns.set(1, makeRun(1));
    store.commandRuns.set(3, makeRun(3));
    store.commandRuns.set(2, makeRun(2));
    const latest = getLatestRun(store);
    assert.equal(latest?.id, 3);
  });

  it("filters by single status", () => {
    const store = createStore();
    store.commandRuns.set(1, makeRun(1, { status: "done" }));
    store.commandRuns.set(2, makeRun(2, { status: "running" }));
    store.commandRuns.set(3, makeRun(3, { status: "error" }));
    const latest = getLatestRun(store, "done");
    assert.equal(latest?.id, 1);
  });

  it("filters by array of statuses", () => {
    const store = createStore();
    store.commandRuns.set(1, makeRun(1, { status: "done" }));
    store.commandRuns.set(2, makeRun(2, { status: "running" }));
    store.commandRuns.set(3, makeRun(3, { status: "error" }));
    const latest = getLatestRun(store, ["done", "error"]);
    assert.equal(latest?.id, 3);
  });

  it("returns undefined when no run matches filter", () => {
    const store = createStore();
    store.commandRuns.set(1, makeRun(1, { status: "done" }));
    const result = getLatestRun(store, "running");
    assert.equal(result, undefined);
  });
});

// ━━━ removeRun ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("removeRun", () => {
  it("returns removed:false for non-existent run", () => {
    const store = createStore();
    const result = removeRun(store, 999);
    assert.deepStrictEqual(result, { removed: false, aborted: false });
  });

  it("marks run as removed and clears globalLiveRuns", () => {
    const store = createStore();
    store.commandRuns.set(1, makeRun(1, { status: "done" }));
    store.globalLiveRuns.set(1, {
      runState: store.commandRuns.get(1) as CommandRunState,
      abortController: new AbortController(),
      originSessionFile: "/tmp/s.jsonl",
    });
    const result = removeRun(store, 1, { updateWidget: false });
    assert.equal(result.removed, true);
    assert.equal(result.aborted, false);
    assert.equal(store.commandRuns.get(1)?.removed, true);
    assert.equal(store.globalLiveRuns.has(1), false);
  });

  it("aborts running run with controller on run", () => {
    const store = createStore();
    const ac = new AbortController();
    store.commandRuns.set(1, makeRun(1, { status: "running", abortController: ac }));
    const result = removeRun(store, 1, { updateWidget: false });
    assert.equal(result.aborted, true);
    assert.equal(ac.signal.aborted, true);
    assert.equal(store.commandRuns.get(1)?.abortController, undefined);
  });

  it("aborts running run with controller from globalLiveRuns", () => {
    const store = createStore();
    const ac = new AbortController();
    const run = makeRun(1, { status: "running" });
    store.commandRuns.set(1, run);
    store.globalLiveRuns.set(1, {
      runState: run,
      abortController: ac,
      originSessionFile: "/tmp/s.jsonl",
    });
    const result = removeRun(store, 1, { updateWidget: false });
    assert.equal(result.aborted, true);
    assert.equal(ac.signal.aborted, true);
  });

  it("does not abort when abortIfRunning=false", () => {
    const store = createStore();
    const ac = new AbortController();
    store.commandRuns.set(1, makeRun(1, { status: "running", abortController: ac }));
    const result = removeRun(store, 1, { abortIfRunning: false, updateWidget: false });
    assert.equal(result.aborted, false);
    assert.equal(ac.signal.aborted, false);
  });

  it("persists removal entry via pi.appendEntry", () => {
    const store = createStore();
    const pi = makePi();
    store.commandRuns.set(1, makeRun(1));
    removeRun(store, 1, {
      pi: pi as never,
      persistRemovedEntry: true,
      updateWidget: false,
      removalReason: "user requested",
    });
    assert.equal(pi.appendEntry.mock.callCount(), 1);
    const args = pi.appendEntry.mock.calls[0]?.arguments as unknown as [
      string,
      Record<string, unknown>,
    ];
    const [type, payload] = args;
    assert.equal(type, "subagent-removed");
    assert.equal(payload.runId, 1);
    assert.equal(payload.reason, "user requested");
  });

  it("does not persist when persistRemovedEntry=false", () => {
    const store = createStore();
    const pi = makePi();
    store.commandRuns.set(1, makeRun(1));
    removeRun(store, 1, { pi: pi as never, persistRemovedEntry: false, updateWidget: false });
    assert.equal(pi.appendEntry.mock.callCount(), 0);
  });

  it("uses default reason when aborting without custom reason", () => {
    const store = createStore();
    const ac = new AbortController();
    store.commandRuns.set(1, makeRun(1, { status: "running", abortController: ac }));
    removeRun(store, 1, { updateWidget: false });
    const run = store.commandRuns.get(1) as CommandRunState;
    assert.equal(run.lastLine, "Aborting by remove...");
    assert.equal(run.lastOutput, "Aborting by remove...");
  });

  it("uses custom reason when provided", () => {
    const store = createStore();
    const ac = new AbortController();
    store.commandRuns.set(1, makeRun(1, { status: "running", abortController: ac }));
    removeRun(store, 1, { reason: "Custom abort", updateWidget: false });
    const run = store.commandRuns.get(1) as CommandRunState;
    assert.equal(run.lastLine, "Custom abort");
  });

  it("uses default options (abortIfRunning=true, updateWidget=true) when not specified", () => {
    const store = createStore();
    // Provide a minimal widget ctx so updateWidget doesn't crash
    store.commandWidgetCtx = { hasUI: false };
    const ac = new AbortController();
    store.commandRuns.set(1, makeRun(1, { status: "running", abortController: ac }));
    // Call with no options — defaults apply
    const result = removeRun(store, 1);
    assert.equal(result.removed, true);
    assert.equal(result.aborted, true);
    assert.equal(ac.signal.aborted, true);
  });

  it("handles appendEntry throwing gracefully", () => {
    const store = createStore();
    const pi = {
      sendMessage: () => {
        /* noop */
      },
      appendEntry: () => {
        throw new Error("persist fail");
      },
    };
    store.commandRuns.set(1, makeRun(1));
    // Should not throw
    const result = removeRun(store, 1, { pi: pi as never, updateWidget: false });
    assert.equal(result.removed, true);
  });
});

// ━━━ trimCommandRunHistory ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("trimCommandRunHistory", () => {
  it("does not trim when under maxRuns", () => {
    const store = createStore();
    store.commandRuns.set(1, makeRun(1));
    store.commandRuns.set(2, makeRun(2));
    const removed = trimCommandRunHistory(store, 10);
    assert.deepStrictEqual(removed, []);
  });

  it("trims oldest completed runs when over maxRuns (number form)", () => {
    const store = createStore();
    for (let i = 1; i <= 5; i++) {
      store.commandRuns.set(i, makeRun(i, { status: "done" }));
    }
    const removed = trimCommandRunHistory(store, 3);
    assert.equal(removed.length, 2);
    assert.ok(removed.includes(1));
    assert.ok(removed.includes(2));
  });

  it("trims oldest completed runs when over maxRuns (options form)", () => {
    const store = createStore();
    for (let i = 1; i <= 5; i++) {
      store.commandRuns.set(i, makeRun(i, { status: "done" }));
    }
    const removed = trimCommandRunHistory(store, {
      maxRuns: 3,
      updateWidget: false,
    });
    assert.equal(removed.length, 2);
  });

  it("skips running runs", () => {
    const store = createStore();
    store.commandRuns.set(1, makeRun(1, { status: "done" }));
    store.commandRuns.set(2, makeRun(2, { status: "running" }));
    store.commandRuns.set(3, makeRun(3, { status: "done" }));
    // maxRuns=1 but run #2 is running, so only done runs are candidates
    const removed = trimCommandRunHistory(store, 1);
    // We have 3 active, want 1. Completed candidates are #1 and #3.
    // Trim the 2 oldest completed => #1, #3. But removing them means 1 active (running).
    assert.equal(removed.length, 2);
    assert.ok(removed.includes(1));
    assert.ok(removed.includes(3));
  });

  it("skips already removed runs", () => {
    const store = createStore();
    store.commandRuns.set(1, makeRun(1, { status: "done", removed: true }));
    store.commandRuns.set(2, makeRun(2, { status: "done" }));
    store.commandRuns.set(3, makeRun(3, { status: "done" }));
    // Only 2 active (non-removed), maxRuns=2 => no trim needed
    const removed = trimCommandRunHistory(store, 2);
    assert.deepStrictEqual(removed, []);
  });

  it("skips runs with pending completion", () => {
    const store = createStore();
    store.commandRuns.set(1, makeRun(1, { status: "done" }));
    store.commandRuns.set(2, makeRun(2, { status: "done" }));
    store.commandRuns.set(3, makeRun(3, { status: "done" }));
    store.globalLiveRuns.set(1, {
      runState: store.commandRuns.get(1) as CommandRunState,
      abortController: new AbortController(),
      originSessionFile: "/tmp/s.jsonl",
      pendingCompletion: {
        message: { customType: "test", content: "done", display: true, details: {} },
        options: { deliverAs: "followUp" },
        createdAt: Date.now(),
      },
    });
    // 3 active, maxRuns=1. Run #1 has pendingCompletion, so only #2 and #3 are candidates.
    const removed = trimCommandRunHistory(store, 1);
    assert.equal(removed.length, 2);
    assert.ok(removed.includes(2));
    assert.ok(removed.includes(3));
  });

  it("uses default maxRuns and updateWidget when not specified in options object", () => {
    const store = createStore();
    store.commandWidgetCtx = { hasUI: false };
    for (let i = 1; i <= 15; i++) {
      store.commandRuns.set(i, makeRun(i, { status: "done" }));
    }
    // Call with empty options object — defaults to maxRuns=10, updateWidget=false
    const removed = trimCommandRunHistory(store, {});
    // 15 active, maxRuns=10 → should remove 5
    assert.equal(removed.length, 5);
  });

  it("passes options through to removeRun", () => {
    const store = createStore();
    const pi = makePi();
    for (let i = 1; i <= 3; i++) {
      store.commandRuns.set(i, makeRun(i, { status: "done" }));
    }
    trimCommandRunHistory(store, {
      maxRuns: 1,
      pi: pi as never,
      removalReason: "trimmed",
      updateWidget: false,
    });
    // pi.appendEntry should have been called for each removal
    assert.ok(pi.appendEntry.mock.callCount() >= 2);
  });

  it("updates widget when updateWidget=true and runs removed", () => {
    const store = createStore();
    // Provide a minimal widgetCtx with hasUI=false so widget update is a no-op
    store.commandWidgetCtx = { hasUI: false };
    for (let i = 1; i <= 3; i++) {
      store.commandRuns.set(i, makeRun(i, { status: "done" }));
    }
    // Should not throw even though widget is noop
    const removed = trimCommandRunHistory(store, { maxRuns: 1, updateWidget: true });
    assert.ok(removed.length >= 2);
  });
});

// ━━━ checkForHungRuns ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("checkForHungRuns", () => {
  it("does nothing when store is empty", () => {
    const store = createStore();
    store.commandWidgetCtx = { hasUI: false };
    const pi = makePi();
    checkForHungRuns(store, pi as never);
    assert.equal(pi.sendMessage.mock.callCount(), 0);
  });

  it("does nothing for non-running runs", () => {
    const store = createStore();
    store.commandWidgetCtx = { hasUI: false };
    store.commandRuns.set(1, makeRun(1, { status: "done", lastActivityAt: 1 }));
    const pi = makePi();
    checkForHungRuns(store, pi as never);
    assert.equal(pi.sendMessage.mock.callCount(), 0);
  });

  it("does nothing for running runs within timeout", () => {
    const store = createStore();
    store.commandWidgetCtx = { hasUI: false };
    store.commandRuns.set(1, makeRun(1, { status: "running", lastActivityAt: Date.now() }));
    const pi = makePi();
    checkForHungRuns(store, pi as never);
    assert.equal(pi.sendMessage.mock.callCount(), 0);
  });

  it("aborts hung running run past HANG_TIMEOUT_MS", () => {
    const store = createStore();
    store.commandWidgetCtx = { hasUI: false };
    const ac = new AbortController();
    store.commandRuns.set(
      1,
      makeRun(1, {
        status: "running",
        lastActivityAt: Date.now() - HANG_TIMEOUT_MS - 10_000,
        abortController: ac,
      }),
    );
    const pi = makePi();
    checkForHungRuns(store, pi as never);
    assert.equal(pi.sendMessage.mock.callCount(), 1);
    assert.equal(ac.signal.aborted, true);
    const run = store.commandRuns.get(1) as CommandRunState;
    assert.equal(run.status, "error");
    assert.ok(run.lastLine.startsWith("Auto-aborted:"));
  });

  it("skips already auto-aborted runs", () => {
    const store = createStore();
    store.commandWidgetCtx = { hasUI: false };
    store.commandRuns.set(
      1,
      makeRun(1, {
        status: "running",
        lastActivityAt: Date.now() - HANG_TIMEOUT_MS - 10_000,
        lastLine: "Auto-aborted: already done",
      }),
    );
    const pi = makePi();
    checkForHungRuns(store, pi as never);
    assert.equal(pi.sendMessage.mock.callCount(), 0);
  });

  it("skips runs with no lastActivityAt", () => {
    const store = createStore();
    store.commandWidgetCtx = { hasUI: false };
    store.commandRuns.set(1, makeRun(1, { status: "running", lastActivityAt: 0 }));
    const pi = makePi();
    checkForHungRuns(store, pi as never);
    // lastActivityAt is 0 which is falsy, so it should skip
    assert.equal(pi.sendMessage.mock.callCount(), 0);
  });

  it("checks globalLiveRuns for runs not in commandRuns", () => {
    const store = createStore();
    store.commandWidgetCtx = { hasUI: false };
    const ac = new AbortController();
    const runState = makeRun(99, {
      status: "running",
      lastActivityAt: Date.now() - HANG_TIMEOUT_MS - 5_000,
    });
    store.globalLiveRuns.set(99, {
      runState,
      abortController: ac,
      originSessionFile: "/tmp/s.jsonl",
    });
    const pi = makePi();
    checkForHungRuns(store, pi as never);
    assert.equal(pi.sendMessage.mock.callCount(), 1);
    assert.equal(ac.signal.aborted, true);
    assert.equal(runState.status, "error");
  });

  it("uses controller from globalLiveRuns when run has none", () => {
    const store = createStore();
    store.commandWidgetCtx = { hasUI: false };
    const ac = new AbortController();
    const run = makeRun(1, {
      status: "running",
      lastActivityAt: Date.now() - HANG_TIMEOUT_MS - 5_000,
    });
    store.commandRuns.set(1, run);
    store.globalLiveRuns.set(1, {
      runState: run,
      abortController: ac,
      originSessionFile: "/tmp/s.jsonl",
    });
    const pi = makePi();
    checkForHungRuns(store, pi as never);
    assert.equal(ac.signal.aborted, true);
    assert.equal(run.status, "error");
  });

  it("handles run without any abort controller", () => {
    const store = createStore();
    store.commandWidgetCtx = { hasUI: false };
    store.commandRuns.set(
      1,
      makeRun(1, {
        status: "running",
        lastActivityAt: Date.now() - HANG_TIMEOUT_MS - 5_000,
      }),
    );
    const pi = makePi();
    // Should not throw when no controller is present
    checkForHungRuns(store, pi as never);
    assert.equal(pi.sendMessage.mock.callCount(), 1);
    assert.equal(store.commandRuns.get(1)?.status, "error");
  });
});
