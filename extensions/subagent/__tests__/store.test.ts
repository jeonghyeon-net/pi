import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AssistantMessage, Message } from "@mariozechner/pi-ai";
import {
  collectToolCallCount,
  createStore,
  getDisplayItems,
  getFinalOutput,
  getLastNonEmptyLine,
  getLatestActivityPreview,
  updateRunFromResult,
} from "../core/store.js";
import type { CommandRunState, SingleResult } from "../core/types.js";

function makeAssistantMessage(
  content: Array<
    | { type: "text"; text: string }
    | { type: "thinking"; thinking: string }
    | { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> }
  >,
  overrides: Partial<Message & { role: "assistant" }> = {},
): Message {
  return {
    role: "assistant",
    content: content as AssistantMessage["content"],
    api: "anthropic-messages" as const,
    provider: "anthropic" as const,
    model: "test",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
    ...overrides,
  } as Message;
}

function makeUserMessage(content: string): Message {
  return {
    role: "user",
    content,
    timestamp: Date.now(),
  } as Message;
}

// ━━━ getDisplayItems ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getDisplayItems", () => {
  it("returns empty array for empty messages", () => {
    assert.deepStrictEqual(getDisplayItems([]), []);
  });

  it("extracts text items from assistant message", () => {
    const messages = [makeAssistantMessage([{ type: "text", text: "hello" }])];
    const items = getDisplayItems(messages);
    assert.equal(items.length, 1);
    assert.deepStrictEqual(items[0], { type: "text", text: "hello" });
  });

  it("extracts tool call items from assistant message", () => {
    const messages = [
      makeAssistantMessage([
        { type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } },
      ]),
    ];
    const items = getDisplayItems(messages);
    assert.equal(items.length, 1);
    const firstItem = items[0];
    assert.ok(firstItem);
    assert.equal(firstItem.type, "toolCall");
    if (firstItem.type === "toolCall") {
      assert.equal(firstItem.name, "bash");
      assert.deepStrictEqual(firstItem.args, { command: "ls" });
    }
  });

  it("skips user messages", () => {
    const messages = [
      makeUserMessage("hello"),
      makeAssistantMessage([{ type: "text", text: "hi" }]),
    ];
    const items = getDisplayItems(messages);
    assert.equal(items.length, 1);
  });

  it("extracts multiple items from multiple messages", () => {
    const messages = [
      makeAssistantMessage([
        { type: "text", text: "first" },
        { type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } },
      ]),
      makeAssistantMessage([{ type: "text", text: "second" }]),
    ];
    const items = getDisplayItems(messages);
    assert.equal(items.length, 3);
  });

  it("skips thinking content", () => {
    const messages = [
      makeAssistantMessage([
        { type: "thinking", thinking: "hmm" },
        { type: "text", text: "answer" },
      ]),
    ];
    const items = getDisplayItems(messages);
    assert.equal(items.length, 1);
    assert.deepStrictEqual(items[0], { type: "text", text: "answer" });
  });

  it("skips string content parts in assistant message", () => {
    // Some APIs may include raw string parts in assistant content arrays
    const messages: Message[] = [
      {
        role: "assistant",
        content: [
          "raw string part",
          { type: "text", text: "real text" },
        ] as unknown as AssistantMessage["content"],
        api: "anthropic-messages" as const,
        provider: "anthropic" as const,
        model: "test",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: Date.now(),
      } as Message,
    ];
    const items = getDisplayItems(messages);
    assert.equal(items.length, 1);
    assert.deepStrictEqual(items[0], { type: "text", text: "real text" });
  });
});

// ━━━ getFinalOutput ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getFinalOutput", () => {
  it("returns empty string for empty messages", () => {
    assert.equal(getFinalOutput([]), "");
  });

  it("returns last assistant text", () => {
    const messages = [
      makeAssistantMessage([{ type: "text", text: "first" }]),
      makeAssistantMessage([{ type: "text", text: "last" }]),
    ];
    assert.equal(getFinalOutput(messages), "last");
  });

  it("skips messages without text content", () => {
    const messages = [
      makeAssistantMessage([{ type: "text", text: "real output" }]),
      makeAssistantMessage([
        { type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } },
      ]),
    ];
    assert.equal(getFinalOutput(messages), "real output");
  });

  it("falls back to thinking content if no text", () => {
    const messages = [makeAssistantMessage([{ type: "thinking", thinking: "internal thought" }])];
    assert.equal(getFinalOutput(messages), "internal thought");
  });

  it("prefers text over thinking", () => {
    const messages = [
      makeAssistantMessage([
        { type: "thinking", thinking: "thought" },
        { type: "text", text: "answer" },
      ]),
    ];
    assert.equal(getFinalOutput(messages), "answer");
  });

  it("returns empty string when no assistant messages", () => {
    const messages = [makeUserMessage("hello")];
    assert.equal(getFinalOutput(messages), "");
  });
});

// ━━━ getLastNonEmptyLine ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getLastNonEmptyLine", () => {
  it("returns empty string for empty text", () => {
    assert.equal(getLastNonEmptyLine(""), "");
  });

  it("returns single line", () => {
    assert.equal(getLastNonEmptyLine("hello"), "hello");
  });

  it("returns last non-empty line", () => {
    assert.equal(getLastNonEmptyLine("first\nsecond\n\n"), "second");
  });

  it("trims whitespace from lines", () => {
    assert.equal(getLastNonEmptyLine("  first  \n  second  \n"), "second");
  });

  it("returns empty string for whitespace-only text", () => {
    assert.equal(getLastNonEmptyLine("   \n  \n  "), "");
  });

  it("handles multiline text with trailing content", () => {
    assert.equal(getLastNonEmptyLine("a\nb\nc"), "c");
  });
});

// ━━━ collectToolCallCount ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("collectToolCallCount", () => {
  it("returns 0 for empty messages", () => {
    assert.equal(collectToolCallCount([]), 0);
  });

  it("counts tool calls across messages", () => {
    const messages = [
      makeAssistantMessage([
        { type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } },
        { type: "toolCall", id: "t2", name: "read", arguments: { file_path: "/tmp/x" } },
      ]),
      makeAssistantMessage([
        { type: "text", text: "done" },
        { type: "toolCall", id: "t3", name: "edit", arguments: {} },
      ]),
    ];
    assert.equal(collectToolCallCount(messages), 3);
  });

  it("returns 0 when no tool calls", () => {
    const messages = [makeAssistantMessage([{ type: "text", text: "hello" }])];
    assert.equal(collectToolCallCount(messages), 0);
  });

  it("ignores user messages", () => {
    const messages = [
      makeUserMessage("hello"),
      makeAssistantMessage([
        { type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } },
      ]),
    ];
    assert.equal(collectToolCallCount(messages), 1);
  });
});

// ━━━ createStore ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("createStore", () => {
  it("creates a store with default values", () => {
    const store = createStore();
    assert.ok(store.commandRuns instanceof Map);
    assert.ok(store.globalLiveRuns instanceof Map);
    assert.ok(store.renderedRunWidgetIds instanceof Set);
    assert.equal(store.nextCommandRunId, 1);
    assert.equal(store.commandWidgetCtx, null);
    assert.equal(store.pixelWidgetCtx, null);
    assert.deepStrictEqual(store.sessionStack, []);
    assert.equal(store.switchSessionFn, null);
    assert.equal(store.currentParentSessionFile, null);
    assert.ok(store.sessionRunCache instanceof Map);
    assert.equal(store.currentSessionFile, null);
    assert.ok(store.recentLaunchTimestamps instanceof Map);
    assert.ok(store.batchGroups instanceof Map);
    assert.ok(store.pipelines instanceof Map);
  });
});

// ━━━ getLatestActivityPreview ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getLatestActivityPreview", () => {
  it("returns undefined for empty messages", () => {
    assert.equal(getLatestActivityPreview([]), undefined);
  });

  it("returns tool call preview for last toolCall item", () => {
    const messages = [
      makeAssistantMessage([
        { type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls -la" } },
      ]),
    ];
    const result = getLatestActivityPreview(messages);
    assert.ok(result);
    assert.ok(result.startsWith("→ bash "));
    assert.ok(result.includes("command"));
  });

  it("truncates long tool call args", () => {
    const longArgs: Record<string, unknown> = { data: "x".repeat(100) };
    const messages = [
      makeAssistantMessage([{ type: "toolCall", id: "t1", name: "custom", arguments: longArgs }]),
    ];
    const result = getLatestActivityPreview(messages);
    assert.ok(result);
    assert.ok(result.endsWith("..."));
  });

  it("returns text preview for last text item", () => {
    const messages = [makeAssistantMessage([{ type: "text", text: "Line 1\nLine 2\nLine 3" }])];
    const result = getLatestActivityPreview(messages);
    assert.equal(result, "Line 3");
  });

  it("returns undefined for text item with only empty lines", () => {
    const messages = [makeAssistantMessage([{ type: "text", text: "\n\n" }])];
    const result = getLatestActivityPreview(messages);
    assert.equal(result, undefined);
  });

  it("returns text from last item when mixed", () => {
    const messages = [
      makeAssistantMessage([
        { type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } },
        { type: "text", text: "Done processing" },
      ]),
    ];
    const result = getLatestActivityPreview(messages);
    assert.equal(result, "Done processing");
  });
});

// ━━━ updateRunFromResult ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("updateRunFromResult", () => {
  function makeRunState(overrides: Partial<CommandRunState> = {}): CommandRunState {
    return {
      id: 1,
      agent: "worker",
      task: "test task",
      status: "running",
      startedAt: Date.now() - 5000,
      elapsedMs: 0,
      toolCalls: 0,
      lastLine: "",
      turnCount: 1,
      lastActivityAt: Date.now() - 5000,
      ...overrides,
    };
  }

  function makeResult(overrides: Partial<SingleResult> = {}): SingleResult {
    return {
      agent: "worker",
      agentSource: "project",
      task: "test task",
      exitCode: 0,
      messages: [],
      stderr: "",
      usage: {
        input: 100,
        output: 50,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0.01,
        contextTokens: 200,
        turns: 2,
      },
      ...overrides,
    };
  }

  it("updates elapsedMs, usage, and turnCount from result", () => {
    const state = makeRunState();
    const result = makeResult({
      messages: [makeAssistantMessage([{ type: "text", text: "output" }])],
    });

    updateRunFromResult(state, result);

    assert.ok(state.elapsedMs > 0);
    assert.equal(state.usage, result.usage);
    assert.equal(state.turnCount, 2);
  });

  it("updates model from result", () => {
    const state = makeRunState({ model: "old-model" });
    const result = makeResult({ model: "new-model" });

    updateRunFromResult(state, result);

    assert.equal(state.model, "new-model");
  });

  it("keeps existing model when result.model is undefined", () => {
    const state = makeRunState({ model: "existing-model" });
    const result = makeResult({ model: undefined });

    updateRunFromResult(state, result);

    assert.equal(state.model, "existing-model");
  });

  it("updates lastOutput and lastLine from output text", () => {
    const state = makeRunState();
    const result = makeResult({
      messages: [makeAssistantMessage([{ type: "text", text: "Final output\nLast line here" }])],
    });

    updateRunFromResult(state, result);

    assert.equal(state.lastOutput, "Final output\nLast line here");
    assert.equal(state.lastLine, "Last line here");
  });

  it("updates lastLine from previewLine (toolCall)", () => {
    const state = makeRunState();
    const result = makeResult({
      messages: [
        makeAssistantMessage([
          { type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } },
        ]),
      ],
    });

    updateRunFromResult(state, result);

    assert.ok(state.lastLine.startsWith("→ bash "));
  });

  it("uses liveText for lastLine when no preview from messages", () => {
    const state = makeRunState();
    const result = makeResult({
      messages: [],
      liveText: "Live text line 1\nLive text line 2",
    });

    updateRunFromResult(state, result);

    assert.equal(state.lastLine, "Live text line 2");
  });

  it("falls back to output when liveText has empty lines only", () => {
    // previewLine is falsy (text is whitespace-only → getLatestActivityPreview returns undefined)
    // liveText is truthy but liveLine is empty → falls to else if (output) on line 139
    const state = makeRunState();
    const result = makeResult({
      messages: [makeAssistantMessage([{ type: "text", text: "\n  \n" }])],
      liveText: "\n\n",
    });

    updateRunFromResult(state, result);

    // output = "\n  \n" (truthy), lastLine = getLastNonEmptyLine("\n  \n") = ""
    assert.equal(state.lastOutput, "\n  \n");
    assert.equal(state.lastLine, "");
  });

  it("uses output as lastLine when liveText is empty lines and output has content", () => {
    // Need: previewLine falsy, liveText truthy, liveLine empty, output truthy with content
    const state = makeRunState();
    const result = makeResult({
      messages: [makeAssistantMessage([{ type: "text", text: "\n\nActual output\n\n" }])],
      liveText: "  \n  ",
    });

    updateRunFromResult(state, result);

    // previewLine = getLatestActivityPreview → lastItem is text "\n\nActual output\n\n"
    // → getLastNonEmptyLine returns "Actual output" → previewLine is truthy
    // So this hits the if(previewLine) branch, NOT line 139
    assert.equal(state.lastLine, "Actual output");
  });

  it("falls back to output when no liveText and no preview", () => {
    const state = makeRunState();
    const result = makeResult({
      messages: [makeAssistantMessage([{ type: "thinking", thinking: "only thinking" }])],
    });

    updateRunFromResult(state, result);

    assert.equal(state.lastOutput, "only thinking");
    assert.equal(state.lastLine, "only thinking");
  });

  it("uses Math.max for toolCalls with liveToolCalls", () => {
    const state = makeRunState();
    const result = makeResult({
      messages: [
        makeAssistantMessage([
          { type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } },
        ]),
      ],
      liveToolCalls: 5,
    });

    updateRunFromResult(state, result);

    assert.equal(state.toolCalls, 5);
  });

  it("stores thoughtText from result", () => {
    const state = makeRunState();
    const result = makeResult({ thoughtText: "I am thinking..." });

    updateRunFromResult(state, result);

    assert.equal(state.thoughtText, "I am thinking...");
  });

  it("updates lastActivityAt when toolCalls change", () => {
    const oldActivityAt = Date.now() - 10000;
    const state = makeRunState({ lastActivityAt: oldActivityAt, toolCalls: 0 });
    const result = makeResult({
      messages: [
        makeAssistantMessage([
          { type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } },
        ]),
      ],
    });

    updateRunFromResult(state, result);

    assert.ok(state.lastActivityAt > oldActivityAt);
  });

  it("updates lastActivityAt when turnCount changes", () => {
    const oldActivityAt = Date.now() - 10000;
    const state = makeRunState({ lastActivityAt: oldActivityAt, turnCount: 1 });
    const result = makeResult({
      usage: {
        input: 100,
        output: 50,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0.01,
        contextTokens: 200,
        turns: 3,
      },
    });

    updateRunFromResult(state, result);

    assert.ok(state.lastActivityAt > oldActivityAt);
  });

  it("does not update lastActivityAt when nothing changes", () => {
    const state = makeRunState({
      toolCalls: 0,
      turnCount: 2,
      lastLine: "",
    });
    const oldActivityAt = state.lastActivityAt;
    const result = makeResult({
      messages: [],
      usage: {
        input: 100,
        output: 50,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0.01,
        contextTokens: 200,
        turns: 2,
      },
    });

    updateRunFromResult(state, result);

    assert.equal(state.lastActivityAt, oldActivityAt);
  });
});
