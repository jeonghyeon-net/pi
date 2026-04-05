import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  notifyHookCount,
  notifyOnceForParseError,
  notifySessionStartHookResult,
} from "../core/notify.js";
import type { ClaudeSettings, HookExecResult, LoadedSettings } from "../core/types.js";

type NotifyCall = { message: string; type: "info" | "warning" | "error" | undefined };

interface Collector {
  calls: NotifyCall[];
  ctx: ExtensionContext;
}

function makeCollectingCtx(hasUI: boolean): Collector {
  const calls: NotifyCall[] = [];
  const ctx = {
    hasUI,
    ui: {
      notify: (message: string, type?: "info" | "warning" | "error") => {
        calls.push({ message, type });
      },
    },
  } as unknown as ExtensionContext;
  return { calls, ctx };
}

function requireCall(calls: NotifyCall[], index: number): NotifyCall {
  const call = calls[index];
  if (!call) {
    throw new Error(`expected call at index ${index}, got ${calls.length} calls total`);
  }
  return call;
}

// ━━━ notifyOnceForParseError ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("notifyOnceForParseError", () => {
  let counter = 0;

  function uniquePath(): string {
    counter += 1;
    return `/tmp/notify-test-${process.pid}-${counter}-${Date.now()}.json`;
  }

  it("does nothing when parseError is absent", () => {
    const { calls, ctx } = makeCollectingCtx(true);
    const loaded: LoadedSettings = { path: uniquePath(), settings: null };
    notifyOnceForParseError(ctx, loaded);
    assert.equal(calls.length, 0);
  });

  it("does nothing when hasUI is false even with parseError", () => {
    const { calls, ctx } = makeCollectingCtx(false);
    const loaded: LoadedSettings = {
      path: uniquePath(),
      settings: null,
      parseError: "boom",
    };
    notifyOnceForParseError(ctx, loaded);
    assert.equal(calls.length, 0);
  });

  it("notifies the first time with warning type and message prefix", () => {
    const { calls, ctx } = makeCollectingCtx(true);
    const loaded: LoadedSettings = {
      path: uniquePath(),
      settings: null,
      parseError: "bad JSON at line 3",
    };
    notifyOnceForParseError(ctx, loaded);
    assert.equal(calls.length, 1);
    const call = requireCall(calls, 0);
    assert.equal(call.type, "warning");
    assert.ok(call.message.includes("[claude-hooks-bridge]"));
    assert.ok(call.message.includes("bad JSON at line 3"));
  });

  it("notifies only once per unique path", () => {
    const { calls, ctx } = makeCollectingCtx(true);
    const loaded: LoadedSettings = {
      path: uniquePath(),
      settings: null,
      parseError: "err",
    };
    notifyOnceForParseError(ctx, loaded);
    notifyOnceForParseError(ctx, loaded);
    notifyOnceForParseError(ctx, loaded);
    assert.equal(calls.length, 1);
  });

  it("notifies again for different paths", () => {
    const { calls, ctx } = makeCollectingCtx(true);
    const p1 = uniquePath();
    const p2 = uniquePath();
    notifyOnceForParseError(ctx, { path: p1, settings: null, parseError: "a" });
    notifyOnceForParseError(ctx, { path: p2, settings: null, parseError: "b" });
    assert.equal(calls.length, 2);
  });
});

// ━━━ notifyHookCount ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("notifyHookCount", () => {
  it("does nothing when settings is null", () => {
    const { calls, ctx } = makeCollectingCtx(true);
    notifyHookCount(ctx, null);
    assert.equal(calls.length, 0);
  });

  it("does nothing when hasUI is false", () => {
    const { calls, ctx } = makeCollectingCtx(false);
    const settings: ClaudeSettings = {
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] }],
      },
    };
    notifyHookCount(ctx, settings);
    assert.equal(calls.length, 0);
  });

  it("does nothing when total hook count is zero", () => {
    const { calls, ctx } = makeCollectingCtx(true);
    const settings: ClaudeSettings = { hooks: {} };
    notifyHookCount(ctx, settings);
    assert.equal(calls.length, 0);
  });

  it("notifies with info type when one or more hooks exist", () => {
    const { calls, ctx } = makeCollectingCtx(true);
    const settings: ClaudeSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              { type: "command", command: "echo 1" },
              { type: "command", command: "echo 2" },
            ],
          },
        ],
        PostToolUse: [{ matcher: "", hooks: [{ type: "command", command: "echo 3" }] }],
      },
    };
    notifyHookCount(ctx, settings);
    assert.equal(calls.length, 1);
    const call = requireCall(calls, 0);
    assert.equal(call.type, "info");
    assert.ok(call.message.includes("3 hook"));
    assert.ok(call.message.includes(".claude/settings.json"));
  });
});

// ━━━ notifySessionStartHookResult ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("notifySessionStartHookResult", () => {
  function makeResult(overrides: Partial<HookExecResult>): HookExecResult {
    return {
      command: "echo",
      code: 0,
      stdout: "",
      stderr: "",
      timedOut: false,
      json: null,
      ...overrides,
    };
  }

  it("does nothing when hasUI is false", () => {
    const { calls, ctx } = makeCollectingCtx(false);
    notifySessionStartHookResult(ctx, makeResult({ stdout: "hello", stderr: "oops" }));
    assert.equal(calls.length, 0);
  });

  it("emits an info notification for stdout only", () => {
    const { calls, ctx } = makeCollectingCtx(true);
    notifySessionStartHookResult(ctx, makeResult({ stdout: "hello world\n" }));
    assert.equal(calls.length, 1);
    const call = requireCall(calls, 0);
    assert.equal(call.type, "info");
    assert.ok(call.message.includes("SessionStart]"));
    assert.ok(call.message.includes("hello world"));
  });

  it("emits a warning notification for stderr only", () => {
    const { calls, ctx } = makeCollectingCtx(true);
    notifySessionStartHookResult(ctx, makeResult({ stderr: "oh no\n" }));
    assert.equal(calls.length, 1);
    const call = requireCall(calls, 0);
    assert.equal(call.type, "warning");
    assert.ok(call.message.includes("stderr"));
    assert.ok(call.message.includes("oh no"));
  });

  it("emits both info and warning when both stdout and stderr are present", () => {
    const { calls, ctx } = makeCollectingCtx(true);
    notifySessionStartHookResult(ctx, makeResult({ stdout: "out", stderr: "err" }));
    assert.equal(calls.length, 2);
    assert.equal(requireCall(calls, 0).type, "info");
    assert.equal(requireCall(calls, 1).type, "warning");
  });

  it("does nothing when both stdout and stderr are blank or whitespace", () => {
    const { calls, ctx } = makeCollectingCtx(true);
    notifySessionStartHookResult(ctx, makeResult({ stdout: "   \n", stderr: "\t" }));
    assert.equal(calls.length, 0);
  });

  it("truncates output longer than 1200 characters with ellipsis", () => {
    const { calls, ctx } = makeCollectingCtx(true);
    const longOut = "a".repeat(2000);
    notifySessionStartHookResult(ctx, makeResult({ stdout: longOut }));
    assert.equal(calls.length, 1);
    const call = requireCall(calls, 0);
    assert.ok(call.message.endsWith("..."));
    const body = call.message.split("\n")[1];
    assert.ok(body);
    assert.equal(body.length, 1203); // 1200 'a' + '...'
  });

  it("does not truncate output at or below 1200 characters", () => {
    const { calls, ctx } = makeCollectingCtx(true);
    const out = "b".repeat(1200);
    notifySessionStartHookResult(ctx, makeResult({ stdout: out }));
    assert.equal(calls.length, 1);
    const call = requireCall(calls, 0);
    assert.ok(!call.message.endsWith("..."));
  });
});
