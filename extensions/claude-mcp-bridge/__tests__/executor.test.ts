import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import type { Text } from "@mariozechner/pi-tui";
import { LARGE_PAYLOAD_THRESHOLD_CHARS } from "../core/constants.js";
import { executeMcpToolCall, renderMcpToolCall } from "../core/executor.js";
import type { McpManager } from "../core/manager.js";
import type { DiscoveredTool } from "../core/types.js";

// Text stores its raw string in a private `text` field (TypeScript private is
// a compile-time fence — the field still exists at runtime). Reading it lets
// tests assert exactly what renderMcpToolCall produced.
function readTextValue(t: Text): string {
  return (t as unknown as { text: string }).text;
}

// ━━━ Test cleanup ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

afterEach(() => {
  // Clean up any payload/image files the executor spills into tmpdir.
  const entries = fs.readdirSync(os.tmpdir());
  for (const entry of entries) {
    if (entry.startsWith("mcp-payload-") || entry.startsWith("mcp-image-")) {
      try {
        fs.unlinkSync(path.join(os.tmpdir(), entry));
      } catch {
        // ignore
      }
    }
  }
});

// ━━━ Theme stub for renderMcpToolCall ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ThemeStub {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

function plainTheme(): ThemeStub {
  return { fg: (_c, t) => t, bold: (t) => t };
}

function taggedTheme(): ThemeStub {
  return {
    fg: (color, text) => `<${color}>${text}</${color}>`,
    bold: (text) => `[B]${text}[/B]`,
  };
}

function asTheme(t: ThemeStub): Parameters<typeof renderMcpToolCall>[3] {
  return t as unknown as Parameters<typeof renderMcpToolCall>[3];
}

// ━━━ McpManager stub for executeMcpToolCall ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface FakeManager {
  callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<unknown>;
  calls: {
    serverName: string;
    toolName: string;
    args: Record<string, unknown>;
  }[];
}

function makeFakeManager(result: unknown | (() => unknown | Promise<unknown>)): FakeManager {
  const m: FakeManager = {
    calls: [],
    async callTool(serverName, toolName, args) {
      m.calls.push({ serverName, toolName, args });
      if (typeof result === "function") {
        return (result as () => unknown | Promise<unknown>)();
      }
      return result;
    },
  };
  return m;
}

function asManager(m: FakeManager): McpManager {
  return m as unknown as McpManager;
}

function tool(name: string): DiscoveredTool {
  return { name, inputSchema: { type: "object" } };
}

// ━━━ renderMcpToolCall ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("renderMcpToolCall", () => {
  it("renders the server/tool label with no args suffix for empty args", () => {
    const text = renderMcpToolCall("srv", "toolA", {}, asTheme(plainTheme()));
    assert.equal(readTextValue(text), "srv/toolA");
  });

  it("renders label with the first string arg appended in accent color", () => {
    const text = renderMcpToolCall("srv", "toolA", { query: "hello" }, asTheme(taggedTheme()));
    assert.match(readTextValue(text), /<toolTitle>\[B\]srv\/toolA\[\/B\]<\/toolTitle>/);
    assert.match(readTextValue(text), /<accent>hello<\/accent>/);
  });

  it("stringifies non-string first arg values", () => {
    const text = renderMcpToolCall("srv", "toolA", { count: 42 }, asTheme(plainTheme()));
    assert.match(readTextValue(text), /srv\/toolA 42/);
  });

  it("truncates long first arg values to 80 chars with an ellipsis", () => {
    const longStr = "a".repeat(120);
    const text = renderMcpToolCall("srv", "toolA", { query: longStr }, asTheme(plainTheme()));
    // 77 a's + single-char ellipsis suffix
    assert.match(readTextValue(text), /a{77}…/);
  });

  it("keeps exactly 80-char values intact (edge of truncation)", () => {
    const exact = "b".repeat(80);
    const text = renderMcpToolCall("srv", "toolA", { val: exact }, asTheme(plainTheme()));
    assert.match(readTextValue(text), /b{80}(?!…)/);
  });

  it("shows +N when there are multiple args", () => {
    const text = renderMcpToolCall(
      "srv",
      "toolA",
      { a: "x", b: "y", c: "z" },
      asTheme(taggedTheme()),
    );
    assert.match(readTextValue(text), /<muted> \+2<\/muted>/);
  });

  it("skips undefined and null arg values when picking the first", () => {
    const text = renderMcpToolCall(
      "srv",
      "toolA",
      { skipA: undefined, skipB: null, keep: "present" },
      asTheme(plainTheme()),
    );
    assert.match(readTextValue(text), /srv\/toolA present/);
  });

  it("treats args === null/undefined as empty", () => {
    const t1 = renderMcpToolCall("srv", "t", null, asTheme(plainTheme()));
    assert.equal(readTextValue(t1), "srv/t");
    const t2 = renderMcpToolCall("srv", "t", undefined, asTheme(plainTheme()));
    assert.equal(readTextValue(t2), "srv/t");
  });

  it("returns the label alone when all args are undefined/null", () => {
    const text = renderMcpToolCall("srv", "t", { a: undefined, b: null }, asTheme(plainTheme()));
    assert.equal(readTextValue(text), "srv/t");
  });
});

// ━━━ executeMcpToolCall: happy path ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("executeMcpToolCall", () => {
  it("calls the manager and returns formatted content with details", async () => {
    const manager = makeFakeManager({
      content: [{ type: "text", text: "line1\nline2" }],
    });
    const result = await executeMcpToolCall({
      manager: asManager(manager),
      serverName: "srv",
      tool: tool("t"),
      params: { foo: "bar" },
      isToolDisabled: () => false,
    });

    assert.equal(manager.calls.length, 1);
    assert.deepEqual(manager.calls[0], {
      serverName: "srv",
      toolName: "t",
      args: { foo: "bar" },
    });
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0]?.text, "line1\nline2");
    assert.equal(result.details.server, "srv");
    assert.equal(result.details.tool, "t");
    assert.equal(result.details.isError, false);
    assert.equal(result.details.payloadTruncated, false);
    assert.equal(result.details.payloadOriginalLength, "line1\nline2".length);
    // Small payload → raw preserved
    assert.deepEqual(result.details.raw, {
      content: [{ type: "text", text: "line1\nline2" }],
    });
  });

  it("drops raw and sets payloadFilePath when result text exceeds the large payload threshold", async () => {
    const big = "x".repeat(LARGE_PAYLOAD_THRESHOLD_CHARS + 100);
    const manager = makeFakeManager({
      content: [{ type: "text", text: big }],
    });
    const result = await executeMcpToolCall({
      manager: asManager(manager),
      serverName: "srv",
      tool: tool("t"),
      params: {},
      isToolDisabled: () => false,
    });

    assert.equal(result.details.payloadTruncated, true);
    assert.equal(result.details.raw, undefined);
    assert.ok(result.details.payloadFilePath);
    assert.ok(fs.existsSync(result.details.payloadFilePath as string));
  });

  it("propagates isError from the manager result", async () => {
    const manager = makeFakeManager({
      content: [{ type: "text", text: "oops" }],
      isError: true,
    });
    const result = await executeMcpToolCall({
      manager: asManager(manager),
      serverName: "srv",
      tool: tool("t"),
      params: {},
      isToolDisabled: () => false,
    });
    assert.equal(result.details.isError, true);
  });

  it("converts manager rejections into error content", async () => {
    const manager = makeFakeManager(() => {
      throw new Error("transport lost");
    });
    const result = await executeMcpToolCall({
      manager: asManager(manager),
      serverName: "srv",
      tool: tool("t"),
      params: {},
      isToolDisabled: () => false,
    });
    assert.equal(result.content[0]?.text, "MCP error: transport lost");
    assert.equal(result.details.isError, true);
    assert.equal(result.details.error, "transport lost");
  });

  it("stringifies non-Error rejection values", async () => {
    const manager = makeFakeManager(() => {
      throw "string-fail";
    });
    const result = await executeMcpToolCall({
      manager: asManager(manager),
      serverName: "srv",
      tool: tool("t"),
      params: {},
      isToolDisabled: () => false,
    });
    assert.equal(result.content[0]?.text, "MCP error: string-fail");
    assert.equal(result.details.error, "string-fail");
  });
});

// ━━━ executeMcpToolCall: cancellation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("executeMcpToolCall cancellation", () => {
  it("short-circuits to a cancelled result when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const manager = makeFakeManager(() => {
      throw new Error("should not be called");
    });
    const result = await executeMcpToolCall({
      manager: asManager(manager),
      serverName: "srv",
      tool: tool("t"),
      params: {},
      signal: controller.signal,
      isToolDisabled: () => false,
    });
    assert.equal(result.details.cancelled, true);
    assert.equal(result.content[0]?.text, "Cancelled");
    assert.equal(manager.calls.length, 0);
  });

  it("runs normally when a non-aborted signal is passed", async () => {
    const controller = new AbortController();
    const manager = makeFakeManager("ok");
    const result = await executeMcpToolCall({
      manager: asManager(manager),
      serverName: "srv",
      tool: tool("t"),
      params: {},
      signal: controller.signal,
      isToolDisabled: () => false,
    });
    assert.equal(result.details.cancelled, undefined);
    assert.equal(manager.calls.length, 1);
  });
});

// ━━━ executeMcpToolCall: disabled gate ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("executeMcpToolCall disabled gate", () => {
  it("returns the disabled result without calling the manager", async () => {
    const manager = makeFakeManager(() => {
      throw new Error("should not be called");
    });
    const result = await executeMcpToolCall({
      manager: asManager(manager),
      serverName: "srv",
      tool: tool("blocked"),
      params: {},
      isToolDisabled: (s, t) => s === "srv" && t === "blocked",
    });
    assert.equal(result.details.disabled, true);
    assert.equal(result.details.isError, true);
    assert.match(result.content[0]?.text ?? "", /This MCP tool is disabled/);
    assert.equal(manager.calls.length, 0);
  });

  it("passes the server and tool name pair to isToolDisabled", async () => {
    const seen: { s: string; t: string }[] = [];
    const manager = makeFakeManager("ok");
    await executeMcpToolCall({
      manager: asManager(manager),
      serverName: "srv-a",
      tool: tool("tool-x"),
      params: {},
      isToolDisabled: (s, t) => {
        seen.push({ s, t });
        return false;
      },
    });
    assert.deepEqual(seen, [{ s: "srv-a", t: "tool-x" }]);
  });
});
