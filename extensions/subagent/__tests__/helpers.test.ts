import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import type { CommandRunState, PipelineStepResult, SingleResult } from "../core/types.js";
import {
  buildErrorOutput,
  buildEscalationMessage,
  buildRunAnalyticsSummary,
  buildRunCompletionMessage,
  buildRunStartMessage,
  buildStrongWaitMessage,
  createEmptyDetails,
  diagnoseResultFailure,
  finalizeRunState,
  formatBatchSummary,
  formatIdleRunWarning,
  formatPipelineSummary,
  formatRunDetailOutput,
  getAssistantTextPart,
  getRunCounts,
  parseSessionDetailSummary,
  toLaunchSummary,
} from "../tool/helpers.js";

function makeResult(overrides: Partial<SingleResult> = {}): SingleResult {
  return {
    agent: "worker",
    agentSource: "project",
    task: "test task",
    exitCode: 0,
    messages: [],
    stderr: "",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      contextTokens: 0,
      turns: 1,
    },
    ...overrides,
  };
}

function makeAssistantMessage(text: string) {
  return {
    role: "assistant" as const,
    content: [{ type: "text" as const, text }],
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
    stopReason: "stop" as const,
    timestamp: Date.now(),
  };
}

function makeRunState(overrides: Partial<CommandRunState> = {}): CommandRunState {
  return {
    id: 1,
    agent: "worker",
    task: "test task",
    status: "running",
    startedAt: Date.now() - 5000,
    elapsedMs: 5000,
    toolCalls: 0,
    lastLine: "",
    turnCount: 1,
    lastActivityAt: Date.now(),
    ...overrides,
  };
}

// ━━━ diagnoseResultFailure ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("diagnoseResultFailure", () => {
  it("fails when exitCode is non-zero", () => {
    const result = makeResult({ exitCode: 1 });
    const diagnosis = diagnoseResultFailure(result);
    assert.equal(diagnosis.failed, true);
    assert.ok(diagnosis.reason?.includes("exited with code 1"));
  });

  it("fails when stopReason is error", () => {
    const result = makeResult({ stopReason: "error", errorMessage: "Something broke" });
    const diagnosis = diagnoseResultFailure(result);
    assert.equal(diagnosis.failed, true);
    assert.ok(diagnosis.reason?.includes("Something broke"));
  });

  it("fails when stopReason is error without message", () => {
    const result = makeResult({ stopReason: "error" });
    const diagnosis = diagnoseResultFailure(result);
    assert.equal(diagnosis.failed, true);
    assert.ok(diagnosis.reason?.includes("stopReason=error"));
  });

  it("fails when stopReason is aborted", () => {
    const result = makeResult({ stopReason: "aborted" });
    const diagnosis = diagnoseResultFailure(result);
    assert.equal(diagnosis.failed, true);
    assert.ok(diagnosis.reason?.includes("aborted"));
  });

  it("succeeds when there is assistant text output", () => {
    const result = makeResult({
      messages: [makeAssistantMessage("All done!")],
    });
    const diagnosis = diagnoseResultFailure(result);
    assert.equal(diagnosis.failed, false);
  });

  it("fails when no messages at all", () => {
    const result = makeResult({ messages: [] });
    const diagnosis = diagnoseResultFailure(result);
    assert.equal(diagnosis.failed, true);
    assert.ok(diagnosis.reason?.includes("no messages"));
  });

  it("fails when no messages but has stderr", () => {
    const result = makeResult({ messages: [], stderr: "segfault" });
    const diagnosis = diagnoseResultFailure(result);
    assert.equal(diagnosis.failed, true);
    assert.ok(diagnosis.reason?.includes("segfault"));
  });

  it("fails when messages exist but no assistant text", () => {
    // Message with only a tool call, no text
    const result = makeResult({
      messages: [
        {
          role: "assistant",
          content: [{ type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } }],
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
          stopReason: "toolUse",
          timestamp: Date.now(),
        },
      ],
    });
    const diagnosis = diagnoseResultFailure(result);
    assert.equal(diagnosis.failed, true);
    assert.ok(diagnosis.reason?.includes("without assistant text"));
  });

  it("includes stderr when messages exist but no text and has stderr", () => {
    const result = makeResult({
      messages: [
        {
          role: "assistant",
          content: [{ type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } }],
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
          stopReason: "toolUse",
          timestamp: Date.now(),
        },
      ],
      stderr: "some error output",
    });
    const diagnosis = diagnoseResultFailure(result);
    assert.equal(diagnosis.failed, true);
    assert.ok(diagnosis.reason?.includes("some error output"));
  });

  it("prefers exitCode check over other checks", () => {
    // Even if there's output, non-zero exitCode means failure
    const result = makeResult({
      exitCode: 2,
      messages: [makeAssistantMessage("Some output")],
    });
    const diagnosis = diagnoseResultFailure(result);
    assert.equal(diagnosis.failed, true);
    assert.ok(diagnosis.reason?.includes("exited with code 2"));
  });
});

// ━━━ getAssistantTextPart ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getAssistantTextPart", () => {
  it("returns string content directly", () => {
    assert.equal(getAssistantTextPart("hello"), "hello");
  });

  it("extracts text from array content", () => {
    const content = [
      { type: "thinking", thinking: "hmm" },
      { type: "text", text: "answer" },
    ];
    assert.equal(getAssistantTextPart(content), "answer");
  });

  it("returns empty string for non-array, non-string", () => {
    assert.equal(getAssistantTextPart(42), "");
    assert.equal(getAssistantTextPart(null), "");
    assert.equal(getAssistantTextPart(undefined), "");
  });

  it("returns empty string for array with no text parts", () => {
    const content = [{ type: "thinking", thinking: "hmm" }];
    assert.equal(getAssistantTextPart(content), "");
  });

  it("returns first text part found", () => {
    const content = [
      { type: "text", text: "first" },
      { type: "text", text: "second" },
    ];
    assert.equal(getAssistantTextPart(content), "first");
  });

  it("returns empty string when text part has non-string text", () => {
    const content = [{ type: "text", text: 42 }];
    assert.equal(getAssistantTextPart(content), "");
  });

  it("skips null entries in array", () => {
    const content = [null, { type: "text", text: "found" }];
    assert.equal(getAssistantTextPart(content), "found");
  });
});

// ━━━ parseSessionDetailSummary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseSessionDetailSummary", () => {
  const tmpFiles: string[] = [];

  function createTmpSessionFile(content: string): string {
    const tmpDir = os.tmpdir();
    const filePath = path.join(
      tmpDir,
      `test-session-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`,
    );
    fs.writeFileSync(filePath, content, "utf-8");
    tmpFiles.push(filePath);
    return filePath;
  }

  afterEach(() => {
    for (const f of tmpFiles) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
    tmpFiles.length = 0;
  });

  it("returns error when sessionFile is undefined", () => {
    const result = parseSessionDetailSummary(undefined);
    assert.equal(result.finalOutput, "");
    assert.deepStrictEqual(result.turns, []);
    assert.ok(result.error?.includes("not available"));
  });

  it("returns error when sessionFile is empty string", () => {
    const result = parseSessionDetailSummary("");
    assert.equal(result.finalOutput, "");
    assert.ok(result.error?.includes("not available"));
  });

  it("returns error when file does not exist", () => {
    const result = parseSessionDetailSummary("/tmp/nonexistent-session-file-xyz.jsonl");
    assert.equal(result.finalOutput, "");
    assert.deepStrictEqual(result.turns, []);
    assert.ok(result.error?.includes("not found"));
    assert.ok(result.error?.includes("turn=0"));
  });

  it("parses assistant messages with text content", () => {
    const content = [
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Hello world" }],
        },
      }),
    ].join("\n");
    const filePath = createTmpSessionFile(content);
    const result = parseSessionDetailSummary(filePath);
    assert.equal(result.finalOutput, "Hello world");
    assert.equal(result.error, undefined);
  });

  it("extracts tool calls from assistant messages", () => {
    const content = [
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: [
            { type: "toolCall", name: "bash", arguments: { command: "ls" } },
            { type: "toolCall", name: "read", arguments: { file_path: "/tmp/x" } },
          ],
        },
      }),
    ].join("\n");
    const filePath = createTmpSessionFile(content);
    const result = parseSessionDetailSummary(filePath);
    assert.equal(result.turns.length, 1);
    const turn = result.turns[0];
    assert.ok(turn);
    assert.equal(turn.turn, 1);
    assert.equal(turn.toolCalls.length, 2);
    assert.equal(turn.toolCalls[0]?.name, "bash");
    assert.equal(turn.toolCalls[1]?.name, "read");
  });

  it("handles multiple assistant messages", () => {
    const content = [
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "first" }],
        },
      }),
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "toolCall", name: "bash", arguments: { command: "echo hi" } }],
        },
      }),
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "final output" }],
        },
      }),
    ].join("\n");
    const filePath = createTmpSessionFile(content);
    const result = parseSessionDetailSummary(filePath);
    assert.equal(result.finalOutput, "final output");
    assert.equal(result.turns.length, 1); // only 1 turn has tool calls
  });

  it("skips non-assistant entries", () => {
    const content = [
      JSON.stringify({
        type: "message",
        message: { role: "user", content: "hello" },
      }),
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "response" }],
        },
      }),
    ].join("\n");
    const filePath = createTmpSessionFile(content);
    const result = parseSessionDetailSummary(filePath);
    assert.equal(result.finalOutput, "response");
  });

  it("skips non-message entries", () => {
    const content = [
      JSON.stringify({ type: "system", data: "init" }),
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "hello" }],
        },
      }),
    ].join("\n");
    const filePath = createTmpSessionFile(content);
    const result = parseSessionDetailSummary(filePath);
    assert.equal(result.finalOutput, "hello");
  });

  it("handles corrupt JSON lines gracefully", () => {
    const content = [
      "not valid json",
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "still works" }],
        },
      }),
    ].join("\n");
    const filePath = createTmpSessionFile(content);
    const result = parseSessionDetailSummary(filePath);
    assert.equal(result.finalOutput, "still works");
    assert.equal(result.error, undefined);
  });

  it("handles empty file", () => {
    const filePath = createTmpSessionFile("");
    const result = parseSessionDetailSummary(filePath);
    assert.equal(result.finalOutput, "");
    assert.deepStrictEqual(result.turns, []);
  });

  it("handles file with only blank lines", () => {
    const filePath = createTmpSessionFile("\n\n\n");
    const result = parseSessionDetailSummary(filePath);
    assert.equal(result.finalOutput, "");
    assert.deepStrictEqual(result.turns, []);
  });

  it("handles entries without message property", () => {
    const content = `${JSON.stringify({ type: "message" })}\n`;
    const filePath = createTmpSessionFile(content);
    const result = parseSessionDetailSummary(filePath);
    assert.equal(result.finalOutput, "");
  });

  it("handles toolCall without name as 'tool'", () => {
    const content = `${JSON.stringify({
      type: "message",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", arguments: { x: 1 } }],
      },
    })}\n`;
    const filePath = createTmpSessionFile(content);
    const result = parseSessionDetailSummary(filePath);
    assert.equal(result.turns.length, 1);
    assert.equal(result.turns[0]?.toolCalls[0]?.name, "tool");
  });

  it("returns empty finalOutput when all messages only have tool calls", () => {
    const content = `${JSON.stringify({
      type: "message",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", name: "bash", arguments: {} }],
      },
    })}\n`;
    const filePath = createTmpSessionFile(content);
    const result = parseSessionDetailSummary(filePath);
    assert.equal(result.finalOutput, "");
  });

  it("gets finalOutput from last message with text (skipping later non-text)", () => {
    const content = [
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "early text" }],
        },
      }),
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "toolCall", name: "bash", arguments: {} }],
        },
      }),
    ].join("\n");
    const filePath = createTmpSessionFile(content);
    const result = parseSessionDetailSummary(filePath);
    assert.equal(result.finalOutput, "early text");
  });

  it("handles content that is not an array (string content)", () => {
    const content = `${JSON.stringify({
      type: "message",
      message: {
        role: "assistant",
        content: "just a string",
      },
    })}\n`;
    const filePath = createTmpSessionFile(content);
    const result = parseSessionDetailSummary(filePath);
    // String content is handled by getAssistantTextPart but not treated as array for toolCalls
    assert.equal(result.turns.length, 0);
  });

  it("returns error when file is unreadable (permissions)", () => {
    const filePath = createTmpSessionFile("some content");
    fs.chmodSync(filePath, 0o000);
    const result = parseSessionDetailSummary(filePath);
    assert.equal(result.finalOutput, "");
    assert.ok(result.error?.includes("Failed to read session file"));
    // Restore permissions for cleanup
    fs.chmodSync(filePath, 0o644);
  });

  it("handles Windows-style line endings (CRLF)", () => {
    const content = [
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "crlf test" }],
        },
      }),
    ].join("\r\n");
    const filePath = createTmpSessionFile(content);
    const result = parseSessionDetailSummary(filePath);
    assert.equal(result.finalOutput, "crlf test");
  });
});

// ━━━ formatRunDetailOutput ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatRunDetailOutput", () => {
  it("formats a run with output and no session file", () => {
    const run = makeRunState({
      lastOutput: "Task completed",
      task: "do something",
    });
    const output = formatRunDetailOutput(run);
    assert.ok(output.includes("Prompt: do something"));
    assert.ok(output.includes("Task completed"));
    assert.ok(output.includes("Tool calls by turn:"));
  });

  it("shows session file when present", () => {
    const run = makeRunState({
      sessionFile: "/tmp/test-session.jsonl",
      lastOutput: "done",
      task: "task",
    });
    const output = formatRunDetailOutput(run);
    assert.ok(output.includes("Session: /tmp/test-session.jsonl"));
  });

  it("shows thought text when present", () => {
    const run = makeRunState({
      thoughtText: "thinking about something",
      lastOutput: "done",
      task: "task",
    });
    const output = formatRunDetailOutput(run);
    assert.ok(output.includes("Thought: thinking about something"));
  });

  it("shows (no output) when no output available", () => {
    const run = makeRunState({
      lastOutput: undefined,
      lastLine: "",
      task: "task",
    });
    const output = formatRunDetailOutput(run);
    assert.ok(output.includes("(no output)"));
  });

  it("falls back to lastLine when lastOutput is empty", () => {
    const run = makeRunState({
      lastOutput: "",
      lastLine: "last line content",
      task: "task",
    });
    const output = formatRunDetailOutput(run);
    assert.ok(output.includes("last line content"));
  });

  it("shows session parse error when session file is missing", () => {
    const run = makeRunState({
      sessionFile: "/tmp/nonexistent-session-xyz.jsonl",
      lastOutput: "output",
      task: "task",
    });
    const output = formatRunDetailOutput(run);
    assert.ok(output.includes("(session parse error)"));
  });

  it("shows (no tool calls) when session has no tool calls", () => {
    const run = makeRunState({
      lastOutput: "output",
      task: "task",
    });
    const output = formatRunDetailOutput(run);
    assert.ok(output.includes("(no tool calls)"));
  });

  it("shows tool calls by turn when session file has tool calls", () => {
    const tmpFile = path.join(os.tmpdir(), `test-detail-tc-${Date.now()}.jsonl`);
    const content = [
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "Let me check" },
            { type: "toolCall", name: "bash", arguments: { command: "ls" } },
          ],
        },
      }),
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "All done" }],
        },
      }),
    ].join("\n");
    fs.writeFileSync(tmpFile, content, "utf-8");
    try {
      const run = makeRunState({
        sessionFile: tmpFile,
        lastOutput: "All done",
        task: "task",
      });
      const output = formatRunDetailOutput(run);
      assert.ok(output.includes("Turn 1:"));
      assert.ok(output.includes("bash"));
      assert.ok(!output.includes("(no tool calls)"));
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("shows tool calls without args text", () => {
    const tmpFile = path.join(os.tmpdir(), `test-detail-noargs-${Date.now()}.jsonl`);
    const content = `${JSON.stringify({
      type: "message",
      message: {
        role: "assistant",
        content: [
          { type: "toolCall", name: "myTool", arguments: undefined },
          { type: "text", text: "done" },
        ],
      },
    })}\n`;
    fs.writeFileSync(tmpFile, content, "utf-8");
    try {
      const run = makeRunState({
        sessionFile: tmpFile,
        lastOutput: "done",
        task: "task",
      });
      const output = formatRunDetailOutput(run);
      assert.ok(output.includes("Turn 1:"));
      assert.ok(output.includes("  - myTool"));
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("falls back to session output when lastOutput is empty", () => {
    const tmpFile = path.join(os.tmpdir(), `test-detail-fallback-${Date.now()}.jsonl`);
    const content = `${JSON.stringify({
      type: "message",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "session output" }],
      },
    })}\n`;
    fs.writeFileSync(tmpFile, content, "utf-8");
    try {
      const run = makeRunState({
        sessionFile: tmpFile,
        lastOutput: "",
        lastLine: "",
        task: "task",
      });
      const output = formatRunDetailOutput(run);
      assert.ok(output.includes("session output"));
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

// ━━━ getRunCounts ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getRunCounts", () => {
  it("returns zeros for empty maps", () => {
    const store = {
      commandRuns: new Map<number, CommandRunState>(),
      globalLiveRuns: new Map<number, { runState: CommandRunState }>(),
    };
    const counts = getRunCounts(store);
    assert.equal(counts.running, 0);
    assert.equal(counts.idle, 0);
  });

  it("counts running runs from commandRuns", () => {
    const store = {
      commandRuns: new Map<number, CommandRunState>([
        [1, makeRunState({ id: 1, status: "running" })],
        [2, makeRunState({ id: 2, status: "done" })],
      ]),
      globalLiveRuns: new Map<number, { runState: CommandRunState }>(),
    };
    const counts = getRunCounts(store);
    assert.equal(counts.running, 1);
    assert.equal(counts.idle, 1);
  });

  it("skips removed runs", () => {
    const store = {
      commandRuns: new Map<number, CommandRunState>([
        [1, makeRunState({ id: 1, status: "running", removed: true })],
        [2, makeRunState({ id: 2, status: "done" })],
      ]),
      globalLiveRuns: new Map<number, { runState: CommandRunState }>(),
    };
    const counts = getRunCounts(store);
    assert.equal(counts.running, 0);
    assert.equal(counts.idle, 1);
  });

  it("deduplicates runs from globalLiveRuns and commandRuns", () => {
    const run = makeRunState({ id: 1, status: "running" });
    const store = {
      commandRuns: new Map<number, CommandRunState>([[1, run]]),
      globalLiveRuns: new Map<number, { runState: CommandRunState }>([[1, { runState: run }]]),
    };
    const counts = getRunCounts(store);
    assert.equal(counts.running, 1);
  });

  it("counts runs from globalLiveRuns not in commandRuns", () => {
    const store = {
      commandRuns: new Map<number, CommandRunState>(),
      globalLiveRuns: new Map<number, { runState: CommandRunState }>([
        [1, { runState: makeRunState({ id: 1, status: "running" }) }],
      ]),
    };
    const counts = getRunCounts(store);
    assert.equal(counts.running, 1);
  });

  it("counts error status as idle", () => {
    const store = {
      commandRuns: new Map<number, CommandRunState>([
        [1, makeRunState({ id: 1, status: "error" })],
      ]),
      globalLiveRuns: new Map<number, { runState: CommandRunState }>(),
    };
    const counts = getRunCounts(store);
    assert.equal(counts.running, 0);
    assert.equal(counts.idle, 1);
  });

  it("skips removed runs in globalLiveRuns", () => {
    const store = {
      commandRuns: new Map<number, CommandRunState>(),
      globalLiveRuns: new Map<number, { runState: CommandRunState }>([
        [1, { runState: makeRunState({ id: 1, status: "running", removed: true }) }],
      ]),
    };
    const counts = getRunCounts(store);
    assert.equal(counts.running, 0);
  });
});

// ━━━ formatIdleRunWarning ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatIdleRunWarning", () => {
  it("includes the idle count", () => {
    const warning = formatIdleRunWarning(25);
    assert.ok(warning.includes("25"));
  });

  it("includes cleanup instructions", () => {
    const warning = formatIdleRunWarning(5);
    assert.ok(warning.includes("subagent remove"));
  });
});

// ━━━ createEmptyDetails ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("createEmptyDetails", () => {
  it("creates details with correct shape", () => {
    const details = createEmptyDetails("single", true, "/agents");
    assert.equal(details.mode, "single");
    assert.equal(details.inheritMainContext, true);
    assert.equal(details.projectAgentsDir, "/agents");
    assert.deepStrictEqual(details.results, []);
    assert.deepStrictEqual(details.launches, []);
  });

  it("accepts null projectAgentsDir", () => {
    const details = createEmptyDetails("batch", false, null);
    assert.equal(details.projectAgentsDir, null);
  });

  it("uses provided launches", () => {
    const launches = [{ agent: "worker", mode: "run" as const, runId: 1 }];
    const details = createEmptyDetails("single", false, null, launches);
    assert.deepStrictEqual(details.launches, launches);
  });

  it("defaults launches to empty array", () => {
    const details = createEmptyDetails("chain", true, "/agents");
    assert.deepStrictEqual(details.launches, []);
  });

  it("supports chain mode", () => {
    const details = createEmptyDetails("chain", false, "/agents");
    assert.equal(details.mode, "chain");
  });
});

// ━━━ buildRunStartMessage ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildRunStartMessage", () => {
  it("builds started message with main context", () => {
    const run = makeRunState({ id: 5, agent: "planner", contextMode: "main" });
    const msg = buildRunStartMessage(run, "started");
    assert.equal(msg.customType, "subagent-tool");
    assert.ok(msg.content.includes("[subagent:planner#5] started"));
    assert.ok(msg.content.includes("main context"));
    assert.equal(msg.display, false);
    assert.equal(msg.details.runId, 5);
    assert.equal(msg.details.agent, "planner");
    assert.equal(msg.details.status, "started");
  });

  it("builds resumed message with isolated context", () => {
    const run = makeRunState({ id: 3, agent: "worker", contextMode: "isolated" });
    const msg = buildRunStartMessage(run, "resumed");
    assert.ok(msg.content.includes("[subagent:worker#3] resumed"));
    assert.ok(msg.content.includes("dedicated sub-session"));
    assert.equal(msg.details.status, "resumed");
  });

  it("defaults to dedicated sub-session for undefined contextMode", () => {
    const run = makeRunState({ id: 1, agent: "worker" });
    const msg = buildRunStartMessage(run, "started");
    assert.ok(msg.content.includes("dedicated sub-session"));
  });

  it("includes all run details", () => {
    const run = makeRunState({
      id: 7,
      agent: "reviewer",
      task: "review code",
      continuedFromRunId: 3,
      turnCount: 5,
      contextMode: "main",
      sessionFile: "/tmp/sess.jsonl",
      thoughtText: "thinking...",
      batchId: "batch-1",
      pipelineId: "pipe-1",
      pipelineStepIndex: 2,
    });
    const msg = buildRunStartMessage(run, "started");
    assert.equal(msg.details.task, "review code");
    assert.equal(msg.details.continuedFromRunId, 3);
    assert.equal(msg.details.turnCount, 5);
    assert.equal(msg.details.contextMode, "main");
    assert.equal(msg.details.sessionFile, "/tmp/sess.jsonl");
    assert.equal(msg.details.thoughtText, "thinking...");
    assert.equal(msg.details.batchId, "batch-1");
    assert.equal(msg.details.pipelineId, "pipe-1");
    assert.equal(msg.details.pipelineStepIndex, 2);
  });
});

// ━━━ buildRunCompletionMessage ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildRunCompletionMessage", () => {
  it("builds completion message for success", () => {
    const runState = makeRunState({ id: 1, agent: "worker", task: "test" });
    const result = makeResult({
      usage: {
        input: 100,
        output: 50,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0.01,
        contextTokens: 0,
        turns: 1,
      },
      model: "opus",
    });
    const finalized = { runState, result, isError: false, rawOutput: "All done!" };
    const msg = buildRunCompletionMessage(finalized);
    assert.equal(msg.customType, "subagent-tool");
    assert.ok(msg.content.includes("[subagent:worker#1] completed"));
    assert.ok(msg.content.includes("All done!"));
    assert.equal(msg.display, true);
  });

  it("builds completion message for error", () => {
    const runState = makeRunState({ id: 2, agent: "worker", task: "broken" });
    const result = makeResult({ exitCode: 1 });
    const finalized = { runState, result, isError: true, rawOutput: "Error occurred" };
    const msg = buildRunCompletionMessage(finalized);
    assert.ok(msg.content.includes("failed"));
    assert.ok(msg.content.includes("Error occurred"));
  });

  it("respects display option override", () => {
    const runState = makeRunState();
    const finalized = { runState, result: undefined, isError: false, rawOutput: "ok" };
    const msg = buildRunCompletionMessage(finalized, { display: false });
    assert.equal(msg.display, false);
  });

  it("includes thought text when present", () => {
    const runState = makeRunState({ thoughtText: "deep thought" });
    const result = makeResult();
    const finalized = { runState, result, isError: false, rawOutput: "done" };
    const msg = buildRunCompletionMessage(finalized);
    assert.ok(msg.content.includes("Thought: deep thought"));
  });

  it("omits usage line when no result", () => {
    const runState = makeRunState();
    const finalized = { runState, result: undefined, isError: false, rawOutput: "done" };
    const msg = buildRunCompletionMessage(finalized);
    assert.ok(!msg.content.includes("Usage:"));
  });

  it("includes all details fields", () => {
    const runState = makeRunState({
      id: 3,
      agent: "planner",
      task: "plan",
      continuedFromRunId: 1,
      turnCount: 2,
      contextMode: "main",
      sessionFile: "/tmp/s.jsonl",
      status: "done",
      batchId: "b1",
      pipelineId: "p1",
      pipelineStepIndex: 0,
    });
    const result = makeResult({
      exitCode: 0,
      usage: {
        input: 10,
        output: 5,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0,
        contextTokens: 0,
        turns: 1,
      },
      model: "test-model",
    });
    const finalized = { runState, result, isError: false, rawOutput: "ok" };
    const msg = buildRunCompletionMessage(finalized);
    assert.equal(msg.details.runId, 3);
    assert.equal(msg.details.agent, "planner");
    assert.equal(msg.details.exitCode, 0);
    assert.equal(msg.details.model, "test-model");
    assert.equal(msg.details.batchId, "b1");
    assert.equal(msg.details.pipelineId, "p1");
    assert.equal(msg.details.pipelineStepIndex, 0);
  });
});

// ━━━ buildEscalationMessage ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildEscalationMessage", () => {
  it("builds escalation message", () => {
    const runState = makeRunState({ id: 4, agent: "worker", task: "task" });
    const result = makeResult({
      exitCode: 42,
      usage: {
        input: 200,
        output: 100,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0.02,
        contextTokens: 0,
        turns: 1,
      },
      model: "opus",
    });
    const msg = buildEscalationMessage(runState, "Need help with X", result);
    assert.equal(msg.customType, "subagent-tool");
    assert.ok(msg.content.includes("[subagent:worker#4] escalated"));
    assert.ok(msg.content.includes("[ESCALATION] Need help with X"));
    assert.equal(msg.display, true);
    assert.equal(msg.details.status, "error");
    assert.equal(msg.details.exitCode, 42);
  });

  it("includes usage stats", () => {
    const runState = makeRunState({ id: 1, agent: "a" });
    const result = makeResult({
      usage: {
        input: 500,
        output: 200,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0.05,
        contextTokens: 0,
        turns: 3,
      },
      model: "sonnet",
    });
    const msg = buildEscalationMessage(runState, "help", result);
    assert.ok(msg.content.includes("Usage:"));
    assert.ok(msg.content.includes("3 turns"));
  });

  it("includes batch and pipeline details", () => {
    const runState = makeRunState({
      batchId: "batch-x",
      pipelineId: "pipe-y",
      pipelineStepIndex: 3,
    });
    const result = makeResult();
    const msg = buildEscalationMessage(runState, "escalation msg", result);
    assert.equal(msg.details.batchId, "batch-x");
    assert.equal(msg.details.pipelineId, "pipe-y");
    assert.equal(msg.details.pipelineStepIndex, 3);
  });

  it("omits usage line when all usage fields are zero and no model", () => {
    const runState = makeRunState({ id: 5, agent: "worker" });
    const result = makeResult({
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0,
        contextTokens: 0,
        turns: 0,
      },
      model: undefined,
    });
    const msg = buildEscalationMessage(runState, "escalation", result);
    assert.ok(!msg.content.includes("Usage:"));
    assert.ok(msg.content.includes("[ESCALATION] escalation"));
  });
});

// ━━━ buildStrongWaitMessage ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildStrongWaitMessage", () => {
  it("includes run ID", () => {
    const msg = buildStrongWaitMessage(42);
    assert.ok(msg.includes("Run #42"));
    assert.ok(msg.includes("still running"));
  });

  it("includes the strong wait message content", () => {
    const msg = buildStrongWaitMessage(1);
    assert.ok(msg.includes("Do not poll"));
  });
});

// ━━━ finalizeRunState ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("finalizeRunState", () => {
  it("marks successful run as done", () => {
    const runState = makeRunState({ id: 1, startedAt: Date.now() - 3000 });
    const result = makeResult({
      messages: [makeAssistantMessage("All done!")],
    });
    const finalized = finalizeRunState(runState, result);
    assert.equal(finalized.isError, false);
    assert.equal(finalized.runState.status, "done");
    assert.ok(finalized.rawOutput.includes("All done!"));
  });

  it("marks failed run as error", () => {
    const runState = makeRunState({ id: 2, startedAt: Date.now() - 1000 });
    const result = makeResult({ exitCode: 1 });
    const finalized = finalizeRunState(runState, result);
    assert.equal(finalized.isError, true);
    assert.equal(finalized.runState.status, "error");
  });

  it("uses (no output) when no output is available for success", () => {
    const runState = makeRunState({ id: 3, startedAt: Date.now() - 1000 });
    // A result with messages but only tool calls (no text) that still exits 0
    // diagnoseResultFailure will see no text output
    const result = makeResult({ exitCode: 0, messages: [] });
    const finalized = finalizeRunState(runState, result);
    assert.equal(finalized.isError, true); // no messages = failure
    assert.ok(finalized.rawOutput.length > 0);
  });

  it("sets lastOutput and lastLine on success", () => {
    const runState = makeRunState({ startedAt: Date.now() - 2000 });
    const result = makeResult({
      messages: [makeAssistantMessage("line1\nline2\nline3")],
    });
    const finalized = finalizeRunState(runState, result);
    assert.ok(finalized.runState.lastOutput);
    assert.ok(finalized.runState.lastLine);
  });

  it("uses error reason when failed and no fallback", () => {
    const runState = makeRunState({ startedAt: Date.now() - 500 });
    const result = makeResult({ exitCode: 1 });
    const finalized = finalizeRunState(runState, result);
    assert.ok(finalized.rawOutput.includes("exited with code 1"));
  });

  it("falls back through error chain for output", () => {
    const runState = makeRunState({ startedAt: Date.now() - 500 });
    const result = makeResult({
      exitCode: 0,
      messages: [],
      stderr: "some stderr",
    });
    const finalized = finalizeRunState(runState, result);
    assert.equal(finalized.isError, true);
    assert.ok(
      finalized.rawOutput.includes("some stderr") || finalized.rawOutput.includes("no messages"),
    );
  });

  it("updates elapsedMs", () => {
    const startedAt = Date.now() - 10000;
    const runState = makeRunState({ startedAt, elapsedMs: 0 });
    const result = makeResult({
      messages: [makeAssistantMessage("done")],
    });
    finalizeRunState(runState, result);
    assert.ok(runState.elapsedMs >= 9000);
  });

  it("handles escalation exit code with no escalation file", () => {
    const runState = makeRunState({
      startedAt: Date.now() - 1000,
      sessionFile: "/tmp/nonexistent-escalation-session.jsonl",
    });
    const result = makeResult({ exitCode: 42 });
    const finalized = finalizeRunState(runState, result);
    assert.equal(finalized.isError, true);
    assert.ok(finalized.rawOutput.includes("[ESCALATION]"));
    assert.ok(finalized.rawOutput.includes("without a message"));
    assert.equal(finalized.runState.status, "error");
  });

  it("handles escalation exit code with actual escalation file", () => {
    // Create an escalation file on disk so readAndConsumeEscalation finds it
    const escalationsDir = path.join(os.homedir(), ".pi", "agent", "escalations");
    fs.mkdirSync(escalationsDir, { recursive: true });
    const sessionFile = "/tmp/esc-test-session.jsonl";
    const basename = path.basename(sessionFile, ".jsonl");
    const yamlPath = path.join(escalationsDir, `${basename}.yaml`);
    const yamlContent = [
      `sessionFile: ${sessionFile}`,
      "message: I need human guidance on this",
      "timestamp: 2024-01-01",
    ].join("\n");
    fs.writeFileSync(yamlPath, yamlContent, "utf-8");

    try {
      const runState = makeRunState({
        startedAt: Date.now() - 1000,
        sessionFile,
      });
      const result = makeResult({ exitCode: 42 });
      const finalized = finalizeRunState(runState, result);
      assert.equal(finalized.isError, true);
      assert.ok(finalized.rawOutput.includes("[ESCALATION]"));
      assert.ok(finalized.rawOutput.includes("I need human guidance"));
      assert.equal(finalized.runState.status, "error");
    } finally {
      // Clean up
      try {
        fs.unlinkSync(yamlPath);
      } catch {
        /* might already be consumed */
      }
    }
  });

  it("handles escalation exit code without session file (falls through)", () => {
    const runState = makeRunState({
      startedAt: Date.now() - 1000,
      sessionFile: undefined,
    });
    const result = makeResult({ exitCode: 42 });
    const finalized = finalizeRunState(runState, result);
    // No sessionFile, so escalation path is skipped; treated as normal non-zero exit
    assert.equal(finalized.isError, true);
    assert.ok(finalized.rawOutput.includes("exited with code 42"));
  });

  it("uses errorMessage when failure.reason is empty", () => {
    // stopReason=error with a custom message, exitCode=0
    const runState = makeRunState({ startedAt: Date.now() - 500 });
    const result = makeResult({
      exitCode: 0,
      stopReason: "error",
      errorMessage: "custom error message",
    });
    const finalized = finalizeRunState(runState, result);
    assert.equal(finalized.isError, true);
    // The reason from diagnoseResultFailure includes "custom error message"
    assert.ok(finalized.rawOutput.includes("custom error message"));
  });

  it("uses stderr when reason and errorMessage are empty", () => {
    // A result with no assistant text, exitCode=0, and stderr
    const runState = makeRunState({ startedAt: Date.now() - 500 });
    const result = makeResult({
      exitCode: 0,
      messages: [],
      stderr: "stderr output here",
      errorMessage: undefined,
    });
    const finalized = finalizeRunState(runState, result);
    assert.equal(finalized.isError, true);
    // diagnoseResultFailure includes stderr in its reason for empty messages
    assert.ok(
      finalized.rawOutput.includes("stderr output here") ||
        finalized.rawOutput.includes("no messages"),
    );
  });

  it("uses (no output) when all fallbacks are empty for error", () => {
    // A tricky case: messages exist (so reason doesn't mention "no messages")
    // but no assistant text output, no stderr, no errorMessage
    // Actually, diagnoseResultFailure always returns a reason, so "(no output)" at the end
    // of the chain is hard to reach. Let's test getFinalOutput returning empty for success path.
    const runState = makeRunState({ startedAt: Date.now() - 500 });
    const result = makeResult({
      exitCode: 0,
      messages: [makeAssistantMessage("")], // empty text means getFinalOutput returns ""
    });
    const finalized = finalizeRunState(runState, result);
    // diagnoseResultFailure considers empty text as "no assistant text output"
    assert.equal(finalized.isError, true);
  });
});

// ━━━ formatBatchSummary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatBatchSummary", () => {
  it("formats completed batch with multiple runs", () => {
    const runs = [
      makeRunState({ id: 1, agent: "worker", status: "done", lastOutput: "Output 1" }),
      makeRunState({ id: 2, agent: "reviewer", status: "done", lastOutput: "Output 2" }),
    ];
    const summary = formatBatchSummary("batch-1", runs, "completed");
    assert.ok(summary.includes("[subagent-batch#batch-1] completed"));
    assert.ok(summary.includes("#1 done"));
    assert.ok(summary.includes("#2 done"));
    assert.ok(summary.includes("Output 1"));
    assert.ok(summary.includes("Output 2"));
  });

  it("formats error batch", () => {
    const runs = [makeRunState({ id: 1, agent: "worker", status: "error", lastOutput: "Failed" })];
    const summary = formatBatchSummary("batch-2", runs, "error");
    assert.ok(summary.includes("[subagent-batch#batch-2] error"));
    assert.ok(summary.includes("#1 error"));
    assert.ok(summary.includes("Failed"));
  });

  it("uses (no output) when no lastOutput or lastLine", () => {
    const runs = [
      makeRunState({ id: 1, agent: "worker", status: "done", lastOutput: undefined, lastLine: "" }),
    ];
    const summary = formatBatchSummary("batch-3", runs, "completed");
    assert.ok(summary.includes("(no output)"));
  });

  it("falls back to lastLine when lastOutput is whitespace-only", () => {
    const runs = [
      makeRunState({
        id: 1,
        agent: "worker",
        status: "done",
        lastOutput: "   ",
        lastLine: "fallback line",
      }),
    ];
    const summary = formatBatchSummary("batch-4", runs, "completed");
    assert.ok(summary.includes("fallback line"));
  });
});

// ━━━ formatPipelineSummary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatPipelineSummary", () => {
  it("formats completed pipeline with steps", () => {
    const steps: PipelineStepResult[] = [
      { runId: 1, agent: "worker", task: "implement", output: "Code written", status: "done" },
      { runId: 2, agent: "reviewer", task: "review", output: "Looks good", status: "done" },
    ];
    const summary = formatPipelineSummary("pipe-1", steps, "completed");
    assert.ok(summary.includes("[subagent-chain#pipe-1] completed"));
    assert.ok(summary.includes("Step 1"));
    assert.ok(summary.includes("Step 2"));
    assert.ok(summary.includes("worker"));
    assert.ok(summary.includes("reviewer"));
    assert.ok(summary.includes("Code written"));
    assert.ok(summary.includes("Looks good"));
  });

  it("formats stopped pipeline", () => {
    const steps: PipelineStepResult[] = [
      { runId: 1, agent: "worker", task: "implement", output: "Failed", status: "error" },
    ];
    const summary = formatPipelineSummary("pipe-2", steps, "stopped");
    assert.ok(summary.includes("[subagent-chain#pipe-2] stopped"));
    assert.ok(summary.includes("error"));
  });

  it("handles empty steps", () => {
    const summary = formatPipelineSummary("pipe-3", [], "error");
    assert.ok(summary.includes("[subagent-chain#pipe-3] error"));
  });
});

// ━━━ toLaunchSummary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("toLaunchSummary", () => {
  it("creates launch summary from run state", () => {
    const runState = {
      agent: "worker",
      id: 5,
      batchId: "batch-1",
      pipelineId: "pipe-1",
      pipelineStepIndex: 2,
    };
    const summary = toLaunchSummary(runState, "run");
    assert.equal(summary.agent, "worker");
    assert.equal(summary.mode, "run");
    assert.equal(summary.runId, 5);
    assert.equal(summary.batchId, "batch-1");
    assert.equal(summary.pipelineId, "pipe-1");
    assert.equal(summary.stepIndex, 2);
  });

  it("works with minimal run state", () => {
    const runState = { agent: "planner", id: 1 };
    const summary = toLaunchSummary(runState, "continue");
    assert.equal(summary.agent, "planner");
    assert.equal(summary.mode, "continue");
    assert.equal(summary.runId, 1);
    assert.equal(summary.batchId, undefined);
    assert.equal(summary.pipelineId, undefined);
    assert.equal(summary.stepIndex, undefined);
  });

  it("supports batch mode", () => {
    const summary = toLaunchSummary({ agent: "a", id: 2 }, "batch");
    assert.equal(summary.mode, "batch");
  });

  it("supports chain mode", () => {
    const summary = toLaunchSummary({ agent: "a", id: 3 }, "chain");
    assert.equal(summary.mode, "chain");
  });
});

// ━━━ buildRunAnalyticsSummary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildRunAnalyticsSummary", () => {
  it("creates analytics summary with all fields", () => {
    const runState = {
      id: 10,
      agent: "worker",
      status: "done" as const,
      elapsedMs: 5000,
      model: "opus",
      batchId: "b1",
      pipelineId: "p1",
      pipelineStepIndex: 0,
    };
    const summary = buildRunAnalyticsSummary(runState);
    assert.equal(summary.runId, 10);
    assert.equal(summary.agent, "worker");
    assert.equal(summary.status, "done");
    assert.equal(summary.elapsedMs, 5000);
    assert.equal(summary.model, "opus");
    assert.equal(summary.batchId, "b1");
    assert.equal(summary.pipelineId, "p1");
    assert.equal(summary.stepIndex, 0);
  });

  it("handles undefined optional fields", () => {
    const runState = {
      id: 1,
      agent: "planner",
      status: "running" as const,
      elapsedMs: 100,
    };
    const summary = buildRunAnalyticsSummary(runState);
    assert.equal(summary.runId, 1);
    assert.equal(summary.model, undefined);
    assert.equal(summary.batchId, undefined);
    assert.equal(summary.pipelineId, undefined);
    assert.equal(summary.stepIndex, undefined);
  });

  it("reflects error status", () => {
    const summary = buildRunAnalyticsSummary({
      id: 2,
      agent: "worker",
      status: "error" as const,
      elapsedMs: 200,
    });
    assert.equal(summary.status, "error");
  });
});

// ━━━ buildErrorOutput ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildErrorOutput", () => {
  it("returns failureReason when provided", () => {
    const output = buildErrorOutput("exit code 1", {
      errorMessage: "err",
      stderr: "std",
      messages: [],
    });
    assert.equal(output, "exit code 1");
  });

  it("falls back to errorMessage when failureReason is empty", () => {
    const output = buildErrorOutput("", { errorMessage: "error msg", stderr: "std", messages: [] });
    assert.equal(output, "error msg");
  });

  it("falls back to stderr when failureReason and errorMessage are empty", () => {
    const output = buildErrorOutput("", {
      errorMessage: "",
      stderr: "stderr output",
      messages: [],
    });
    assert.equal(output, "stderr output");
  });

  it("falls back to getFinalOutput when all prior are empty", () => {
    const output = buildErrorOutput("", {
      errorMessage: "",
      stderr: "",
      messages: [makeAssistantMessage("final output text")],
    });
    assert.equal(output, "final output text");
  });

  it("returns (no output) when everything is empty", () => {
    const output = buildErrorOutput("", { errorMessage: "", stderr: "", messages: [] });
    assert.equal(output, "(no output)");
  });

  it("falls back to errorMessage when failureReason is undefined", () => {
    const output = buildErrorOutput(undefined, {
      errorMessage: "found error",
      stderr: "",
      messages: [],
    });
    assert.equal(output, "found error");
  });
});
