import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import type {
  CompactionEntry,
  CustomMessageEntry,
  SessionEntry,
  SessionMessageEntry,
} from "@mariozechner/pi-coding-agent";
import {
  buildMainContextText,
  buildPipelineReferenceSection,
  extractTextFromContent,
  makeInheritedSessionCopy,
  makeSubagentSessionFile,
  makeToolSessionFile,
  stripTaskEchoFromMainContext,
  wrapTaskWithMainContext,
  wrapTaskWithPipelineContext,
  writePromptToTempFile,
} from "../session/context.js";

// ━━━ Helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeBase(overrides: Partial<SessionEntry> = {}): SessionEntry {
  return {
    type: "message",
    id: "test-id",
    parentId: null,
    timestamp: new Date().toISOString(),
    ...overrides,
  } as SessionEntry;
}

function makeMessageEntry(
  role: "user" | "assistant",
  text: string,
  overrides: Partial<SessionMessageEntry> = {},
): SessionMessageEntry {
  const base = makeBase({ type: "message" }) as SessionMessageEntry;
  if (role === "user") {
    base.message = { role: "user", content: text } as SessionMessageEntry["message"];
  } else {
    base.message = {
      role: "assistant",
      content: [{ type: "text", text }],
    } as SessionMessageEntry["message"];
  }
  return { ...base, ...overrides };
}

function makeCompactionEntry(summary: string): CompactionEntry {
  return {
    type: "compaction",
    id: "compaction-id",
    parentId: null,
    timestamp: new Date().toISOString(),
    summary,
    firstKeptEntryId: "first-kept",
    tokensBefore: 1000,
  };
}

function makeCustomMessageEntry(
  customType: string,
  content: string,
  display: boolean,
): CustomMessageEntry {
  return {
    type: "custom_message",
    id: "cm-id",
    parentId: null,
    timestamp: new Date().toISOString(),
    customType,
    content,
    display,
  };
}

// ━━━ extractTextFromContent ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractTextFromContent", () => {
  it("returns string content as-is", () => {
    assert.equal(extractTextFromContent("hello"), "hello");
  });

  it("returns empty string for non-string non-array", () => {
    assert.equal(extractTextFromContent(42), "");
    assert.equal(extractTextFromContent(null), "");
    assert.equal(extractTextFromContent(undefined), "");
    assert.equal(extractTextFromContent({}), "");
  });

  it("extracts text from array of content parts", () => {
    const content = [
      { type: "text", text: "first" },
      { type: "image", url: "http://example.com" },
      { type: "text", text: "second" },
    ];
    assert.equal(extractTextFromContent(content), "first\nsecond");
  });

  it("returns empty string for empty array", () => {
    assert.equal(extractTextFromContent([]), "");
  });

  it("skips non-text parts", () => {
    const content = [{ type: "image", url: "http://example.com" }];
    assert.equal(extractTextFromContent(content), "");
  });
});

// ━━━ buildMainContextText ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildMainContextText", () => {
  it("returns empty text for no entries", () => {
    const ctx = { sessionManager: { getEntries: () => [] } };
    const result = buildMainContextText(ctx);
    assert.equal(result.text, "");
    assert.equal(result.totalMessageCount, 0);
  });

  it("includes compaction summary", () => {
    const entries: SessionEntry[] = [
      makeCompactionEntry("This is the compaction summary"),
      makeMessageEntry("user", "hello after compaction"),
    ];
    const ctx = { sessionManager: { getEntries: () => entries } };
    const result = buildMainContextText(ctx);
    assert.ok(result.text.includes("This is the compaction summary"));
    assert.equal(result.totalMessageCount, 1);
  });

  it("includes recent user and assistant messages", () => {
    const entries: SessionEntry[] = [
      makeMessageEntry("user", "What is TypeScript?"),
      makeMessageEntry("assistant", "TypeScript is a typed superset of JavaScript."),
    ];
    const ctx = { sessionManager: { getEntries: () => entries } };
    const result = buildMainContextText(ctx);
    assert.ok(result.text.includes("User: What is TypeScript?"));
    assert.ok(result.text.includes("Main agent: TypeScript is a typed superset of JavaScript."));
    assert.equal(result.totalMessageCount, 2);
  });

  it("includes subagent completion results", () => {
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "Task completed successfully", true),
    ];
    const ctx = { sessionManager: { getEntries: () => entries } };
    const result = buildMainContextText(ctx);
    assert.ok(result.text.includes("Task completed successfully"));
  });

  it("excludes non-displayed subagent entries", () => {
    const entries: SessionEntry[] = [
      makeCustomMessageEntry("subagent-command", "Started task", false),
    ];
    const ctx = { sessionManager: { getEntries: () => entries } };
    const result = buildMainContextText(ctx);
    assert.ok(!result.text.includes("Started task"));
  });

  it("extracts tool calls from assistant messages", () => {
    const assistantEntry = makeBase({ type: "message" }) as SessionMessageEntry;
    assistantEntry.message = {
      role: "assistant",
      content: [
        { type: "text", text: "Let me check that." },
        { type: "toolCall", name: "bash", arguments: { command: "ls" } },
      ],
    } as SessionMessageEntry["message"];
    const entries: SessionEntry[] = [assistantEntry];
    const ctx = { sessionManager: { getEntries: () => entries } };
    const result = buildMainContextText(ctx);
    assert.ok(result.text.includes("Main agent: Let me check that."));
    assert.ok(result.text.includes("Main agent ToolCall (bash)"));
  });

  it("handles toolCall with empty arguments", () => {
    const assistantEntry = makeBase({ type: "message" }) as SessionMessageEntry;
    assistantEntry.message = {
      role: "assistant",
      content: [{ type: "toolCall", name: "myTool", arguments: undefined }],
    } as unknown as SessionMessageEntry["message"];
    const entries: SessionEntry[] = [assistantEntry];
    const ctx = { sessionManager: { getEntries: () => entries } };
    const result = buildMainContextText(ctx);
    // argsText is empty, so no space after tool name
    assert.ok(result.text.includes("Main agent ToolCall (myTool)"));
  });

  it("handles assistant message with string content (non-array)", () => {
    const assistantEntry = makeBase({ type: "message" }) as SessionMessageEntry;
    assistantEntry.message = {
      role: "assistant",
      content: "Just a plain string response",
    } as unknown as SessionMessageEntry["message"];
    const entries: SessionEntry[] = [assistantEntry];
    const ctx = { sessionManager: { getEntries: () => entries } };
    const result = buildMainContextText(ctx);
    assert.ok(result.text.includes("Main agent: Just a plain string response"));
  });

  it("truncates long subagent completion results", () => {
    const longContent = "x".repeat(600);
    const entries: SessionEntry[] = [makeCustomMessageEntry("subagent-command", longContent, true)];
    const ctx = { sessionManager: { getEntries: () => entries } };
    const result = buildMainContextText(ctx);
    assert.ok(result.text.includes("[truncated]"));
    assert.ok(result.text.length < longContent.length + 200);
  });

  it("skips content parts that are null or not objects", () => {
    const assistantEntry = makeBase({ type: "message" }) as SessionMessageEntry;
    assistantEntry.message = {
      role: "assistant",
      content: [null, "not-an-object", { type: "text", text: "valid" }],
    } as unknown as SessionMessageEntry["message"];
    const entries: SessionEntry[] = [assistantEntry];
    const ctx = { sessionManager: { getEntries: () => entries } };
    const result = buildMainContextText(ctx);
    assert.ok(result.text.includes("Main agent: valid"));
  });

  it("skips subagent entries with empty content", () => {
    const entries: SessionEntry[] = [makeCustomMessageEntry("subagent-command", "", true)];
    const ctx = { sessionManager: { getEntries: () => entries } };
    const result = buildMainContextText(ctx);
    assert.ok(!result.text.includes("[Subagent Results]"));
  });

  it("skips non-subagent-command custom_message entries", () => {
    const entries: SessionEntry[] = [makeCustomMessageEntry("subagent-tool", "tool result", true)];
    const ctx = { sessionManager: { getEntries: () => entries } };
    const result = buildMainContextText(ctx);
    assert.ok(!result.text.includes("tool result"));
  });

  it("uses the latest compaction entry", () => {
    const entries: SessionEntry[] = [
      makeCompactionEntry("Old summary"),
      makeCompactionEntry("New summary"),
    ];
    const ctx = { sessionManager: { getEntries: () => entries } };
    const result = buildMainContextText(ctx);
    assert.ok(result.text.includes("New summary"));
    assert.ok(!result.text.includes("Old summary"));
  });

  it("skips message entries with no message field", () => {
    const entryNoMsg = makeBase({ type: "message" }) as SessionMessageEntry;
    (entryNoMsg as unknown as Record<string, unknown>).message = undefined;
    const entries: SessionEntry[] = [entryNoMsg, makeMessageEntry("user", "valid message")];
    const ctx = { sessionManager: { getEntries: () => entries } };
    const result = buildMainContextText(ctx);
    assert.ok(result.text.includes("User: valid message"));
    assert.equal(result.totalMessageCount, 2);
  });

  it("returns empty on exception", () => {
    const ctx = {
      sessionManager: {
        getEntries: () => {
          throw new Error("session error");
        },
      },
    };
    const result = buildMainContextText(ctx);
    assert.equal(result.text, "");
    assert.equal(result.totalMessageCount, 0);
  });
});

// ━━━ wrapTaskWithMainContext ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("wrapTaskWithMainContext", () => {
  it("returns task as-is when no context provided", () => {
    assert.equal(wrapTaskWithMainContext("do something", ""), "do something");
  });

  it("wraps task with context text", () => {
    const result = wrapTaskWithMainContext("do something", "User: hello");
    assert.ok(result.includes("[REQUEST — AUTHORITATIVE]"));
    assert.ok(result.includes("do something"));
    assert.ok(result.includes("[HISTORY — REFERENCE ONLY]"));
    assert.ok(result.includes("User: hello"));
  });

  it("includes session file reference when provided", () => {
    const result = wrapTaskWithMainContext("task", "context", {
      mainSessionFile: "/path/to/session.jsonl",
      totalMessageCount: 42,
    });
    assert.ok(result.includes("/path/to/session.jsonl"));
    assert.ok(result.includes("42"));
  });

  it("strips whitespace-only session file paths", () => {
    const result = wrapTaskWithMainContext("task", "", {
      mainSessionFile: "   ",
    });
    assert.equal(result, "task");
  });

  it("includes reference sections", () => {
    const result = wrapTaskWithMainContext("task", "", {
      referenceSections: ["[SECTION] some reference data"],
    });
    assert.ok(result.includes("[SECTION] some reference data"));
    assert.ok(result.includes("[REQUEST — AUTHORITATIVE]"));
  });
});

// ━━━ stripTaskEchoFromMainContext ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("stripTaskEchoFromMainContext", () => {
  it("returns context unchanged when task is empty", () => {
    assert.equal(stripTaskEchoFromMainContext("some context", ""), "some context");
  });

  it("returns context unchanged when context is empty", () => {
    assert.equal(stripTaskEchoFromMainContext("", "task"), "");
  });

  it("removes user lines that match task exactly", () => {
    const context = "User: do the thing\nMain agent: OK";
    const result = stripTaskEchoFromMainContext(context, "do the thing");
    assert.ok(!result.includes("do the thing"));
    assert.ok(result.includes("Main agent: OK"));
  });

  it("removes subagent toolCall lines containing the task", () => {
    const context =
      'Main agent ToolCall (subagent): {"command": "subagent run worker -- do the thing"}';
    const result = stripTaskEchoFromMainContext(context, "do the thing");
    assert.ok(!result.includes("subagent"));
  });

  it("preserves unrelated lines", () => {
    const context = "User: hello\nMain agent: world\nUser: do the thing";
    const result = stripTaskEchoFromMainContext(context, "do the thing");
    assert.ok(result.includes("User: hello"));
    assert.ok(result.includes("Main agent: world"));
  });

  it("returns context unchanged when task normalizes to empty", () => {
    // Task is whitespace-only → normalizedTask is empty → return early
    const context = "User: hello\nMain agent: world";
    assert.equal(stripTaskEchoFromMainContext(context, "   "), context);
  });

  it("preserves empty lines in context", () => {
    const context = "User: hello\n\nMain agent: world\nUser: do it";
    const result = stripTaskEchoFromMainContext(context, "do it");
    // Empty line should be preserved
    assert.ok(result.includes("\n\n"));
    assert.ok(result.includes("User: hello"));
    assert.ok(result.includes("Main agent: world"));
  });

  it("strips lines without known prefix (generic line matching)", () => {
    // Line that doesn't start with User:/Main agent:/Main agent ToolCall
    // but whose body exactly matches the task
    const context = "Some random line\nUnknown prefix: do the thing";
    stripTaskEchoFromMainContext(context, "do the thing");
    // "Unknown prefix: do the thing" → stripKnownPrefix returns "do the thing" (no matching prefix)
    // Wait, "Unknown prefix:" starts with none of the known prefixes, so it returns the trimmed line
    // normalized body = normalizeForEchoMatch("Unknown prefix: do the thing") ≠ normalizeForEchoMatch("do the thing")
    // So it should be preserved. Let me use a line whose entire trimmed content IS the task:
    const context2 = "Some text\ndo the thing\nMore text";
    const result2 = stripTaskEchoFromMainContext(context2, "do the thing");
    // "do the thing" → stripKnownPrefix returns "do the thing" → body matches → removed
    assert.ok(!result2.includes("\ndo the thing\n"));
    assert.ok(result2.includes("Some text"));
    assert.ok(result2.includes("More text"));
  });
});

// ━━━ buildPipelineReferenceSection ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildPipelineReferenceSection", () => {
  it("returns empty string for empty output", () => {
    assert.equal(buildPipelineReferenceSection(""), "");
    assert.equal(buildPipelineReferenceSection("   "), "");
  });

  it("includes previous step output", () => {
    const result = buildPipelineReferenceSection("step 1 result");
    assert.ok(result.includes("[PIPELINE PREVIOUS STEP — REFERENCE ONLY]"));
    assert.ok(result.includes("step 1 result"));
  });

  it("includes metadata when provided", () => {
    const result = buildPipelineReferenceSection("output", {
      agent: "worker",
      task: "implement feature",
      stepNumber: 1,
      totalSteps: 3,
    });
    assert.ok(result.includes("Agent: worker"));
    assert.ok(result.includes("Task: implement feature"));
    assert.ok(result.includes("1/3"));
  });

  it("truncates long outputs", () => {
    const longOutput = "x".repeat(5000);
    const result = buildPipelineReferenceSection(longOutput);
    assert.ok(result.includes("[truncated]"));
    assert.ok(result.length < longOutput.length);
  });
});

// ━━━ wrapTaskWithPipelineContext ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("wrapTaskWithPipelineContext", () => {
  it("returns task as-is when previous output is empty", () => {
    assert.equal(wrapTaskWithPipelineContext("my task", ""), "my task");
  });

  it("wraps task with pipeline reference", () => {
    const result = wrapTaskWithPipelineContext("review the code", "implementation output", {
      agent: "worker",
      task: "implement",
      stepNumber: 1,
      totalSteps: 2,
    });
    assert.ok(result.includes("[REQUEST — AUTHORITATIVE]"));
    assert.ok(result.includes("review the code"));
    assert.ok(result.includes("implementation output"));
    assert.ok(result.includes("Agent: worker"));
  });
});

// ━━━ makeSubagentSessionFile ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const cleanupPaths: string[] = [];

after(() => {
  for (const p of cleanupPaths) {
    try {
      fs.rmSync(p, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe("makeSubagentSessionFile", () => {
  it("creates a session file path in the subagent sessions directory", () => {
    const filePath = makeSubagentSessionFile(42);
    cleanupPaths.push(filePath);

    assert.ok(filePath.includes("subagent-42-"));
    assert.ok(filePath.endsWith(".jsonl"));
    // The parent directory should exist
    assert.ok(fs.existsSync(path.dirname(filePath)));
  });
});

// ━━━ makeToolSessionFile ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("makeToolSessionFile", () => {
  it("creates a session file path with given prefix", () => {
    const filePath = makeToolSessionFile("test-tool");
    cleanupPaths.push(filePath);

    assert.ok(filePath.includes("test-tool-"));
    assert.ok(filePath.endsWith(".jsonl"));
    assert.ok(fs.existsSync(path.dirname(filePath)));
  });
});

// ━━━ makeInheritedSessionCopy ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("makeInheritedSessionCopy", () => {
  it("copies source session file to a new path", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-test-"));
    cleanupPaths.push(tmpDir);

    const sourcePath = path.join(tmpDir, "source-session.jsonl");
    fs.writeFileSync(sourcePath, '{"type":"session"}\n', "utf-8");

    const destPath = makeInheritedSessionCopy(sourcePath, "inherited");
    cleanupPaths.push(destPath);

    assert.ok(fs.existsSync(destPath));
    assert.ok(destPath.includes("inherited-"));
    const content = fs.readFileSync(destPath, "utf-8");
    assert.equal(content, '{"type":"session"}\n');
  });
});

// ━━━ writePromptToTempFile ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("writePromptToTempFile", () => {
  it("creates a temp file with the prompt content", () => {
    const { dir, filePath } = writePromptToTempFile("my-agent", "Hello prompt!");
    cleanupPaths.push(dir);

    assert.ok(fs.existsSync(filePath));
    assert.ok(filePath.includes("prompt-my-agent.md"));
    const content = fs.readFileSync(filePath, "utf-8");
    assert.equal(content, "Hello prompt!");
  });

  it("sanitizes agent name for filename", () => {
    const { dir, filePath } = writePromptToTempFile("agent/with:special chars", "content");
    cleanupPaths.push(dir);

    assert.ok(filePath.includes("prompt-agent_with_special_chars.md"));
    assert.ok(fs.existsSync(filePath));
  });

  it("sets file permissions to 0o600", () => {
    const { dir, filePath } = writePromptToTempFile("perm-test", "secret prompt");
    cleanupPaths.push(dir);

    const stat = fs.statSync(filePath);
    // On macOS/Linux, check the file mode bits (owner read+write only)
    const mode = stat.mode & 0o777;
    assert.equal(mode, 0o600);
  });
});
