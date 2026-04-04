import assert from "node:assert/strict";
import * as os from "node:os";
import { describe, it } from "node:test";
import {
  agentBgIndex,
  formatCommandRunSummary,
  formatContextUsageBar,
  formatDuration,
  formatDurationBetween,
  formatTokens,
  formatToolCall,
  formatToolCallPlain,
  formatUsageStats,
  getContextBarColorByRemaining,
  getRemainingContextPercent,
  getUsedContextPercent,
  normalizeModelRef,
  resolveContextWindow,
  stringifyToolCallArguments,
  truncateLines,
  truncateText,
} from "../ui/format.js";

// ━━━ truncateText ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("truncateText", () => {
  it("returns empty string for max <= 0", () => {
    assert.equal(truncateText("hello", 0), "");
    assert.equal(truncateText("hello", -1), "");
  });

  it("returns empty string for empty value", () => {
    assert.equal(truncateText("", 10), "");
  });

  it("returns the full string if within max", () => {
    assert.equal(truncateText("hello", 10), "hello");
  });

  it("truncates with ellipsis when exceeding max", () => {
    const result = truncateText("hello world", 8);
    assert.ok(result.endsWith("..."));
    assert.ok(result.length <= 8);
  });

  it("handles max <= 3 without ellipsis", () => {
    const result = truncateText("hello", 3);
    // max <= 3, uses sliceToDisplayWidth directly
    assert.ok(result.length <= 3);
    assert.equal(result, "hel");
  });

  it("handles max = 1", () => {
    const result = truncateText("hello", 1);
    assert.equal(result, "h");
  });
});

// ━━━ truncateLines ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("truncateLines", () => {
  it("returns text if within max lines", () => {
    assert.equal(truncateLines("line1\nline2", 2), "line1\nline2");
  });

  it("truncates excess lines with ...", () => {
    const result = truncateLines("line1\nline2\nline3\nline4", 2);
    assert.equal(result, "line1\nline2\n...");
  });

  it("defaults to 2 lines", () => {
    const result = truncateLines("a\nb\nc");
    assert.equal(result, "a\nb\n...");
  });
});

// ━━━ formatTokens ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatTokens", () => {
  it("formats sub-1000 as plain number", () => {
    assert.equal(formatTokens(0), "0");
    assert.equal(formatTokens(999), "999");
  });

  it("formats 1000-9999 with one decimal k", () => {
    assert.equal(formatTokens(1000), "1.0k");
    assert.equal(formatTokens(1500), "1.5k");
    assert.equal(formatTokens(9999), "10.0k");
  });

  it("formats 10000-999999 as rounded k", () => {
    assert.equal(formatTokens(10000), "10k");
    assert.equal(formatTokens(50000), "50k");
    assert.equal(formatTokens(999999), "1000k");
  });

  it("formats 1M+ with one decimal M", () => {
    assert.equal(formatTokens(1000000), "1.0M");
    assert.equal(formatTokens(2500000), "2.5M");
  });
});

// ━━━ formatUsageStats ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatUsageStats", () => {
  it("formats all fields", () => {
    const result = formatUsageStats(
      {
        input: 1500,
        output: 500,
        cacheRead: 200,
        cacheWrite: 100,
        cost: 0.0123,
        contextTokens: 5000,
        turns: 3,
      },
      "opus",
    );
    assert.ok(result.includes("3 turns"));
    assert.ok(result.includes("1.5k"));
    assert.ok(result.includes("500"));
    assert.ok(result.includes("R200"));
    assert.ok(result.includes("W100"));
    assert.ok(result.includes("$0.0123"));
    assert.ok(result.includes("ctx:5.0k"));
    assert.ok(result.includes("opus"));
  });

  it("omits zero fields", () => {
    const result = formatUsageStats({
      input: 0,
      output: 100,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
    });
    assert.ok(!result.includes("\u2191")); // no ↑ for zero input
    assert.ok(result.includes("\u2193100")); // ↓100
    assert.ok(!result.includes("$"));
    assert.ok(!result.includes("R"));
    assert.ok(!result.includes("W"));
  });

  it("singular turn", () => {
    const result = formatUsageStats({
      input: 100,
      output: 50,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      turns: 1,
    });
    assert.ok(result.includes("1 turn"));
    assert.ok(!result.includes("turns"));
  });
});

// ━━━ formatDuration ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatDuration", () => {
  it("formats zero ms", () => {
    assert.equal(formatDuration(0), "0\uCD08"); // 0초
  });

  it("formats seconds only", () => {
    assert.equal(formatDuration(5000), "5\uCD08");
  });

  it("formats minutes and seconds", () => {
    assert.equal(formatDuration(125000), "2\uBD84 5\uCD08"); // 2분 5초
  });

  it("formats hours, minutes, and seconds", () => {
    assert.equal(formatDuration(3661000), "1\uC2DC\uAC04 1\uBD84 1\uCD08"); // 1시간 1분 1초
  });

  it("handles negative ms as 0", () => {
    assert.equal(formatDuration(-1000), "0\uCD08");
  });

  it("handles NaN as 0", () => {
    assert.equal(formatDuration(Number.NaN), "0\uCD08");
  });

  it("handles Infinity as 0", () => {
    assert.equal(formatDuration(Number.POSITIVE_INFINITY), "0\uCD08");
  });
});

// ━━━ formatDurationBetween ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatDurationBetween", () => {
  it("calculates duration from two timestamps", () => {
    const result = formatDurationBetween(1000, 6000);
    assert.equal(result, "5\uCD08");
  });

  it("calculates duration from two Date objects", () => {
    const start = new Date(2024, 0, 1, 0, 0, 0);
    const end = new Date(2024, 0, 1, 0, 1, 30);
    const result = formatDurationBetween(start, end);
    assert.equal(result, "1\uBD84 30\uCD08");
  });

  it("handles reversed dates as 0", () => {
    const result = formatDurationBetween(6000, 1000);
    assert.equal(result, "0\uCD08");
  });
});

// ━━━ formatContextUsageBar ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatContextUsageBar", () => {
  it("formats 0%", () => {
    const result = formatContextUsageBar(0, 10);
    assert.equal(result, "[----------] 0%");
  });

  it("formats 100%", () => {
    const result = formatContextUsageBar(100, 10);
    assert.equal(result, "[##########] 100%");
  });

  it("formats 50%", () => {
    const result = formatContextUsageBar(50, 10);
    assert.equal(result, "[#####-----] 50%");
  });

  it("clamps values above 100", () => {
    const result = formatContextUsageBar(150, 10);
    assert.equal(result, "[##########] 100%");
  });

  it("clamps values below 0", () => {
    const result = formatContextUsageBar(-10, 10);
    assert.equal(result, "[----------] 0%");
  });

  it("uses minimum bar width of 4", () => {
    const result = formatContextUsageBar(50, 2);
    assert.ok(result.includes("[##--]"));
  });
});

// ━━━ getUsedContextPercent / getRemainingContextPercent ━━━━━━━━━━━━━━━━━━━━

describe("getUsedContextPercent", () => {
  it("returns undefined when window is 0 or undefined", () => {
    assert.equal(getUsedContextPercent(500, 0), undefined);
    assert.equal(getUsedContextPercent(500, undefined), undefined);
  });

  it("returns undefined when tokens are undefined", () => {
    assert.equal(getUsedContextPercent(undefined, 1000), undefined);
  });

  it("returns undefined when tokens are negative", () => {
    assert.equal(getUsedContextPercent(-1, 1000), undefined);
  });

  it("calculates percentage correctly", () => {
    assert.equal(getUsedContextPercent(500, 1000), 50);
    assert.equal(getUsedContextPercent(0, 1000), 0);
    assert.equal(getUsedContextPercent(1000, 1000), 100);
  });

  it("clamps to 100", () => {
    assert.equal(getUsedContextPercent(1500, 1000), 100);
  });
});

describe("getRemainingContextPercent", () => {
  it("returns undefined for undefined input", () => {
    assert.equal(getRemainingContextPercent(undefined), undefined);
  });

  it("calculates remaining correctly", () => {
    assert.equal(getRemainingContextPercent(30), 70);
    assert.equal(getRemainingContextPercent(100), 0);
    assert.equal(getRemainingContextPercent(0), 100);
  });
});

// ━━━ getContextBarColorByRemaining ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getContextBarColorByRemaining", () => {
  it("returns error for <= 15%", () => {
    assert.equal(getContextBarColorByRemaining(15), "error");
    assert.equal(getContextBarColorByRemaining(0), "error");
  });

  it("returns warning for 16-40%", () => {
    assert.equal(getContextBarColorByRemaining(40), "warning");
    assert.equal(getContextBarColorByRemaining(16), "warning");
  });

  it("returns undefined for > 40%", () => {
    assert.equal(getContextBarColorByRemaining(41), undefined);
    assert.equal(getContextBarColorByRemaining(100), undefined);
  });
});

// ━━━ normalizeModelRef ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("normalizeModelRef", () => {
  it("splits provider/id by slash", () => {
    const result = normalizeModelRef("anthropic/claude-opus");
    assert.deepStrictEqual(result, { provider: "anthropic", id: "claude-opus" });
  });

  it("returns only id when no slash", () => {
    const result = normalizeModelRef("claude-opus");
    assert.deepStrictEqual(result, { id: "claude-opus" });
  });

  it("strips colon suffix", () => {
    const result = normalizeModelRef("claude-opus:extended");
    assert.deepStrictEqual(result, { id: "claude-opus" });
  });
});

// ━━━ formatCommandRunSummary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatCommandRunSummary", () => {
  it("formats a basic run summary", () => {
    const result = formatCommandRunSummary({
      id: 1,
      status: "running",
      agent: "planner",
      elapsedMs: 5000,
      toolCalls: 3,
    });
    assert.equal(result, "#1 [running] planner ctx:isolated turn:1 5s tools:3");
  });

  it("shows main context mode", () => {
    const result = formatCommandRunSummary({
      id: 2,
      status: "done",
      agent: "worker",
      contextMode: "main",
      turnCount: 5,
      elapsedMs: 120000,
      toolCalls: 10,
    });
    assert.equal(result, "#2 [done] worker ctx:main turn:5 120s tools:10");
  });

  it("defaults turnCount to 1 when undefined", () => {
    const result = formatCommandRunSummary({
      id: 3,
      status: "error",
      agent: "reviewer",
      elapsedMs: 0,
      toolCalls: 0,
    });
    assert.ok(result.includes("turn:1"));
  });
});

// ━━━ stringifyToolCallArguments ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("stringifyToolCallArguments", () => {
  it("returns empty string for null/undefined", () => {
    assert.equal(stringifyToolCallArguments(null), "");
    assert.equal(stringifyToolCallArguments(undefined), "");
  });

  it("returns string as-is", () => {
    assert.equal(stringifyToolCallArguments("hello"), "hello");
  });

  it("JSON stringifies objects", () => {
    assert.equal(stringifyToolCallArguments({ a: 1 }), '{"a":1}');
  });

  it("JSON stringifies arrays", () => {
    assert.equal(stringifyToolCallArguments([1, 2]), "[1,2]");
  });

  it("handles non-serializable with String()", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = stringifyToolCallArguments(circular);
    assert.equal(typeof result, "string");
  });
});

// ━━━ formatToolCallPlain ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatToolCallPlain", () => {
  it("formats bash tool call", () => {
    const result = formatToolCallPlain("bash", { command: "ls -la" });
    assert.equal(result, "$ ls -la");
  });

  it("truncates long bash command", () => {
    const longCmd = "a".repeat(100);
    const result = formatToolCallPlain("bash", { command: longCmd });
    assert.ok(result.startsWith("$ "));
    assert.ok(result.endsWith("..."));
  });

  it("formats read tool call", () => {
    const result = formatToolCallPlain("read", { file_path: "/tmp/test.ts" });
    assert.equal(result, "read /tmp/test.ts");
  });

  it("formats read with offset/limit", () => {
    const result = formatToolCallPlain("read", {
      file_path: "/tmp/test.ts",
      offset: 10,
      limit: 20,
    });
    assert.equal(result, "read /tmp/test.ts:10-29");
  });

  it("formats write tool call", () => {
    const result = formatToolCallPlain("write", {
      file_path: "/tmp/test.ts",
      content: "line1\nline2\nline3",
    });
    assert.equal(result, "write /tmp/test.ts (3 lines)");
  });

  it("formats edit tool call", () => {
    const result = formatToolCallPlain("edit", { file_path: "/tmp/test.ts" });
    assert.equal(result, "edit /tmp/test.ts");
  });

  it("formats ls tool call", () => {
    const result = formatToolCallPlain("ls", { path: "/tmp" });
    assert.equal(result, "ls /tmp");
  });

  it("formats unknown tool call", () => {
    const result = formatToolCallPlain("custom_tool", { x: 1 });
    assert.ok(result.startsWith("custom_tool "));
  });

  it("formats bash with empty command", () => {
    const result = formatToolCallPlain("bash", {});
    assert.equal(result, "$ ...");
  });

  it("formats read with offset only (no limit)", () => {
    const result = formatToolCallPlain("read", { file_path: "/tmp/test.ts", offset: 5 });
    assert.equal(result, "read /tmp/test.ts:5");
  });

  it("formats read with limit only (no offset)", () => {
    const result = formatToolCallPlain("read", { file_path: "/tmp/test.ts", limit: 10 });
    assert.equal(result, "read /tmp/test.ts:1-10");
  });

  it("formats read with path arg instead of file_path", () => {
    const result = formatToolCallPlain("read", { path: "/tmp/test.ts" });
    assert.equal(result, "read /tmp/test.ts");
  });

  it("formats write with single line content", () => {
    const result = formatToolCallPlain("write", { file_path: "/tmp/test.ts", content: "single" });
    assert.equal(result, "write /tmp/test.ts");
  });

  it("formats write with path arg", () => {
    const result = formatToolCallPlain("write", { path: "/tmp/test.ts", content: "a\nb" });
    assert.equal(result, "write /tmp/test.ts (2 lines)");
  });

  it("formats edit with path arg", () => {
    const result = formatToolCallPlain("edit", { path: "/tmp/test.ts" });
    assert.equal(result, "edit /tmp/test.ts");
  });

  it("formats ls with default path", () => {
    const result = formatToolCallPlain("ls", {});
    assert.equal(result, "ls .");
  });

  it("truncates long unknown tool call args", () => {
    const result = formatToolCallPlain("custom", { data: "x".repeat(100) });
    assert.ok(result.endsWith("..."));
  });

  it("formats read with no file_path and no path (falls to ...)", () => {
    const result = formatToolCallPlain("read", {});
    assert.equal(result, "read ...");
  });

  it("formats write with no file_path and no path (falls to ...)", () => {
    const result = formatToolCallPlain("write", { content: "test" });
    assert.equal(result, "write ...");
  });

  it("formats write with no content (falls to empty string)", () => {
    const result = formatToolCallPlain("write", { file_path: "/tmp/test.ts" });
    assert.equal(result, "write /tmp/test.ts");
  });

  it("formats edit with no file_path and no path (falls to ...)", () => {
    const result = formatToolCallPlain("edit", {});
    assert.equal(result, "edit ...");
  });

  it("shortens home directory paths", () => {
    const home = os.homedir();
    const result = formatToolCallPlain("read", { file_path: `${home}/projects/test.ts` });
    assert.equal(result, "read ~/projects/test.ts");
  });
});

// ━━━ resolveContextWindow ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveContextWindow", () => {
  it("returns fallback when no modelRegistry", () => {
    const result = resolveContextWindow({ model: { contextWindow: 128000 } }, "some-model");
    assert.equal(result, 128000);
  });

  it("returns fallback when modelRegistry has no getAll function", () => {
    const result = resolveContextWindow(
      {
        model: { contextWindow: 64000 },
        modelRegistry: {} as {
          getAll: () => Array<{ provider: string; id: string; contextWindow?: number }>;
        },
      },
      "some-model",
    );
    assert.equal(result, 64000);
  });

  it("returns fallback when modelRef is not provided", () => {
    const result = resolveContextWindow({
      model: { contextWindow: 100000 },
      modelRegistry: {
        getAll: () => [{ provider: "anthropic", id: "claude-opus", contextWindow: 200000 }],
      },
    });
    assert.equal(result, 100000);
  });

  it("resolves by exact provider/id match", () => {
    const result = resolveContextWindow(
      {
        model: { contextWindow: 50000 },
        modelRegistry: {
          getAll: () => [
            { provider: "anthropic", id: "claude-opus", contextWindow: 200000 },
            { provider: "openai", id: "gpt-4", contextWindow: 128000 },
          ],
        },
      },
      "anthropic/claude-opus",
    );
    assert.equal(result, 200000);
  });

  it("resolves by id only when no provider match", () => {
    const result = resolveContextWindow(
      {
        model: { contextWindow: 50000 },
        modelRegistry: {
          getAll: () => [{ provider: "anthropic", id: "claude-opus", contextWindow: 200000 }],
        },
      },
      "claude-opus",
    );
    assert.equal(result, 200000);
  });

  it("returns fallback when no model matches in registry", () => {
    const result = resolveContextWindow(
      {
        model: { contextWindow: 50000 },
        modelRegistry: {
          getAll: () => [{ provider: "anthropic", id: "claude-opus", contextWindow: 200000 }],
        },
      },
      "nonexistent-model",
    );
    assert.equal(result, 50000);
  });

  it("falls back to id search when provider match has no contextWindow", () => {
    // Exact provider/id match exists but has no contextWindow.
    // byId also finds the same first entry (no contextWindow), so returns fallback.
    const result = resolveContextWindow(
      {
        model: { contextWindow: 50000 },
        modelRegistry: {
          getAll: () => [
            { provider: "anthropic", id: "claude-opus" }, // exact match, no contextWindow
          ],
        },
      },
      "anthropic/claude-opus",
    );
    assert.equal(result, 50000);
  });

  it("falls through to byId when provider differs but id matches", () => {
    // modelRef has provider "anthropic" but no exact provider match in registry.
    // byId finds the matching id with a different provider.
    const result = resolveContextWindow(
      {
        model: { contextWindow: 50000 },
        modelRegistry: {
          getAll: () => [{ provider: "other", id: "claude-opus", contextWindow: 300000 }],
        },
      },
      "anthropic/claude-opus",
    );
    assert.equal(result, 300000);
  });

  it("returns fallback when id match has no contextWindow", () => {
    const result = resolveContextWindow(
      {
        model: { contextWindow: 50000 },
        modelRegistry: {
          getAll: () => [
            { provider: "other", id: "claude-opus" }, // no contextWindow
          ],
        },
      },
      "claude-opus",
    );
    assert.equal(result, 50000);
  });

  it("returns undefined when no fallback and no match", () => {
    const result = resolveContextWindow(
      {
        modelRegistry: {
          getAll: () => [],
        },
      },
      "unknown",
    );
    assert.equal(result, undefined);
  });
});

// ━━━ formatToolCall (themed) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatToolCall", () => {
  const themeFg = (_color: string, text: string) => text;

  it("formats bash tool call", () => {
    const result = formatToolCall("bash", { command: "ls -la" }, themeFg);
    assert.equal(result, "$ ls -la");
  });

  it("truncates long bash command", () => {
    const longCmd = "a".repeat(100);
    const result = formatToolCall("bash", { command: longCmd }, themeFg);
    assert.ok(result.endsWith("..."));
  });

  it("formats bash with empty command", () => {
    const result = formatToolCall("bash", {}, themeFg);
    assert.equal(result, "$ ...");
  });

  it("formats read without offset/limit", () => {
    const result = formatToolCall("read", { file_path: "/tmp/test.ts" }, themeFg);
    assert.equal(result, "read /tmp/test.ts");
  });

  it("formats read with offset and limit", () => {
    const result = formatToolCall(
      "read",
      { file_path: "/tmp/test.ts", offset: 10, limit: 20 },
      themeFg,
    );
    assert.equal(result, "read /tmp/test.ts:10-29");
  });

  it("formats read with offset only", () => {
    const result = formatToolCall("read", { file_path: "/tmp/test.ts", offset: 5 }, themeFg);
    assert.equal(result, "read /tmp/test.ts:5");
  });

  it("formats read with limit only", () => {
    const result = formatToolCall("read", { file_path: "/tmp/test.ts", limit: 10 }, themeFg);
    assert.equal(result, "read /tmp/test.ts:1-10");
  });

  it("formats write with multiline content", () => {
    const result = formatToolCall(
      "write",
      { file_path: "/tmp/test.ts", content: "a\nb\nc" },
      themeFg,
    );
    assert.equal(result, "write /tmp/test.ts (3 lines)");
  });

  it("formats write with single line content", () => {
    const result = formatToolCall(
      "write",
      { file_path: "/tmp/test.ts", content: "single" },
      themeFg,
    );
    assert.equal(result, "write /tmp/test.ts");
  });

  it("formats write with no file_path and no path (falls to ...)", () => {
    const result = formatToolCall("write", { content: "test" }, themeFg);
    assert.equal(result, "write ...");
  });

  it("formats write with no content (falls to empty string)", () => {
    const result = formatToolCall("write", { file_path: "/tmp/test.ts" }, themeFg);
    assert.equal(result, "write /tmp/test.ts");
  });

  it("formats edit with no file_path and no path (falls to ...)", () => {
    const result = formatToolCall("edit", {}, themeFg);
    assert.equal(result, "edit ...");
  });

  it("formats edit tool call", () => {
    const result = formatToolCall("edit", { file_path: "/tmp/test.ts" }, themeFg);
    assert.equal(result, "edit /tmp/test.ts");
  });

  it("formats ls tool call", () => {
    const result = formatToolCall("ls", { path: "/tmp" }, themeFg);
    assert.equal(result, "ls /tmp");
  });

  it("formats ls with default path", () => {
    const result = formatToolCall("ls", {}, themeFg);
    assert.equal(result, "ls .");
  });

  it("formats unknown tool call", () => {
    const result = formatToolCall("custom", { x: 1 }, themeFg);
    assert.equal(result, 'custom {"x":1}');
  });

  it("truncates long unknown tool call args", () => {
    const result = formatToolCall("custom", { data: "x".repeat(100) }, themeFg);
    assert.ok(result.endsWith("..."));
  });

  it("shortens home directory path", () => {
    const home = os.homedir();
    const result = formatToolCall("read", { file_path: `${home}/projects/test.ts` }, themeFg);
    assert.ok(result.includes("~/projects/test.ts"));
  });

  it("formats read with path arg fallback", () => {
    const result = formatToolCall("read", { path: "/tmp/test.ts" }, themeFg);
    assert.equal(result, "read /tmp/test.ts");
  });

  it("formats write with path arg fallback", () => {
    const result = formatToolCall("write", { path: "/tmp/test.ts", content: "a\nb" }, themeFg);
    assert.equal(result, "write /tmp/test.ts (2 lines)");
  });

  it("formats edit with path arg fallback", () => {
    const result = formatToolCall("edit", { path: "/tmp/test.ts" }, themeFg);
    assert.equal(result, "edit /tmp/test.ts");
  });
});

// ━━━ sliceToDisplayWidth edge cases ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("sliceToDisplayWidth (via truncateText)", () => {
  it("handles zero-width characters (e.g., combining marks)", () => {
    // A combining character (e.g. U+0301 combining acute accent) has 0 display width
    // "e\u0301" is e + combining accent = "é"
    const result = truncateText("e\u0301test", 3);
    // Should handle gracefully without crashing
    assert.ok(typeof result === "string");
  });

  it("handles empty string with max > 0", () => {
    const result = truncateText("", 10);
    assert.equal(result, "");
  });

  it("handles max <= 0", () => {
    assert.equal(truncateText("hello", 0), "");
    assert.equal(truncateText("hello", -5), "");
  });

  it("handles zero-width joiners and variation selectors", () => {
    // Zero-width joiner (U+200D) has 0 visible width
    const zwj = "\u200D";
    const result = truncateText(`a${zwj}b`, 2);
    assert.ok(typeof result === "string");
    // The zero-width joiner should be included without counting toward width
  });

  it("includes zero-width segments (BOM) without counting toward width", () => {
    // BOM (U+FEFF) is a standalone grapheme with 0 visible width
    // It should be included in the result without counting toward the display width
    const bom = "\uFEFF";
    const text = `${bom}abc`;
    const result = truncateText(text, 2);
    // maxWidth=2, so we get BOM (0 width) + a (1) + b (1) = "﻿ab"
    assert.ok(result.includes(bom));
    assert.ok(result.includes("a"));
    assert.ok(result.includes("b"));
    assert.ok(!result.includes("c"));
  });
});

// ━━━ agentBgIndex ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("agentBgIndex", () => {
  it("returns a number within palette range", () => {
    const index = agentBgIndex("planner");
    assert.ok(index >= 0);
    assert.ok(index < 10); // AGENT_NAME_PALETTE has 10 entries
  });

  it("is deterministic", () => {
    assert.equal(agentBgIndex("worker"), agentBgIndex("worker"));
  });

  it("different names may produce different indices", () => {
    // Not guaranteed, but highly likely for different names
    const i1 = agentBgIndex("planner");
    const i2 = agentBgIndex("reviewer");
    // Just verify both are valid — they might collide, that's OK
    assert.ok(i1 >= 0 && i1 < 10);
    assert.ok(i2 >= 0 && i2 < 10);
  });

  it("handles empty string", () => {
    const index = agentBgIndex("");
    assert.equal(index, 0);
  });
});

// ━━━ formatPathValueForPreview (via formatToolCall) ━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatPathValueForPreview edge cases", () => {
  const themeFg = (_color: string, text: string) => text;

  it("handles null file_path", () => {
    const result = formatToolCall("read", { file_path: null }, themeFg);
    assert.ok(result.includes("..."));
  });

  it("handles undefined file_path", () => {
    const result = formatToolCall("read", {}, themeFg);
    assert.ok(result.includes("..."));
  });

  it("handles numeric file_path", () => {
    const result = formatToolCall("read", { file_path: 42 }, themeFg);
    assert.ok(result.includes("42"));
  });

  it("handles null path for ls (falls back to '.')", () => {
    const result = formatToolCall("ls", { path: null }, themeFg);
    assert.equal(result, "ls .");
  });
});
