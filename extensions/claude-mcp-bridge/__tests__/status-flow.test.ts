import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { McpManager } from "../core/manager.js";
import { type FlowDeps, notifyStatusSummary, openMcpStatusOverlay } from "../core/status-flow.js";
import { buildPiToolName } from "../core/tool-naming.js";
import type {
  DiscoveredTool,
  McpServerState,
  ReloadableContext,
  ServerAction,
} from "../core/types.js";
import { buildToolVisibilityKey } from "../core/visibility.js";

function noop(_value: unknown): void {
  // swallow intentionally-unused values without triggering biome's void rule.
}

// ━━━ ExtensionAPI stub ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface FakePi {
  active: string[];
  registerTool: (def: { name: string }) => void;
  registered: { name: string }[];
  getActiveTools(): string[];
  setActiveTools(tools: string[]): void;
}

function makeFakePi(initial: string[] = []): FakePi {
  const pi: FakePi = {
    active: [...initial],
    registered: [],
    registerTool(def) {
      pi.registered.push(def);
    },
    getActiveTools() {
      return [...pi.active];
    },
    setActiveTools(t) {
      pi.active = [...t];
    },
  };
  return pi;
}

function asPi(p: FakePi): ExtensionAPI {
  return p as unknown as ExtensionAPI;
}

// ━━━ McpManager stub ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface FakeManager {
  sourcePath: string | null;
  states: McpServerState[];
  allTools: { serverName: string; tool: DiscoveredTool }[];
  serverTools: Map<string, DiscoveredTool[]>;
  reconnectCalls: string[];
  reconnectOverrides: Map<string, () => void>;
  getStates(): McpServerState[];
  getAllTools(): { serverName: string; tool: DiscoveredTool }[];
  getServerTools(name: string): DiscoveredTool[];
  reconnectServer(name: string): Promise<void>;
}

function makeFakeManager(init: Partial<FakeManager> = {}): FakeManager {
  const m: FakeManager = {
    sourcePath: init.sourcePath ?? null,
    states: init.states ?? [],
    allTools: init.allTools ?? [],
    serverTools: init.serverTools ?? new Map(),
    reconnectCalls: [],
    reconnectOverrides: init.reconnectOverrides ?? new Map(),
    getStates() {
      return this.states;
    },
    getAllTools() {
      return this.allTools;
    },
    getServerTools(name) {
      return this.serverTools.get(name) ?? [];
    },
    async reconnectServer(name) {
      this.reconnectCalls.push(name);
      const override = this.reconnectOverrides.get(name);
      if (override) override();
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

function state(
  name: string,
  status: McpServerState["status"] = "connected",
  toolCount = 0,
  error?: string,
): McpServerState {
  return {
    name,
    status,
    type: "stdio",
    toolCount,
    ...(error ? { error } : {}),
  };
}

// ━━━ Visibility stub ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface FakeVisibility {
  disabled: Set<string>;
  warning: string | undefined;
  toggleResults: Map<string, { ok: true; disabled: boolean } | { ok: false; error: string }>;
  isToolDisabled(serverName: string, toolName: string): boolean;
  toggle(
    serverName: string,
    toolName: string,
  ): { ok: true; disabled: boolean } | { ok: false; error: string };
  clearWarning(): void;
  getWarning(): string | undefined;
  snapshot(): Set<string>;
  hasNewlyDisabled(before: Set<string>): boolean;
}

function makeFakeVisibility(
  init: { disabled?: Set<string>; warning?: string } = {},
): FakeVisibility {
  // Match the real controller, which captures state in closures instead of
  // `this` — so callers passing `.isToolDisabled` as a bare callback work.
  const disabled = init.disabled ?? new Set<string>();
  const toggleResults = new Map<
    string,
    { ok: true; disabled: boolean } | { ok: false; error: string }
  >();
  let warning = init.warning;
  const v: FakeVisibility = {
    disabled,
    toggleResults,
    get warning() {
      return warning;
    },
    set warning(value) {
      warning = value;
    },
    isToolDisabled: (serverName, toolName) =>
      disabled.has(buildToolVisibilityKey(serverName, toolName)),
    toggle: (serverName, toolName) => {
      const key = buildToolVisibilityKey(serverName, toolName);
      const predefined = toggleResults.get(key);
      if (predefined) return predefined;
      const nowDisabled = !disabled.has(key);
      if (nowDisabled) disabled.add(key);
      else disabled.delete(key);
      warning = undefined;
      return { ok: true, disabled: nowDisabled };
    },
    clearWarning: () => {
      warning = undefined;
    },
    getWarning: () => warning,
    snapshot: () => new Set(disabled),
    hasNewlyDisabled: (before) => {
      for (const key of disabled) {
        if (!before.has(key)) return true;
      }
      return false;
    },
  };
  return v;
}

// ━━━ Context stub ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface Notification {
  message: string;
  level: string;
}

interface CustomStep {
  value: unknown;
}

interface FakeCtx {
  hasUI: boolean;
  notifications: Notification[];
  customQueue: CustomStep[];
  customCalls: number;
  reloadCalls: number;
  ui: {
    notify(message: string, level: string): void;
    custom<T>(_factory: unknown, _opts?: unknown): Promise<T>;
  };
  reload(): Promise<void>;
}

function makeFakeCtx(customSequence: unknown[] = []): FakeCtx {
  const ctx: FakeCtx = {
    hasUI: true,
    notifications: [],
    customQueue: customSequence.map((v) => ({ value: v })),
    customCalls: 0,
    reloadCalls: 0,
    ui: {
      notify(message, level) {
        ctx.notifications.push({ message, level });
      },
      custom<T>(): Promise<T> {
        ctx.customCalls++;
        const next = ctx.customQueue.shift();
        if (!next) {
          throw new Error(`ctx.ui.custom called more times (${ctx.customCalls}) than scripted`);
        }
        return Promise.resolve(next.value as T);
      },
    },
    async reload() {
      ctx.reloadCalls++;
    },
  };
  return ctx;
}

function asCtx(c: FakeCtx): ExtensionContext {
  return c as unknown as ExtensionContext;
}

function asReloadCtx(c: FakeCtx): ReloadableContext {
  return c as unknown as ReloadableContext;
}

// ━━━ FlowDeps helper ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeDeps(opts: {
  pi: FakePi;
  manager: FakeManager;
  visibility: FakeVisibility;
  registeredTools?: Set<string>;
  overlayWarnings?: string[];
}): { deps: FlowDeps; updateStatusCalls: ExtensionContext[] } {
  const updateStatusCalls: ExtensionContext[] = [];
  const deps: FlowDeps = {
    pi: asPi(opts.pi),
    manager: asManager(opts.manager),
    visibility: opts.visibility,
    registeredTools: opts.registeredTools ?? new Set<string>(),
    getOverlayWarnings: () => opts.overlayWarnings ?? [],
    updateStatus: (ctx) => updateStatusCalls.push(ctx),
  };
  return { deps, updateStatusCalls };
}

// ━━━ notifyStatusSummary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("notifyStatusSummary", () => {
  it("emits a one-line summary of each server's status and tool count", () => {
    const manager = makeFakeManager({
      states: [state("alpha", "connected", 3), state("beta", "error", 0)],
    });
    const visibility = makeFakeVisibility();
    const pi = makeFakePi();
    const ctx = makeFakeCtx();
    const { deps } = makeDeps({ pi, manager, visibility });

    notifyStatusSummary(deps, asCtx(ctx));

    assert.equal(ctx.notifications.length, 1);
    assert.equal(ctx.notifications[0]?.level, "info");
    assert.equal(ctx.notifications[0]?.message, "MCP: alpha=connected(3), beta=error");
  });

  it("appends source path when manager.sourcePath is set", () => {
    const manager = makeFakeManager({
      sourcePath: "/path/to/mcp.json",
      states: [state("s", "connected", 1)],
    });
    const ctx = makeFakeCtx();
    const { deps } = makeDeps({
      pi: makeFakePi(),
      manager,
      visibility: makeFakeVisibility(),
    });

    notifyStatusSummary(deps, asCtx(ctx));
    assert.match(ctx.notifications[0]?.message ?? "", /source: \/path\/to\/mcp\.json/);
  });

  it("appends disabled tools count when any MCP tool is disabled", () => {
    const manager = makeFakeManager({
      states: [state("s", "connected", 2)],
      allTools: [
        { serverName: "s", tool: tool("a") },
        { serverName: "s", tool: tool("b") },
      ],
    });
    const visibility = makeFakeVisibility({
      disabled: new Set([buildToolVisibilityKey("s", "b")]),
    });
    const ctx = makeFakeCtx();
    const { deps } = makeDeps({ pi: makeFakePi(), manager, visibility });

    notifyStatusSummary(deps, asCtx(ctx));
    assert.match(ctx.notifications[0]?.message ?? "", /disabled tools: 1/);
  });

  it("omits the disabled-tools segment when nothing is disabled", () => {
    const manager = makeFakeManager({
      states: [state("s", "connected", 1)],
      allTools: [{ serverName: "s", tool: tool("a") }],
    });
    const ctx = makeFakeCtx();
    const { deps } = makeDeps({
      pi: makeFakePi(),
      manager,
      visibility: makeFakeVisibility(),
    });

    notifyStatusSummary(deps, asCtx(ctx));
    assert.doesNotMatch(ctx.notifications[0]?.message ?? "", /disabled tools/);
  });

  it("omits the tool count segment for servers with zero tools", () => {
    const manager = makeFakeManager({
      states: [state("s", "connecting", 0)],
    });
    const ctx = makeFakeCtx();
    const { deps } = makeDeps({
      pi: makeFakePi(),
      manager,
      visibility: makeFakeVisibility(),
    });

    notifyStatusSummary(deps, asCtx(ctx));
    assert.equal(ctx.notifications[0]?.message, "MCP: s=connecting");
  });
});

// ━━━ openMcpStatusOverlay: immediate dismiss ━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("openMcpStatusOverlay: dismiss without action", () => {
  it("returns without reload when no tools were disabled and no reload flag set", async () => {
    const manager = makeFakeManager({
      states: [state("s", "connected", 0)],
    });
    const visibility = makeFakeVisibility();
    const ctx = makeFakeCtx([
      null, // McpStatusOverlay → user presses ESC (no server picked)
    ]);
    const { deps } = makeDeps({
      pi: makeFakePi(),
      manager,
      visibility,
    });

    await openMcpStatusOverlay(deps, asReloadCtx(ctx), visibility.snapshot());

    assert.equal(ctx.reloadCalls, 0);
    assert.equal(ctx.notifications.length, 0);
    assert.equal(ctx.customCalls, 1);
  });

  it("triggers reload when a tool was newly disabled during the session", async () => {
    const manager = makeFakeManager({
      states: [state("s", "connected", 0)],
    });
    const visibility = makeFakeVisibility();
    const ctx = makeFakeCtx([null]);
    const { deps } = makeDeps({ pi: makeFakePi(), manager, visibility });

    // Capture an empty snapshot, then disable a tool, then dismiss.
    const before = visibility.snapshot();
    visibility.disabled.add(buildToolVisibilityKey("s", "tool1"));

    await openMcpStatusOverlay(deps, asReloadCtx(ctx), before);

    assert.equal(ctx.reloadCalls, 1);
    assert.equal(ctx.notifications.length, 1);
    assert.match(ctx.notifications[0]?.message ?? "", /Reloading runtime/);
  });
});

// ━━━ openMcpStatusOverlay: overlay factory invocation ━━━━━━━━━━━━━━━━━

describe("openMcpStatusOverlay: overlay factory bodies", () => {
  it("constructs McpStatusOverlay, McpActionOverlay, and McpToolListOverlay", async () => {
    // Exercise every factory body that openMcpStatusOverlay passes into
    // ctx.ui.custom. We invoke each factory synchronously with stubs and then
    // resolve the overlay with a scripted value.
    const manager = makeFakeManager({
      states: [state("alpha", "connected", 1, "transient err")],
      serverTools: new Map([["alpha", [tool("t1")]]]),
      sourcePath: "/path/to/conf.json",
    });
    const visibility = makeFakeVisibility();
    const pi = makeFakePi();
    const { deps } = makeDeps({
      pi,
      manager,
      visibility,
      overlayWarnings: ["w-1"],
    });

    const ctx = makeFakeCtx();
    const fakeTui = { requestRender: () => undefined };
    const fakeTheme = {
      fg: (_c: string, t: string) => t,
      bold: (t: string) => t,
    };
    const fakeKb = {};

    const invocations: string[] = [];
    let step = 0;
    ctx.ui.custom = <T>(factory: unknown, _opts?: unknown): Promise<T> => {
      step++;
      const component = (
        factory as (
          tui: unknown,
          theme: unknown,
          kb: unknown,
          done: (v: unknown) => void,
        ) => Record<string, unknown>
      )(fakeTui, fakeTheme, fakeKb, () => undefined);

      // Capture what kind of overlay was built. Each overlay class name is
      // available via constructor.name at runtime.
      invocations.push(
        (component as { constructor: { name: string } }).constructor?.name ?? "unknown",
      );

      if (step === 1) return Promise.resolve("alpha" as unknown as T);
      if (step === 2) return Promise.resolve("tools" as unknown as T);
      if (step === 3) return Promise.resolve(null as unknown as T);
      if (step === 4) return Promise.resolve(null as unknown as T);
      return Promise.resolve(null as unknown as T);
    };

    await openMcpStatusOverlay(deps, asReloadCtx(ctx), visibility.snapshot());

    // 5 overlay instantiations: Status → Action (tools) → ToolList → Action
    // (dismiss) → Status (dismiss)
    assert.equal(invocations.length, 5);
    assert.equal(invocations[0], "McpStatusOverlay");
    assert.equal(invocations[1], "McpActionOverlay");
    assert.equal(invocations[2], "McpToolListOverlay");
    assert.equal(invocations[3], "McpActionOverlay");
    assert.equal(invocations[4], "McpStatusOverlay");
  });

  it("calls getOverlayWarnings each time the status overlay is rebuilt", async () => {
    const manager = makeFakeManager({
      states: [state("alpha", "connected", 0)],
    });
    const visibility = makeFakeVisibility();
    let callCount = 0;
    const { deps } = makeDeps({
      pi: makeFakePi(),
      manager,
      visibility,
    });
    // Replace getOverlayWarnings to count invocations.
    deps.getOverlayWarnings = () => {
      callCount++;
      return [`warn-${callCount}`];
    };

    const ctx = makeFakeCtx();
    let step = 0;
    ctx.ui.custom = <T>(factory: unknown): Promise<T> => {
      step++;
      // Invoke factory to make sure getOverlayWarnings is evaluated.
      (
        factory as (
          tui: unknown,
          theme: unknown,
          kb: unknown,
          done: (v: unknown) => void,
        ) => unknown
      )({}, { fg: (_c: string, t: string) => t, bold: (t: string) => t }, {}, () => undefined);
      // First: pick alpha. Second: ActionOverlay dismiss. Third: Status dismiss.
      if (step === 1) return Promise.resolve("alpha" as unknown as T);
      return Promise.resolve(null as unknown as T);
    };

    await openMcpStatusOverlay(deps, asReloadCtx(ctx), visibility.snapshot());

    // getOverlayWarnings is only called for each McpStatusOverlay factory
    // invocation (2×) — ActionOverlay does not call it.
    assert.equal(callCount, 2);
  });
});

// ━━━ openMcpStatusOverlay: server action loop ━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("openMcpStatusOverlay: action loop", () => {
  it("returns to server list when the action picker is dismissed (null)", async () => {
    const manager = makeFakeManager({
      states: [state("alpha", "connected", 0)],
    });
    const visibility = makeFakeVisibility();
    const ctx = makeFakeCtx([
      "alpha" as string | null, // StatusOverlay picks alpha
      null as ServerAction | null, // ActionOverlay dismissed → continue serverList
      null as string | null, // StatusOverlay dismissed → exit
    ]);
    const { deps } = makeDeps({ pi: makeFakePi(), manager, visibility });

    await openMcpStatusOverlay(deps, asReloadCtx(ctx), visibility.snapshot());

    assert.equal(ctx.customCalls, 3);
    assert.equal(ctx.reloadCalls, 0);
  });

  it("opens the tools overlay for the 'tools' action and loops", async () => {
    const manager = makeFakeManager({
      states: [state("alpha", "connected", 0)],
      serverTools: new Map([["alpha", [tool("t1")]]]),
    });
    const visibility = makeFakeVisibility();
    // Sequence: pick alpha → pick tools → (tools overlay resolves null) →
    // pick action again → dismiss → dismiss server list
    const ctx = makeFakeCtx([
      "alpha" as string | null,
      "tools" as ServerAction | null,
      null, // tools overlay resolves with null
      null as ServerAction | null, // back to action picker → dismiss
      null as string | null, // server list dismissed
    ]);
    const { deps } = makeDeps({ pi: makeFakePi(), manager, visibility });

    await openMcpStatusOverlay(deps, asReloadCtx(ctx), visibility.snapshot());

    assert.equal(ctx.customCalls, 5);
    assert.equal(ctx.reloadCalls, 0);
  });

  it("reconnects when 'reconnect' action chosen and notifies on success", async () => {
    // Start disconnected; after reconnectServer, set status connected with tool count.
    const manager = makeFakeManager({
      states: [state("alpha", "disconnected", 0)],
    });
    manager.reconnectOverrides.set("alpha", () => {
      manager.states = [state("alpha", "connected", 5)];
    });
    const visibility = makeFakeVisibility();
    const ctx = makeFakeCtx([
      "alpha" as string | null, // StatusOverlay picks alpha
      "reconnect" as ServerAction | null, // action picker picks reconnect
      null as string | null, // StatusOverlay dismissed after re-showing
    ]);
    const { deps, updateStatusCalls } = makeDeps({
      pi: makeFakePi(),
      manager,
      visibility,
    });

    await openMcpStatusOverlay(deps, asReloadCtx(ctx), visibility.snapshot());

    assert.equal(manager.reconnectCalls.length, 1);
    assert.equal(manager.reconnectCalls[0], "alpha");
    assert.equal(updateStatusCalls.length, 1);
    // Success notification
    assert.ok(
      ctx.notifications.some(
        (n) => n.message === "alpha: reconnected (5 tools)" && n.level === "info",
      ),
    );
  });

  it("notifies with error details when reconnect leaves the server in error", async () => {
    const manager = makeFakeManager({
      states: [state("alpha", "disconnected", 0)],
    });
    manager.reconnectOverrides.set("alpha", () => {
      manager.states = [state("alpha", "error", 0, "connection refused")];
    });
    const visibility = makeFakeVisibility();
    const ctx = makeFakeCtx([
      "alpha" as string | null,
      "reconnect" as ServerAction | null,
      null as string | null,
    ]);
    const { deps } = makeDeps({ pi: makeFakePi(), manager, visibility });

    await openMcpStatusOverlay(deps, asReloadCtx(ctx), visibility.snapshot());

    assert.ok(
      ctx.notifications.some(
        (n) => n.message === "alpha: error - connection refused" && n.level === "warning",
      ),
    );
  });

  it("notifies with 'unknown' when server state disappears after reconnect", async () => {
    const manager = makeFakeManager({
      states: [state("alpha", "disconnected", 0)],
    });
    manager.reconnectOverrides.set("alpha", () => {
      // Simulate the server being removed from the manager.
      manager.states = [];
    });
    const visibility = makeFakeVisibility();
    const ctx = makeFakeCtx([
      "alpha" as string | null,
      "reconnect" as ServerAction | null,
      null as string | null,
    ]);
    const { deps } = makeDeps({ pi: makeFakePi(), manager, visibility });

    await openMcpStatusOverlay(deps, asReloadCtx(ctx), visibility.snapshot());

    assert.ok(
      ctx.notifications.some((n) => n.message === "alpha: unknown" && n.level === "warning"),
    );
  });

  it("returns nothing (no-op) when reconnect is chosen for an unknown server", async () => {
    // pickServerAction returns null when the server state is missing → loops back.
    const manager = makeFakeManager({
      states: [state("alpha", "disconnected", 0)],
    });
    const visibility = makeFakeVisibility();
    // Status overlay picks 'ghost' which isn't in states → pickServerAction returns null
    const ctx = makeFakeCtx([
      "ghost" as string | null, // StatusOverlay picks missing server
      // pickServerAction returns null directly (no custom call), so next is next StatusOverlay
      null as string | null, // dismiss
    ]);
    const { deps } = makeDeps({ pi: makeFakePi(), manager, visibility });

    await openMcpStatusOverlay(deps, asReloadCtx(ctx), visibility.snapshot());

    // Only 2 custom calls — one Status overlay, then loop back, then dismiss.
    assert.equal(ctx.customCalls, 2);
    assert.equal(manager.reconnectCalls.length, 0);
  });
});

// ━━━ openMcpStatusOverlay: tool toggle via tools overlay ━━━━━━━━━━━━━━

describe("openMcpStatusOverlay: tool toggle handler", () => {
  // The tool list overlay's `onToggle` callback is exercised by the factory
  // we pass to ctx.ui.custom. Our ctx.ui.custom mock returns without invoking
  // the factory, so to test handleToolToggle we call it indirectly by
  // scripting the overlay to resolve after we "toggle" a tool via the
  // visibility stub. But since we cannot trigger onToggle without invoking
  // the factory, we instead exercise the toggle path by calling the overlay
  // factory manually: custom<null>(factory, opts) → we call factory with
  // a done callback.
  //
  // Strategy: override ctx.ui.custom to synchronously invoke the factory
  // with stub arguments, capture the onToggle callback the factory passes
  // to McpToolListOverlay, invoke it to exercise handleToolToggle, then
  // resolve the overlay.

  interface ToolsOverlayHarness {
    deps: FlowDeps;
    ctx: FakeCtx;
  }

  function runWithToolsOverlay(args: {
    manager: FakeManager;
    visibility: FakeVisibility;
    pi: FakePi;
    registeredTools?: Set<string>;
    toggleTool: string;
    serverName: string;
  }): ToolsOverlayHarness {
    const { deps } = makeDeps({
      pi: args.pi,
      manager: args.manager,
      visibility: args.visibility,
      ...(args.registeredTools ? { registeredTools: args.registeredTools } : {}),
    });

    // We'll hijack ctx.ui.custom to intercept the tools-overlay call.
    const ctx = makeFakeCtx();
    // Provide a scripted sequence where custom() resolves in this order:
    // 1. StatusOverlay → pick server
    // 2. ActionOverlay → "tools"
    // 3. ToolListOverlay → intercepted: we fire the toggle, then done(null)
    // 4. ActionOverlay → null
    // 5. StatusOverlay → null (dismiss)
    let step = 0;
    ctx.ui.custom = <T>(factory: unknown, _opts?: unknown): Promise<T> => {
      ctx.customCalls++;
      step++;
      if (step === 1) return Promise.resolve(args.serverName as unknown as T);
      if (step === 2) return Promise.resolve("tools" as unknown as T);
      if (step === 3) {
        // Invoke the factory to reach McpToolListOverlay and extract onToggle.
        const fakeTui = {};
        const fakeTheme = {
          fg: (_c: string, t: string) => t,
          bold: (t: string) => t,
        };
        const fakeKb = {};
        let doneValue: unknown = null;
        const done = (v: unknown): void => {
          doneValue = v;
        };
        const component = (
          factory as (
            tui: unknown,
            theme: unknown,
            kb: unknown,
            done: (v: unknown) => void,
          ) => Record<string, unknown>
        )(fakeTui, fakeTheme, fakeKb, done);
        // McpToolListOverlay stores its toggle callback in the private
        // `onToggleTool` field (TypeScript `private` is a compile-time fence —
        // the field still exists on the instance at runtime). Invoke it to
        // exercise handleToolToggle end-to-end without driving keyboard input.
        const tog = (component as { onToggleTool?: (n: string) => void }).onToggleTool;
        assert.ok(tog, "expected onToggleTool callback on McpToolListOverlay");
        tog(args.toggleTool);
        // doneValue is deliberately unused — the overlay's done callback is a
        // no-op in tests; we only care about the side effects of `tog`.
        noop(doneValue);
        return Promise.resolve(null as unknown as T);
      }
      if (step === 4) return Promise.resolve(null as unknown as T);
      if (step === 5) return Promise.resolve(null as unknown as T);
      throw new Error(`unexpected custom call #${step}`);
    };

    return { deps, ctx };
  }

  it("disables an active tool: removes it from active set, notifies, flags reload", async () => {
    const manager = makeFakeManager({
      states: [state("srv", "connected", 1)],
      allTools: [{ serverName: "srv", tool: tool("t1") }],
      serverTools: new Map([["srv", [tool("t1")]]]),
    });
    const visibility = makeFakeVisibility();
    const piToolName = buildPiToolName("srv", "t1");
    const pi = makeFakePi([piToolName, "other"]);
    const registeredTools = new Set<string>([piToolName]);

    const wrapper = runWithToolsOverlay({
      manager,
      visibility,
      pi,
      registeredTools,
      toggleTool: "t1",
      serverName: "srv",
    });

    await openMcpStatusOverlay(wrapper.deps, asReloadCtx(wrapper.ctx), visibility.snapshot());

    // Tool should now be disabled
    assert.equal(visibility.disabled.has(buildToolVisibilityKey("srv", "t1")), true);
    // Active set had t1 removed
    assert.deepEqual(pi.active.sort(), ["other"]);
    // Notification says disabled
    assert.ok(
      wrapper.ctx.notifications.some(
        (n) => n.message === `${piToolName}: disabled` && n.level === "info",
      ),
    );
    // Reload should have happened (reload flag set because tool was registered)
    assert.equal(wrapper.ctx.reloadCalls, 1);
  });

  it("enables a registered tool: sets active and notifies 'enabled'", async () => {
    const manager = makeFakeManager({
      states: [state("srv", "connected", 1)],
      allTools: [{ serverName: "srv", tool: tool("t1") }],
      serverTools: new Map([["srv", [tool("t1")]]]),
    });
    const visibility = makeFakeVisibility({
      disabled: new Set([buildToolVisibilityKey("srv", "t1")]),
    });
    const piToolName = buildPiToolName("srv", "t1");
    const pi = makeFakePi(["other"]);
    const registeredTools = new Set<string>([piToolName]);

    const wrapper = runWithToolsOverlay({
      manager,
      visibility,
      pi,
      registeredTools,
      toggleTool: "t1",
      serverName: "srv",
    });

    await openMcpStatusOverlay(wrapper.deps, asReloadCtx(wrapper.ctx), visibility.snapshot());

    // Tool re-enabled
    assert.equal(visibility.disabled.has(buildToolVisibilityKey("srv", "t1")), false);
    // Active set gained piToolName
    assert.ok(pi.active.includes(piToolName));
    // Notification "enabled"
    assert.ok(
      wrapper.ctx.notifications.some(
        (n) => n.message === `${piToolName}: enabled` && n.level === "info",
      ),
    );
    // No reload needed because re-enable
    assert.equal(wrapper.ctx.reloadCalls, 0);
  });

  it("warns user when enabling a tool that is not yet registered (needs reload)", async () => {
    const manager = makeFakeManager({
      states: [state("srv", "connected", 1)],
      // Tool t1 is NOT in allTools (not yet discovered after disconnect).
      allTools: [],
      serverTools: new Map([["srv", [tool("t1")]]]),
    });
    const visibility = makeFakeVisibility({
      disabled: new Set([buildToolVisibilityKey("srv", "t1")]),
    });
    const piToolName = buildPiToolName("srv", "t1");
    const pi = makeFakePi();
    // Not registered yet.
    const registeredTools = new Set<string>();

    const wrapper = runWithToolsOverlay({
      manager,
      visibility,
      pi,
      registeredTools,
      toggleTool: "t1",
      serverName: "srv",
    });

    await openMcpStatusOverlay(wrapper.deps, asReloadCtx(wrapper.ctx), visibility.snapshot());

    // Warning notification
    assert.ok(
      wrapper.ctx.notifications.some(
        (n) =>
          n.message === `${piToolName}: enabled (connect or reload to register)` &&
          n.level === "warning",
      ),
    );
    // Not added to active (because not yet registered — setToolActive only runs
    // through the "registeredTools.has(piToolName)" branch).
    assert.equal(pi.active.includes(piToolName), false);
  });

  it("shows a warning notification when toggle fails to persist", async () => {
    const manager = makeFakeManager({
      states: [state("srv", "connected", 1)],
      allTools: [{ serverName: "srv", tool: tool("t1") }],
      serverTools: new Map([["srv", [tool("t1")]]]),
    });
    const visibility = makeFakeVisibility();
    visibility.toggleResults.set(buildToolVisibilityKey("srv", "t1"), {
      ok: false,
      error: "disk full",
    });
    const pi = makeFakePi();

    const wrapper = runWithToolsOverlay({
      manager,
      visibility,
      pi,
      toggleTool: "t1",
      serverName: "srv",
    });

    await openMcpStatusOverlay(wrapper.deps, asReloadCtx(wrapper.ctx), visibility.snapshot());

    assert.ok(
      wrapper.ctx.notifications.some(
        (n) => n.message === "Failed to save MCP tool settings: disk full" && n.level === "warning",
      ),
    );
    // No reload because toggle failed.
    assert.equal(wrapper.ctx.reloadCalls, 0);
  });

  it("disables a tool that hasn't been registered: notifies 'disabled', no reload", async () => {
    // Path: disable branch taken, registeredTools does NOT have piToolName →
    // shouldReloadForVisibility stays false.
    const manager = makeFakeManager({
      states: [state("srv", "connected", 0)],
      allTools: [],
      serverTools: new Map([["srv", [tool("t1")]]]),
    });
    const visibility = makeFakeVisibility();
    const piToolName = buildPiToolName("srv", "t1");
    const pi = makeFakePi();
    const registeredTools = new Set<string>(); // empty — nothing registered

    const wrapper = runWithToolsOverlay({
      manager,
      visibility,
      pi,
      registeredTools,
      toggleTool: "t1",
      serverName: "srv",
    });

    await openMcpStatusOverlay(wrapper.deps, asReloadCtx(wrapper.ctx), visibility.snapshot());

    // Disabled notification still emitted.
    assert.ok(
      wrapper.ctx.notifications.some(
        (n) => n.message === `${piToolName}: disabled` && n.level === "info",
      ),
    );
    // No reload flag set by the toggle (since it wasn't registered), but
    // newly-disabled snapshot diff fires a reload at the end.
    assert.equal(wrapper.ctx.reloadCalls, 1);
  });
});
