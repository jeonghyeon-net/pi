import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { McpManager } from "../core/manager.js";
import { registerDiscoveredTools } from "../core/registry.js";
import { buildPiToolName } from "../core/tool-naming.js";
import type { DiscoveredTool } from "../core/types.js";

// ━━━ Types copied from ExtensionAPI.registerTool for stubbing ━━━━━━━━━━━

// We don't need to model the full ToolDefinition generic soup — these are the
// fields the registry actually sets and the ones our tests inspect.
interface CapturedToolDef {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  renderCall: (args: unknown, theme: unknown) => unknown;
  renderResult: (result: unknown, options: unknown, theme: unknown) => unknown;
  execute: (
    toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: ((partial: unknown) => void) | undefined,
  ) => Promise<unknown>;
}

interface FakePi {
  registered: CapturedToolDef[];
  registerTool(def: CapturedToolDef): void;
}

function makeFakePi(): FakePi {
  const pi: FakePi = {
    registered: [],
    registerTool(def) {
      pi.registered.push(def);
    },
  };
  return pi;
}

function asPi(p: FakePi): ExtensionAPI {
  return p as unknown as ExtensionAPI;
}

// ━━━ Manager stub ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface FakeManager {
  all: { serverName: string; tool: DiscoveredTool }[];
  callToolResult: unknown;
  callToolCalls: { server: string; tool: string; args: Record<string, unknown> }[];
  getAllTools(): { serverName: string; tool: DiscoveredTool }[];
  callTool(server: string, toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

function makeFakeManager(
  tools: { serverName: string; tool: DiscoveredTool }[],
  callToolResult: unknown = { content: [{ type: "text", text: "result" }] },
): FakeManager {
  const m: FakeManager = {
    all: tools,
    callToolResult,
    callToolCalls: [],
    getAllTools() {
      return this.all;
    },
    async callTool(server, toolName, args) {
      this.callToolCalls.push({ server, tool: toolName, args });
      return this.callToolResult;
    },
  };
  return m;
}

function asManager(m: FakeManager): McpManager {
  return m as unknown as McpManager;
}

function tool(name: string, description?: string): DiscoveredTool {
  return {
    name,
    ...(description ? { description } : {}),
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
    },
  };
}

// ━━━ Theme stub ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function themeStub(): unknown {
  return {
    fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
    bold: (text: string) => `[B]${text}[/B]`,
  };
}

// ━━━ registerDiscoveredTools ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("registerDiscoveredTools", () => {
  it("registers each tool with the MCP prefixed name", () => {
    const manager = makeFakeManager([
      { serverName: "srv", tool: tool("list", "list things") },
      { serverName: "srv", tool: tool("create") },
    ]);
    const pi = makeFakePi();
    const registered = new Set<string>();

    registerDiscoveredTools({
      manager: asManager(manager),
      pi: asPi(pi),
      registeredTools: registered,
      isToolDisabled: () => false,
    });

    assert.equal(pi.registered.length, 2);
    const names = pi.registered.map((r) => r.name).sort();
    assert.deepEqual(names, [buildPiToolName("srv", "create"), buildPiToolName("srv", "list")]);
    assert.equal(registered.size, 2);
  });

  it("uses tool.description when present and falls back otherwise", () => {
    const manager = makeFakeManager([
      { serverName: "srv", tool: tool("withDesc", "a good tool") },
      { serverName: "srv", tool: tool("noDesc") },
    ]);
    const pi = makeFakePi();

    registerDiscoveredTools({
      manager: asManager(manager),
      pi: asPi(pi),
      registeredTools: new Set(),
      isToolDisabled: () => false,
    });

    const byName = Object.fromEntries(pi.registered.map((r) => [r.name, r]));
    assert.equal(byName[buildPiToolName("srv", "withDesc")]?.description, "a good tool");
    assert.equal(byName[buildPiToolName("srv", "noDesc")]?.description, "MCP tool srv/noDesc");
  });

  it("labels each tool as 'MCP <server>/<tool>'", () => {
    const manager = makeFakeManager([{ serverName: "srvA", tool: tool("getThing") }]);
    const pi = makeFakePi();

    registerDiscoveredTools({
      manager: asManager(manager),
      pi: asPi(pi),
      registeredTools: new Set(),
      isToolDisabled: () => false,
    });

    assert.equal(pi.registered[0]?.label, "MCP srvA/getThing");
  });

  it("skips tools marked disabled by the visibility predicate", () => {
    const manager = makeFakeManager([
      { serverName: "srv", tool: tool("shown") },
      { serverName: "srv", tool: tool("hidden") },
    ]);
    const pi = makeFakePi();

    registerDiscoveredTools({
      manager: asManager(manager),
      pi: asPi(pi),
      registeredTools: new Set(),
      isToolDisabled: (s, t) => s === "srv" && t === "hidden",
    });

    assert.equal(pi.registered.length, 1);
    assert.equal(pi.registered[0]?.name, buildPiToolName("srv", "shown"));
  });

  it("does not re-register a tool that is already in registeredTools", () => {
    const manager = makeFakeManager([
      { serverName: "srv", tool: tool("t1") },
      { serverName: "srv", tool: tool("t2") },
    ]);
    const pi = makeFakePi();
    const registered = new Set<string>([buildPiToolName("srv", "t1")]);

    registerDiscoveredTools({
      manager: asManager(manager),
      pi: asPi(pi),
      registeredTools: registered,
      isToolDisabled: () => false,
    });

    assert.equal(pi.registered.length, 1);
    assert.equal(pi.registered[0]?.name, buildPiToolName("srv", "t2"));
    assert.equal(registered.size, 2);
  });

  it("is idempotent: calling twice yields no duplicate registrations", () => {
    const manager = makeFakeManager([{ serverName: "srv", tool: tool("t1") }]);
    const pi = makeFakePi();
    const registered = new Set<string>();

    registerDiscoveredTools({
      manager: asManager(manager),
      pi: asPi(pi),
      registeredTools: registered,
      isToolDisabled: () => false,
    });
    registerDiscoveredTools({
      manager: asManager(manager),
      pi: asPi(pi),
      registeredTools: registered,
      isToolDisabled: () => false,
    });

    assert.equal(pi.registered.length, 1);
  });

  it("builds parameters from the tool's inputSchema via createParameterSchema", () => {
    const manager = makeFakeManager([
      {
        serverName: "srv",
        tool: {
          name: "withSchema",
          inputSchema: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
        },
      },
    ]);
    const pi = makeFakePi();

    registerDiscoveredTools({
      manager: asManager(manager),
      pi: asPi(pi),
      registeredTools: new Set(),
      isToolDisabled: () => false,
    });

    const def = pi.registered[0];
    assert.ok(def);
    // createParameterSchema returns a typebox-like object. It should at least
    // declare object type and include query.
    assert.equal(def.parameters.type, "object");
    const properties = def.parameters.properties as Record<string, unknown>;
    assert.ok(properties.query);
  });
});

// ━━━ renderCall / renderResult on registered tools ━━━━━━━━━━━━━━━━━━━━━

describe("registerDiscoveredTools: renderCall", () => {
  it("renders the MCP label via renderMcpToolCall", () => {
    const manager = makeFakeManager([{ serverName: "srv", tool: tool("t1") }]);
    const pi = makeFakePi();
    registerDiscoveredTools({
      manager: asManager(manager),
      pi: asPi(pi),
      registeredTools: new Set(),
      isToolDisabled: () => false,
    });

    const def = pi.registered[0];
    assert.ok(def);
    const rendered = def.renderCall({ query: "hi" }, themeStub()) as { text: string };
    assert.match(rendered.text, /srv\/t1/);
    assert.match(rendered.text, /hi/);
  });
});

describe("registerDiscoveredTools: renderResult", () => {
  function getRenderResult(
    toolName: string,
  ): (result: unknown, options: unknown, theme: unknown) => unknown {
    const manager = makeFakeManager([{ serverName: "srv", tool: tool(toolName) }]);
    const pi = makeFakePi();
    registerDiscoveredTools({
      manager: asManager(manager),
      pi: asPi(pi),
      registeredTools: new Set(),
      isToolDisabled: () => false,
    });
    const def = pi.registered[0];
    assert.ok(def);
    return def.renderResult;
  }

  it("collapsed: shows ' → N lines' muted summary when there is text content", () => {
    const renderResult = getRenderResult("t");
    const out = renderResult(
      { content: [{ type: "text", text: "line1\nline2\nline3" }] },
      { expanded: false },
      themeStub(),
    ) as { text: string };
    assert.match(out.text, /→ 3 lines/);
    assert.match(out.text, /<muted>/);
  });

  it("collapsed: returns empty Text when no text content", () => {
    const renderResult = getRenderResult("t");
    const out = renderResult({ content: [] }, { expanded: false }, themeStub()) as { text: string };
    assert.equal(out.text, "");
  });

  it("collapsed: returns empty when text is blank (0 non-empty lines)", () => {
    const renderResult = getRenderResult("t");
    const out = renderResult(
      { content: [{ type: "text", text: "   \n   " }] },
      { expanded: false },
      themeStub(),
    ) as { text: string };
    assert.equal(out.text, "");
  });

  it("expanded: colors every output line with toolOutput", () => {
    const renderResult = getRenderResult("t");
    const out = renderResult(
      { content: [{ type: "text", text: "first\nsecond" }] },
      { expanded: true },
      themeStub(),
    ) as { text: string };
    assert.match(out.text, /<toolOutput>first<\/toolOutput>/);
    assert.match(out.text, /<toolOutput>second<\/toolOutput>/);
    assert.ok(out.text.startsWith("\n"));
  });

  it("expanded: returns empty when there is no text content", () => {
    const renderResult = getRenderResult("t");
    const out = renderResult(
      { content: [{ type: "image", data: "xxx" }] },
      { expanded: true },
      themeStub(),
    ) as { text: string };
    assert.equal(out.text, "");
  });

  it("expanded: renders a single empty line when text is only whitespace", () => {
    // "   ".trim() → "" → split("\n") → [""] → one colored (empty) line,
    // so output is truthy and prefixed with a leading newline.
    const renderResult = getRenderResult("t");
    const out = renderResult(
      { content: [{ type: "text", text: "   " }] },
      { expanded: true },
      themeStub(),
    ) as { text: string };
    assert.equal(out.text, "\n<toolOutput></toolOutput>");
  });

  it("expanded: returns empty Text when identity theme yields empty output", () => {
    // With an identity theme (matches the real Theme's behavior for empty
    // strings: theme.fg(color, "") === ""), whitespace-only text → join("") is
    // empty, hitting the falsy branch of the final ternary.
    const identityTheme = { fg: (_c: string, t: string) => t, bold: (t: string) => t };
    const renderResult = getRenderResult("t");
    const out = renderResult(
      { content: [{ type: "text", text: "   " }] },
      { expanded: true },
      identityTheme,
    ) as { text: string };
    assert.equal(out.text, "");
  });
});

// ━━━ execute wiring ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("registerDiscoveredTools: execute", () => {
  it("emits a running update and delegates to executeMcpToolCall", async () => {
    const manager = makeFakeManager([{ serverName: "srv", tool: tool("exec") }], {
      content: [{ type: "text", text: "done" }],
    });
    const pi = makeFakePi();
    registerDiscoveredTools({
      manager: asManager(manager),
      pi: asPi(pi),
      registeredTools: new Set(),
      isToolDisabled: () => false,
    });

    const def = pi.registered[0];
    assert.ok(def);

    const updates: unknown[] = [];
    const final = await def.execute("call-1", { any: "param" }, undefined, (partial) =>
      updates.push(partial),
    );

    // One progress update with server/tool/status in details.
    assert.equal(updates.length, 1);
    const firstUpdate = updates[0] as {
      content: { type: string; text: string }[];
      details: { server: string; tool: string; status: string };
    };
    assert.equal(firstUpdate.details.server, "srv");
    assert.equal(firstUpdate.details.tool, "exec");
    assert.equal(firstUpdate.details.status, "running");
    assert.match(firstUpdate.content[0]?.text ?? "", /Calling MCP srv\/exec/);

    // Manager was called exactly once with the params.
    assert.equal(manager.callToolCalls.length, 1);
    assert.deepEqual(manager.callToolCalls[0], {
      server: "srv",
      tool: "exec",
      args: { any: "param" },
    });

    // Final result is the formatted tool result.
    const finalResult = final as { content: { type: string; text: string }[] };
    assert.equal(finalResult.content[0]?.text, "done");
  });

  it("passes the abort signal through to executeMcpToolCall", async () => {
    const manager = makeFakeManager([{ serverName: "srv", tool: tool("t") }], {
      content: [{ type: "text", text: "noop" }],
    });
    const pi = makeFakePi();
    registerDiscoveredTools({
      manager: asManager(manager),
      pi: asPi(pi),
      registeredTools: new Set(),
      isToolDisabled: () => false,
    });
    const def = pi.registered[0];
    assert.ok(def);

    const controller = new AbortController();
    controller.abort();
    const result = (await def.execute("call-1", {}, controller.signal, undefined)) as {
      details: { cancelled?: boolean };
    };
    assert.equal(result.details.cancelled, true);
    // Manager should not have been called because execute returns cancelled.
    assert.equal(manager.callToolCalls.length, 0);
  });

  it("passes isToolDisabled through so newly-disabled tools return the disabled result", async () => {
    const manager = makeFakeManager([{ serverName: "srv", tool: tool("t") }], {
      content: [{ type: "text", text: "noop" }],
    });
    const pi = makeFakePi();
    let disabled = false;
    registerDiscoveredTools({
      manager: asManager(manager),
      pi: asPi(pi),
      registeredTools: new Set(),
      // Captured by closure — registry.ts must call it on every execute() so
      // changes propagate without re-registration.
      isToolDisabled: () => disabled,
    });
    const def = pi.registered[0];
    assert.ok(def);

    // First call: enabled.
    await def.execute("call-1", {}, undefined, undefined);
    assert.equal(manager.callToolCalls.length, 1);

    // Flip to disabled and call again: manager must NOT be called.
    disabled = true;
    const second = (await def.execute("call-2", {}, undefined, undefined)) as {
      details: { disabled?: boolean };
    };
    assert.equal(second.details.disabled, true);
    assert.equal(manager.callToolCalls.length, 1);
  });

  it("does not throw when onUpdate is omitted", async () => {
    const manager = makeFakeManager([{ serverName: "srv", tool: tool("t") }], {
      content: [{ type: "text", text: "noop" }],
    });
    const pi = makeFakePi();
    registerDiscoveredTools({
      manager: asManager(manager),
      pi: asPi(pi),
      registeredTools: new Set(),
      isToolDisabled: () => false,
    });
    const def = pi.registered[0];
    assert.ok(def);
    await assert.doesNotReject(() => def.execute("call-1", {}, undefined, undefined));
  });
});
