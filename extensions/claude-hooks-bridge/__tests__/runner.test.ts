import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type {
  ExtensionContext,
  ToolCallEvent,
  ToolResultEvent,
} from "@mariozechner/pi-coding-agent";
import {
  buildPostToolUsePayload,
  buildPreToolUsePayload,
  makeBasePayload,
  runHooks,
} from "../core/runner.js";
import { resetHookSessionId } from "../core/session.js";
import type { ClaudeSettings, JsonRecord } from "../core/types.js";

function makeCtx(sessionId: string, cwd = process.cwd()): ExtensionContext {
  return {
    cwd,
    sessionManager: {
      getSessionId: () => sessionId,
    },
  } as unknown as ExtensionContext;
}

// ━━━ makeBasePayload ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("makeBasePayload", () => {
  beforeEach(() => resetHookSessionId());

  it("includes hook_event_name, session_id, and cwd", () => {
    const ctx = makeCtx("sess-1", "/my/project");
    const payload = makeBasePayload("PreToolUse", ctx);
    assert.equal(payload.hook_event_name, "PreToolUse");
    assert.equal(payload.session_id, "sess-1");
    assert.equal(payload.cwd, "/my/project");
  });

  it("uses 'unknown' session id when sessionManager returns empty", () => {
    const ctx = makeCtx("");
    const payload = makeBasePayload("SessionStart", ctx);
    assert.equal(payload.session_id, "unknown");
  });
});

// ━━━ buildPreToolUsePayload ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildPreToolUsePayload", () => {
  beforeEach(() => resetHookSessionId());

  it("returns base payload plus canonical tool name, normalized input, and tool_use_id", () => {
    const ctx = makeCtx("sess-2", "/work");
    const event = {
      type: "tool_call",
      toolCallId: "tc_123",
      toolName: "bash",
      input: { command: "ls -la" },
    } as unknown as ToolCallEvent;
    const payload = buildPreToolUsePayload(event, ctx);
    assert.equal(payload.hook_event_name, "PreToolUse");
    assert.equal(payload.session_id, "sess-2");
    assert.equal(payload.cwd, "/work");
    assert.equal(payload.tool_name, "Bash"); // aliased
    assert.equal(payload.tool_use_id, "tc_123");
    assert.ok(payload.tool_input);
  });

  it("passes unknown tool names through unchanged", () => {
    const ctx = makeCtx("sess-3");
    const event = {
      type: "tool_call",
      toolCallId: "tc_xyz",
      toolName: "my_custom_tool",
      input: { x: 1 },
    } as unknown as ToolCallEvent;
    const payload = buildPreToolUsePayload(event, ctx);
    assert.equal(payload.tool_name, "my_custom_tool");
  });
});

// ━━━ buildPostToolUsePayload ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildPostToolUsePayload", () => {
  beforeEach(() => resetHookSessionId());

  it("includes tool_response with is_error=false when event.isError is falsy", () => {
    const ctx = makeCtx("sess-4");
    const event = {
      type: "tool_result",
      toolCallId: "tc_ok",
      toolName: "bash",
      input: { command: "pwd" },
      content: [{ type: "text", text: "ok" }],
      isError: false,
      details: { exitCode: 0 },
    } as unknown as ToolResultEvent;
    const payload = buildPostToolUsePayload(event, ctx);
    assert.equal(payload.hook_event_name, "PostToolUse");
    assert.equal(payload.tool_name, "Bash");
    assert.equal(payload.tool_use_id, "tc_ok");
    const response = payload.tool_response as JsonRecord;
    assert.equal(response.is_error, false);
    assert.deepEqual(response.content, [{ type: "text", text: "ok" }]);
    assert.deepEqual(response.details, { exitCode: 0 });
  });

  it("sets is_error=true when event.isError is true", () => {
    const ctx = makeCtx("sess-5");
    const event = {
      type: "tool_result",
      toolCallId: "tc_err",
      toolName: "read",
      input: { path: "/no" },
      content: [{ type: "text", text: "fail" }],
      isError: true,
      details: undefined,
    } as unknown as ToolResultEvent;
    const payload = buildPostToolUsePayload(event, ctx);
    const response = payload.tool_response as JsonRecord;
    assert.equal(response.is_error, true);
  });

  it("coerces truthy non-boolean isError to true", () => {
    const ctx = makeCtx("sess-6");
    const event = {
      type: "tool_result",
      toolCallId: "tc_coerce",
      toolName: "edit",
      input: {},
      content: [],
      isError: 1,
      details: undefined,
    } as unknown as ToolResultEvent;
    const payload = buildPostToolUsePayload(event, ctx);
    const response = payload.tool_response as JsonRecord;
    assert.equal(response.is_error, true);
  });
});

// ━━━ runHooks ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runHooks", () => {
  beforeEach(() => resetHookSessionId());

  it("returns empty array when no hooks match", async () => {
    const ctx = makeCtx("sess-r1");
    const results = await runHooks(null, "PreToolUse", ctx, {});
    assert.deepEqual(results, []);
  });

  it("returns empty array when settings has no matching event", async () => {
    const ctx = makeCtx("sess-r2");
    const settings: ClaudeSettings = { hooks: {} };
    const results = await runHooks(settings, "PreToolUse", ctx, {});
    assert.deepEqual(results, []);
  });

  it("executes command hooks and collects their results", async () => {
    const ctx = makeCtx("sess-r3");
    const settings: ClaudeSettings = {
      hooks: {
        UserPromptSubmit: [
          {
            matcher: "",
            hooks: [
              { type: "command", command: "echo first", timeout: 10 },
              { type: "command", command: "echo second", timeout: 10 },
            ],
          },
        ],
      },
    };
    const results = await runHooks(settings, "UserPromptSubmit", ctx, { x: 1 });
    assert.equal(results.length, 2);
    const [first, second] = results;
    assert.ok(first);
    assert.ok(second);
    assert.ok(first.stdout.includes("first"));
    assert.ok(second.stdout.includes("second"));
    assert.equal(first.code, 0);
    assert.equal(second.code, 0);
  });

  it("passes the matcher to filter hooks by tool name", async () => {
    const ctx = makeCtx("sess-r4");
    const settings: ClaudeSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: "echo bash-hit", timeout: 10 }],
          },
          {
            matcher: "Read",
            hooks: [{ type: "command", command: "echo read-hit", timeout: 10 }],
          },
        ],
      },
    };
    const results = await runHooks(settings, "PreToolUse", ctx, {}, "bash");
    assert.equal(results.length, 1);
    const [first] = results;
    assert.ok(first);
    assert.ok(first.stdout.includes("bash-hit"));
  });

  it("skips hooks filtered out by getCommandHooks (empty command, wrong type)", async () => {
    const ctx = makeCtx("sess-r5");
    const settings = {
      hooks: {
        UserPromptSubmit: [
          {
            matcher: "",
            hooks: [
              { type: "command", command: "" }, // empty → filtered
              { type: "webhook", command: "echo dropped" }, // wrong type → filtered
              { type: "command", command: "echo keeper", timeout: 10 },
            ],
          },
        ],
      },
    } as ClaudeSettings;
    const results = await runHooks(settings, "UserPromptSubmit", ctx, {});
    assert.equal(results.length, 1);
    const [first] = results;
    assert.ok(first);
    assert.ok(first.stdout.includes("keeper"));
  });
});
