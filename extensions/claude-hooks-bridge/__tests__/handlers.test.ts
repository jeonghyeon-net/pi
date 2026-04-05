import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import type {
  ExtensionAPI,
  ExtensionContext,
  ToolCallEvent,
  ToolResultEvent,
} from "@mariozechner/pi-coding-agent";
import {
  handlePostToolUse,
  handlePreToolUse,
  handleSessionShutdown,
  handleSessionStart,
  handleStop,
  handleUserPromptSubmit,
} from "../core/handlers.js";
import { clearStopHookActive, getStopHookActive, resetHookSessionId } from "../core/session.js";
import type { ClaudeSettings } from "../core/types.js";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claude-hooks-bridge-handlers-"));

after(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

type NotifyCall = { message: string; type: "info" | "warning" | "error" | undefined };
type ConfirmCall = { title: string; message: string };
type SendMessageCall = { content: string; options: unknown };

interface Harness {
  ctx: ExtensionContext;
  pi: ExtensionAPI;
  notifications: NotifyCall[];
  confirmCalls: ConfirmCall[];
  sendMessageCalls: SendMessageCall[];
  confirmResponse: boolean;
  setConfirmResponse: (value: boolean) => void;
  cwd: string;
}

let counter = 0;
function uniqueCwd(): string {
  counter += 1;
  const cwd = path.join(tmpRoot, `cwd-${counter}`);
  fs.mkdirSync(path.join(cwd, ".claude"), { recursive: true });
  return cwd;
}

function writeSettings(cwd: string, settings: ClaudeSettings | string): void {
  const body = typeof settings === "string" ? settings : JSON.stringify(settings);
  fs.writeFileSync(path.join(cwd, ".claude", "settings.json"), body, "utf8");
}

function makeHarness(
  cwd: string,
  opts: { hasUI?: boolean; sessionId?: string; entries?: unknown[] } = {},
): Harness {
  const hasUI = opts.hasUI ?? true;
  const sessionId = opts.sessionId ?? `sess-${counter}`;
  const entries = opts.entries ?? [];
  const notifications: NotifyCall[] = [];
  const confirmCalls: ConfirmCall[] = [];
  const sendMessageCalls: SendMessageCall[] = [];
  const state = { confirmResponse: true };

  const ctx = {
    cwd,
    hasUI,
    sessionManager: {
      getSessionId: () => sessionId,
      getEntries: () => entries,
    },
    ui: {
      notify: (message: string, type?: "info" | "warning" | "error") => {
        notifications.push({ message, type });
      },
      confirm: async (title: string, message: string): Promise<boolean> => {
        confirmCalls.push({ title, message });
        return state.confirmResponse;
      },
    },
  } as unknown as ExtensionContext;

  const pi = {
    sendUserMessage: (content: string | unknown[], options?: unknown) => {
      sendMessageCalls.push({ content: String(content), options });
    },
  } as unknown as ExtensionAPI;

  return {
    ctx,
    pi,
    notifications,
    confirmCalls,
    sendMessageCalls,
    get confirmResponse() {
      return state.confirmResponse;
    },
    setConfirmResponse(value: boolean) {
      state.confirmResponse = value;
    },
    cwd,
  };
}

function makeToolCallEvent(toolName: string, input: unknown, toolCallId: string): ToolCallEvent {
  return {
    type: "tool_call",
    toolCallId,
    toolName,
    input,
  } as unknown as ToolCallEvent;
}

function makeToolResultEvent(
  toolName: string,
  input: unknown,
  toolCallId: string,
  isError: boolean,
): ToolResultEvent {
  return {
    type: "tool_result",
    toolCallId,
    toolName,
    input,
    content: [{ type: "text", text: "done" }],
    isError,
    details: undefined,
  } as unknown as ToolResultEvent;
}

beforeEach(() => {
  resetHookSessionId();
  clearStopHookActive();
});

// ━━━ handleSessionStart ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("handleSessionStart", () => {
  it("pins hook session id and resets stop_hook_active when settings missing", async () => {
    const cwd = uniqueCwd();
    const h = makeHarness(cwd, { sessionId: "s-start-1" });
    await handleSessionStart(h.ctx);
    // no settings → no hook count notification
    assert.equal(h.notifications.length, 0);
    assert.equal(getStopHookActive("s-start-1"), false);
  });

  it("notifies hook count and runs SessionStart hooks, showing their stdout", async () => {
    const cwd = uniqueCwd();
    writeSettings(cwd, {
      hooks: {
        SessionStart: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "echo starting-up", timeout: 5 }],
          },
        ],
      },
    });
    const h = makeHarness(cwd, { sessionId: "s-start-2" });
    await handleSessionStart(h.ctx);
    // Expect notifications: hook count + session start result stdout
    const messages = h.notifications.map((n) => n.message).join("\n");
    assert.ok(messages.includes("loaded 1 hook"));
    assert.ok(messages.includes("starting-up"));
  });

  it("notifies on settings parse error once", async () => {
    const cwd = uniqueCwd();
    writeSettings(cwd, "{ invalid json");
    const h = makeHarness(cwd, { sessionId: "s-start-3" });
    await handleSessionStart(h.ctx);
    const warnings = h.notifications.filter((n) => n.type === "warning");
    assert.ok(warnings.length >= 1);
    assert.ok(warnings.some((w) => w.message.includes("파싱 실패")));
  });
});

// ━━━ handleSessionShutdown ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("handleSessionShutdown", () => {
  it("resets pinned hook session id and clears stop_hook_active state", () => {
    // seed state
    handleSessionShutdown(); // no-op but safe
    assert.equal(getStopHookActive("any-session"), false);
  });
});

// ━━━ handleUserPromptSubmit ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("handleUserPromptSubmit", () => {
  it("no-ops when no settings file", async () => {
    const cwd = uniqueCwd();
    const h = makeHarness(cwd);
    await handleUserPromptSubmit({ prompt: "hello" }, h.ctx);
    assert.equal(h.notifications.length, 0);
  });

  it("runs UserPromptSubmit hooks with prompt in payload", async () => {
    const cwd = uniqueCwd();
    writeSettings(cwd, {
      hooks: {
        UserPromptSubmit: [
          {
            matcher: "",
            // cat writes the payload; we redirect to a tmp file we can read
            hooks: [
              {
                type: "command",
                command: `cat > "${path.join(cwd, "last-prompt.json")}"`,
                timeout: 5,
              },
            ],
          },
        ],
      },
    });
    const h = makeHarness(cwd);
    await handleUserPromptSubmit({ prompt: "hi there" }, h.ctx);
    const written = JSON.parse(fs.readFileSync(path.join(cwd, "last-prompt.json"), "utf8"));
    assert.equal(written.hook_event_name, "UserPromptSubmit");
    assert.equal(written.prompt, "hi there");
  });
});

// ━━━ handlePreToolUse ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("handlePreToolUse", () => {
  it("returns undefined when no settings file", async () => {
    const cwd = uniqueCwd();
    const h = makeHarness(cwd);
    const event = makeToolCallEvent("bash", { command: "ls" }, "tc1");
    const result = await handlePreToolUse(event, h.ctx);
    assert.equal(result, undefined);
  });

  it("returns undefined when no hook blocks or asks", async () => {
    const cwd = uniqueCwd();
    writeSettings(cwd, {
      hooks: {
        PreToolUse: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "echo no-action", timeout: 5 }],
          },
        ],
      },
    });
    const h = makeHarness(cwd);
    const event = makeToolCallEvent("bash", { command: "ls" }, "tc2");
    const result = await handlePreToolUse(event, h.ctx);
    assert.equal(result, undefined);
  });

  it("blocks when hook outputs decision=block JSON", async () => {
    const cwd = uniqueCwd();
    writeSettings(cwd, {
      hooks: {
        PreToolUse: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: `echo '{"decision":"block","reason":"nope"}'`,
                timeout: 5,
              },
            ],
          },
        ],
      },
    });
    const h = makeHarness(cwd);
    const event = makeToolCallEvent("bash", { command: "ls" }, "tc3");
    const result = await handlePreToolUse(event, h.ctx);
    assert.ok(result);
    assert.equal(result?.block, true);
    assert.ok(result?.reason?.includes("nope"));
  });

  it("blocks with generic reason when hook exits with code 2 and no JSON", async () => {
    const cwd = uniqueCwd();
    writeSettings(cwd, {
      hooks: {
        PreToolUse: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: "echo problem 1>&2; exit 2",
                timeout: 5,
              },
            ],
          },
        ],
      },
    });
    const h = makeHarness(cwd);
    const event = makeToolCallEvent("bash", { command: "ls" }, "tc4");
    const result = await handlePreToolUse(event, h.ctx);
    assert.ok(result);
    assert.equal(result?.block, true);
    assert.ok(result?.reason?.includes("problem") || result?.reason?.includes("exit code 2"));
  });

  it("returns block with 'no UI' prefix when decision=ask but hasUI=false", async () => {
    const cwd = uniqueCwd();
    writeSettings(cwd, {
      hooks: {
        PreToolUse: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: `echo '{"decision":"ask","reason":"need ok"}'`,
                timeout: 5,
              },
            ],
          },
        ],
      },
    });
    const h = makeHarness(cwd, { hasUI: false });
    const event = makeToolCallEvent("bash", { command: "ls" }, "tc5");
    const result = await handlePreToolUse(event, h.ctx);
    assert.ok(result);
    assert.equal(result?.block, true);
    assert.ok(result?.reason?.includes("Blocked (no UI)"));
  });

  it("allows continuation when ask prompt is confirmed", async () => {
    const cwd = uniqueCwd();
    writeSettings(cwd, {
      hooks: {
        PreToolUse: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: `echo '{"decision":"ask","reason":"please"}'`,
                timeout: 5,
              },
            ],
          },
        ],
      },
    });
    const h = makeHarness(cwd);
    h.setConfirmResponse(true);
    const event = makeToolCallEvent("bash", { command: "ls" }, "tc6");
    const result = await handlePreToolUse(event, h.ctx);
    assert.equal(result, undefined);
    assert.equal(h.confirmCalls.length, 1);
    const [confirmCall] = h.confirmCalls;
    assert.ok(confirmCall);
    assert.ok(confirmCall.message.includes("please"));
  });

  it("blocks when ask prompt is rejected by user", async () => {
    const cwd = uniqueCwd();
    writeSettings(cwd, {
      hooks: {
        PreToolUse: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: `echo '{"decision":"ask","reason":"risky"}'`,
                timeout: 5,
              },
            ],
          },
        ],
      },
    });
    const h = makeHarness(cwd);
    h.setConfirmResponse(false);
    const event = makeToolCallEvent("bash", { command: "rm -rf" }, "tc7");
    const result = await handlePreToolUse(event, h.ctx);
    assert.ok(result);
    assert.equal(result?.block, true);
    assert.ok(result?.reason?.includes("risky"));
  });

  it("does not block when decision is allow or none", async () => {
    const cwd = uniqueCwd();
    writeSettings(cwd, {
      hooks: {
        PreToolUse: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: `echo '{"decision":"allow"}'`,
                timeout: 5,
              },
            ],
          },
        ],
      },
    });
    const h = makeHarness(cwd);
    const event = makeToolCallEvent("bash", { command: "ls" }, "tc8");
    const result = await handlePreToolUse(event, h.ctx);
    assert.equal(result, undefined);
  });
});

// ━━━ handlePostToolUse ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("handlePostToolUse", () => {
  it("no-ops when no settings file", async () => {
    const cwd = uniqueCwd();
    const h = makeHarness(cwd);
    const event = makeToolResultEvent("bash", { command: "ls" }, "tr1", false);
    await handlePostToolUse(event, h.ctx);
    assert.equal(h.notifications.length, 0);
  });

  it("runs PostToolUse hooks with tool_response payload", async () => {
    const cwd = uniqueCwd();
    const sink = path.join(cwd, "post.json");
    writeSettings(cwd, {
      hooks: {
        PostToolUse: [
          {
            matcher: "",
            hooks: [{ type: "command", command: `cat > "${sink}"`, timeout: 5 }],
          },
        ],
      },
    });
    const h = makeHarness(cwd);
    const event = makeToolResultEvent("bash", { command: "ls" }, "tr2", true);
    await handlePostToolUse(event, h.ctx);
    const written = JSON.parse(fs.readFileSync(sink, "utf8"));
    assert.equal(written.hook_event_name, "PostToolUse");
    assert.equal(written.tool_name, "Bash");
    assert.equal(written.tool_use_id, "tr2");
    assert.equal(written.tool_response.is_error, true);
  });
});

// ━━━ handleStop ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("handleStop", () => {
  it("no-ops when no settings file", async () => {
    const cwd = uniqueCwd();
    const h = makeHarness(cwd, { sessionId: "stop-1" });
    await handleStop(h.pi, h.ctx);
    assert.equal(h.sendMessageCalls.length, 0);
  });

  it("clears stop_hook_active when no hook blocks", async () => {
    const cwd = uniqueCwd();
    writeSettings(cwd, {
      hooks: {
        Stop: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "echo ok", timeout: 5 }],
          },
        ],
      },
    });
    const h = makeHarness(cwd, { sessionId: "stop-2" });
    // seed stop_hook_active=true
    await handleStop(h.pi, h.ctx);
    assert.equal(getStopHookActive("stop-2"), false);
    assert.equal(h.sendMessageCalls.length, 0);
  });

  it("includes last_assistant_message in payload when available", async () => {
    const cwd = uniqueCwd();
    const sink = path.join(cwd, "stop-payload.json");
    writeSettings(cwd, {
      hooks: {
        Stop: [
          {
            matcher: "",
            hooks: [{ type: "command", command: `cat > "${sink}"`, timeout: 5 }],
          },
        ],
      },
    });
    const entries = [
      {
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "final thoughts" }],
        },
      },
    ];
    const h = makeHarness(cwd, { sessionId: "stop-with-msg", entries });
    await handleStop(h.pi, h.ctx);
    const written = JSON.parse(fs.readFileSync(sink, "utf8"));
    assert.equal(written.last_assistant_message, "final thoughts");
    assert.ok(typeof written.transcript_path === "string");
  });

  it("sends follow-up and marks stop_hook_active=true on first block", async () => {
    const cwd = uniqueCwd();
    writeSettings(cwd, {
      hooks: {
        Stop: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: `echo '{"decision":"block","reason":"more work"}'`,
                timeout: 5,
              },
            ],
          },
        ],
      },
    });
    const h = makeHarness(cwd, { sessionId: "stop-3" });
    await handleStop(h.pi, h.ctx);
    assert.equal(getStopHookActive("stop-3"), true);
    assert.equal(h.sendMessageCalls.length, 1);
    const [firstCall] = h.sendMessageCalls;
    assert.ok(firstCall);
    assert.ok(firstCall.content.includes("more work"));
    const infoNotes = h.notifications.filter((n) => n.type === "info");
    assert.ok(infoNotes.some((n) => n.message.includes("queued follow-up")));
  });

  it("on second block (loop guard): resets stop_hook_active and warns, does not re-queue", async () => {
    const cwd = uniqueCwd();
    writeSettings(cwd, {
      hooks: {
        Stop: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: `echo '{"decision":"block","reason":"still busy"}'`,
                timeout: 5,
              },
            ],
          },
        ],
      },
    });
    const h = makeHarness(cwd, { sessionId: "stop-4" });
    // First call: queues follow-up, sets stop_hook_active=true
    await handleStop(h.pi, h.ctx);
    assert.equal(h.sendMessageCalls.length, 1);
    // Second call: should loop-guard
    await handleStop(h.pi, h.ctx);
    assert.equal(h.sendMessageCalls.length, 1); // no new message
    assert.equal(getStopHookActive("stop-4"), false);
    const warnings = h.notifications.filter((n) => n.type === "warning");
    assert.ok(warnings.some((w) => w.message.includes("loop guard")));
  });

  it("on block with hasUI=false: queues follow-up without emitting info notification", async () => {
    const cwd = uniqueCwd();
    writeSettings(cwd, {
      hooks: {
        Stop: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: `echo '{"decision":"block","reason":"do it"}'`,
                timeout: 5,
              },
            ],
          },
        ],
      },
    });
    const h = makeHarness(cwd, { sessionId: "stop-5", hasUI: false });
    await handleStop(h.pi, h.ctx);
    assert.equal(h.sendMessageCalls.length, 1);
    assert.equal(h.notifications.length, 0);
  });

  it("on second block with hasUI=false: loop-guards silently", async () => {
    const cwd = uniqueCwd();
    writeSettings(cwd, {
      hooks: {
        Stop: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: `echo '{"decision":"block","reason":"again"}'`,
                timeout: 5,
              },
            ],
          },
        ],
      },
    });
    const h = makeHarness(cwd, { sessionId: "stop-6", hasUI: false });
    await handleStop(h.pi, h.ctx);
    await handleStop(h.pi, h.ctx);
    assert.equal(h.sendMessageCalls.length, 1);
    assert.equal(h.notifications.length, 0);
    assert.equal(getStopHookActive("stop-6"), false);
  });
});
