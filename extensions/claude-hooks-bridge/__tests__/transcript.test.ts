import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { createTranscriptFile, getLastAssistantMessage } from "../core/transcript.js";
import { TRANSCRIPT_TMP_DIR } from "../core/types.js";

interface SessionEntry {
  type: string;
  message?: unknown;
}

function makeCtx(entries: SessionEntry[]): ExtensionContext {
  return {
    sessionManager: {
      getEntries: () => entries,
    },
  } as unknown as ExtensionContext;
}

// Clean up temp files created by tests
after(() => {
  try {
    if (fs.existsSync(TRANSCRIPT_TMP_DIR)) {
      const files = fs.readdirSync(TRANSCRIPT_TMP_DIR);
      for (const file of files) {
        if (file.startsWith("test-")) {
          fs.unlinkSync(path.join(TRANSCRIPT_TMP_DIR, file));
        }
      }
    }
  } catch {
    // ignore
  }
});

// ━━━ createTranscriptFile ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("createTranscriptFile", () => {
  it("creates an empty file for empty entries", () => {
    const ctx = makeCtx([]);
    const result = createTranscriptFile(ctx, "test-empty");
    assert.ok(result);
    const content = fs.readFileSync(result as string, "utf8");
    assert.equal(content, "");
  });

  it("writes assistant text messages as JSONL", () => {
    const ctx = makeCtx([
      {
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "hello world" }],
        },
      },
    ]);
    const p = createTranscriptFile(ctx, "test-assistant");
    assert.ok(p);
    const content = fs.readFileSync(p as string, "utf8");
    const line = JSON.parse(content.trim());
    assert.equal(line.type, "assistant");
    assert.deepEqual(line.message.content, [{ type: "text", text: "hello world" }]);
  });

  it("writes assistant tool calls mapped to tool_use", () => {
    const ctx = makeCtx([
      {
        type: "message",
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "tc_1",
              name: "bash",
              arguments: { command: "ls" },
            },
          ],
        },
      },
    ]);
    const p = createTranscriptFile(ctx, "test-tool");
    const content = fs.readFileSync(p as string, "utf8");
    const line = JSON.parse(content.trim());
    assert.equal(line.type, "assistant");
    const block = line.message.content[0];
    assert.equal(block.type, "tool_use");
    assert.equal(block.id, "tc_1");
    assert.equal(block.name, "bash");
    assert.deepEqual(block.input, { command: "ls" });
  });

  it("writes user messages with text blocks", () => {
    const ctx = makeCtx([
      {
        type: "message",
        message: {
          role: "user",
          content: [{ type: "text", text: "hi" }],
        },
      },
    ]);
    const p = createTranscriptFile(ctx, "test-user");
    const content = fs.readFileSync(p as string, "utf8");
    const line = JSON.parse(content.trim());
    assert.equal(line.type, "user");
    assert.deepEqual(line.message.content, [{ type: "text", text: "hi" }]);
  });

  it("writes toolResult messages as user tool_result blocks", () => {
    const ctx = makeCtx([
      {
        type: "message",
        message: {
          role: "toolResult",
          toolCallId: "tc_1",
          content: [{ text: "output text" }],
        },
      },
    ]);
    const p = createTranscriptFile(ctx, "test-toolresult");
    const content = fs.readFileSync(p as string, "utf8");
    const line = JSON.parse(content.trim());
    assert.equal(line.type, "user");
    const block = line.message.content[0];
    assert.equal(block.type, "tool_result");
    assert.equal(block.tool_use_id, "tc_1");
    assert.deepEqual(block.content, [{ type: "text", text: "output text" }]);
  });

  it("skips assistant messages with no mappable content", () => {
    const ctx = makeCtx([
      {
        type: "message",
        message: { role: "assistant", content: [] },
      },
      {
        type: "message",
        message: { role: "assistant", content: [{ type: "unknown" }] },
      },
      {
        type: "message",
        message: { role: "assistant", content: "not an array" },
      },
    ]);
    const p = createTranscriptFile(ctx, "test-skip-assistant");
    const content = fs.readFileSync(p as string, "utf8");
    assert.equal(content, "");
  });

  it("skips user messages with no mappable content", () => {
    const ctx = makeCtx([
      {
        type: "message",
        message: { role: "user", content: [] },
      },
      {
        type: "message",
        message: { role: "user", content: "plain string" },
      },
      {
        type: "message",
        message: { role: "user", content: [{ type: "text", text: 42 }] },
      },
      {
        type: "message",
        message: { role: "user", content: [null] },
      },
    ]);
    const p = createTranscriptFile(ctx, "test-skip-user");
    const content = fs.readFileSync(p as string, "utf8");
    assert.equal(content, "");
  });

  it("returns non-empty toolResult even when content is empty", () => {
    const ctx = makeCtx([
      {
        type: "message",
        message: { role: "toolResult", toolCallId: "tc_x", content: null },
      },
    ]);
    const p = createTranscriptFile(ctx, "test-empty-tr");
    const content = fs.readFileSync(p as string, "utf8");
    const line = JSON.parse(content.trim());
    assert.equal(line.type, "user");
    assert.equal(line.message.content[0].content[0].text, "");
  });

  it("skips non-message entries", () => {
    const ctx = makeCtx([
      { type: "checkpoint" },
      { type: "message", message: null },
      {
        type: "message",
        message: { role: "assistant", content: [{ type: "text", text: "a" }] },
      },
    ]);
    const p = createTranscriptFile(ctx, "test-skip-nonmsg");
    const content = fs.readFileSync(p as string, "utf8");
    const lines = content.trim().split("\n");
    assert.equal(lines.length, 1);
  });

  it("skips messages whose role is not a string", () => {
    const ctx = makeCtx([
      {
        type: "message",
        message: { role: 42, content: "x" },
      },
    ]);
    const p = createTranscriptFile(ctx, "test-bad-role");
    const content = fs.readFileSync(p as string, "utf8");
    assert.equal(content, "");
  });

  it("skips messages with unrecognized string role (e.g. 'system')", () => {
    const ctx = makeCtx([
      {
        type: "message",
        message: { role: "system", content: [{ type: "text", text: "sys" }] },
      },
    ]);
    const p = createTranscriptFile(ctx, "test-system-role");
    const content = fs.readFileSync(p as string, "utf8");
    assert.equal(content, "");
  });

  it("skips assistant content blocks missing text field", () => {
    const ctx = makeCtx([
      {
        type: "message",
        message: {
          role: "assistant",
          content: [
            null,
            { type: "text" }, // no text
            { type: "text", text: 42 }, // non-string text
            { type: "text", text: "valid" },
          ],
        },
      },
    ]);
    const p = createTranscriptFile(ctx, "test-skip-blocks");
    const content = fs.readFileSync(p as string, "utf8");
    const line = JSON.parse(content.trim());
    assert.equal(line.message.content.length, 1);
    assert.equal(line.message.content[0].text, "valid");
  });

  it("sanitizes unsafe characters in sessionId", () => {
    const ctx = makeCtx([]);
    const p = createTranscriptFile(ctx, "test-foo/bar baz!");
    assert.ok(p);
    // unsafe chars replaced with underscore
    assert.ok(!(p as string).includes("/bar"));
    assert.ok((p as string).includes("test-foo_bar_baz_"));
  });

  it("returns undefined when write fails (e.g. bad tmp dir)", () => {
    // We don't easily have a way to force mkdirSync to fail.
    // Instead we spy via restoring; stub sessionManager to throw.
    const ctx = {
      sessionManager: {
        getEntries: () => {
          throw new Error("boom");
        },
      },
    } as unknown as ExtensionContext;
    const result = createTranscriptFile(ctx, "test-fail");
    assert.equal(result, undefined);
  });

  it("skips user content blocks that are null", () => {
    const ctx = makeCtx([
      {
        type: "message",
        message: {
          role: "user",
          content: [null, { type: "text", text: "ok" }],
        },
      },
    ]);
    const p = createTranscriptFile(ctx, "test-user-nulls");
    const content = fs.readFileSync(p as string, "utf8");
    const line = JSON.parse(content.trim());
    assert.equal(line.message.content[0].text, "ok");
  });

  it("skips user content blocks where type is not 'text'", () => {
    const ctx = makeCtx([
      {
        type: "message",
        message: {
          role: "user",
          content: [
            { type: "toolCall", id: "x" },
            { type: "text", text: "kept" },
          ],
        },
      },
    ]);
    const p = createTranscriptFile(ctx, "test-user-types");
    const content = fs.readFileSync(p as string, "utf8");
    const line = JSON.parse(content.trim());
    assert.equal(line.message.content.length, 1);
    assert.equal(line.message.content[0].text, "kept");
  });
});

// ━━━ getLastAssistantMessage ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getLastAssistantMessage", () => {
  it("returns undefined for empty entries", () => {
    const ctx = makeCtx([]);
    assert.equal(getLastAssistantMessage(ctx), undefined);
  });

  it("returns text from the most recent assistant message", () => {
    const ctx = makeCtx([
      {
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "first" }],
        },
      },
      {
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "second" }],
        },
      },
    ]);
    assert.equal(getLastAssistantMessage(ctx), "second");
  });

  it("skips non-assistant messages when scanning", () => {
    const ctx = makeCtx([
      {
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "hit" }],
        },
      },
      {
        type: "message",
        message: { role: "user", content: [{ type: "text", text: "ignored" }] },
      },
    ]);
    assert.equal(getLastAssistantMessage(ctx), "hit");
  });

  it("skips assistant entries with no text content", () => {
    const ctx = makeCtx([
      {
        type: "message",
        message: { role: "assistant", content: [{ type: "text", text: "fallback" }] },
      },
      {
        type: "message",
        message: { role: "assistant", content: [] },
      },
    ]);
    assert.equal(getLastAssistantMessage(ctx), "fallback");
  });

  it("skips non-message entries", () => {
    const ctx = makeCtx([
      { type: "checkpoint" },
      {
        type: "message",
        message: { role: "assistant", content: [{ type: "text", text: "ok" }] },
      },
    ]);
    assert.equal(getLastAssistantMessage(ctx), "ok");
  });

  it("skips falsy entries (null) when scanning", () => {
    // Put null at the END since getLastAssistantMessage iterates backwards.
    const ctx = makeCtx([
      {
        type: "message",
        message: { role: "assistant", content: [{ type: "text", text: "ok" }] },
      },
      null as unknown as SessionEntry,
    ]);
    assert.equal(getLastAssistantMessage(ctx), "ok");
  });

  it("skips entries where message is invalid (null)", () => {
    const ctx = makeCtx([
      { type: "message", message: null },
      {
        type: "message",
        message: { role: "assistant", content: [{ type: "text", text: "final" }] },
      },
    ]);
    assert.equal(getLastAssistantMessage(ctx), "final");
  });

  it("returns undefined when no assistant message has text", () => {
    const ctx = makeCtx([{ type: "message", message: { role: "assistant", content: [] } }]);
    assert.equal(getLastAssistantMessage(ctx), undefined);
  });
});
