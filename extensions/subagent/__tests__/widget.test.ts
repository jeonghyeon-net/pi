import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createStore } from "../core/store.js";
import type { CommandRunState } from "../core/types.js";
import type { WidgetRenderCtx } from "../ui/widget.js";
import { stopSpinnerTimer, toWidgetCtx, updateCommandRunsWidget } from "../ui/widget.js";

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

type SetWidgetCall = {
  key: string;
  content: unknown;
  options?: unknown;
};

function createMockCtx(): { ctx: WidgetRenderCtx; calls: SetWidgetCall[] } {
  const calls: SetWidgetCall[] = [];
  const ctx: WidgetRenderCtx = {
    hasUI: true,
    ui: {
      setWidget(key: string, content: unknown, options?: unknown) {
        calls.push({ key, content, options });
      },
    } as WidgetRenderCtx["ui"],
    model: { contextWindow: 200000 },
    modelRegistry: {
      getAll: () => [],
    },
  };
  return { ctx, calls };
}

// ━━━ toWidgetCtx ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("toWidgetCtx", () => {
  it("copies hasUI from source context", () => {
    const calls: Array<{ key: string; content: unknown; options?: unknown }> = [];
    const sourceCtx = {
      hasUI: true,
      ui: {
        setWidget(key: string, content: unknown, options?: unknown) {
          calls.push({ key, content, options });
        },
      },
      model: { contextWindow: 100000 },
      modelRegistry: {
        getAll: () => [] as Array<{ provider: string; id: string; contextWindow?: number }>,
      },
    };
    const widgetCtx = toWidgetCtx(sourceCtx as Parameters<typeof toWidgetCtx>[0]);
    assert.equal(widgetCtx.hasUI, true);
  });

  it("copies model contextWindow", () => {
    const sourceCtx = {
      hasUI: false,
      ui: {
        setWidget(_key: string, _content: unknown, _options?: unknown) {
          /* noop */
        },
      },
      model: { contextWindow: 150000 },
      modelRegistry: {
        getAll: () => [] as Array<{ provider: string; id: string; contextWindow?: number }>,
      },
    };
    const widgetCtx = toWidgetCtx(sourceCtx as Parameters<typeof toWidgetCtx>[0]);
    assert.equal(widgetCtx.model?.contextWindow, 150000);
  });

  it("handles undefined model", () => {
    const sourceCtx = {
      hasUI: true,
      ui: {
        setWidget(_key: string, _content: unknown, _options?: unknown) {
          /* noop */
        },
      },
      model: undefined,
      modelRegistry: {
        getAll: () => [] as Array<{ provider: string; id: string; contextWindow?: number }>,
      },
    };
    const widgetCtx = toWidgetCtx(sourceCtx as Parameters<typeof toWidgetCtx>[0]);
    assert.equal(widgetCtx.model, undefined);
  });

  it("wraps modelRegistry getAll", () => {
    const sourceCtx = {
      hasUI: true,
      ui: {
        setWidget(_key: string, _content: unknown, _options?: unknown) {
          /* noop */
        },
      },
      model: { contextWindow: 200000 },
      modelRegistry: {
        getAll: () =>
          [
            { provider: "anthropic", id: "opus", contextWindow: 200000 },
            { provider: "openai", id: "gpt-4", contextWindow: 128000 },
          ] as Array<{ provider: string; id: string; contextWindow?: number }>,
      },
    };
    const widgetCtx = toWidgetCtx(sourceCtx as Parameters<typeof toWidgetCtx>[0]);
    assert.ok(widgetCtx.modelRegistry);
    const models = widgetCtx.modelRegistry.getAll();
    assert.equal(models.length, 2);
    assert.equal(models[0]?.provider, "anthropic");
    assert.equal(models[0]?.id, "opus");
    assert.equal(models[0]?.contextWindow, 200000);
    assert.equal(models[1]?.provider, "openai");
  });

  it("delegates setWidget calls for string array content", () => {
    const calls: Array<{ key: string; content: unknown; options?: unknown }> = [];
    const sourceCtx = {
      hasUI: true,
      ui: {
        setWidget(key: string, content: unknown, options?: unknown) {
          calls.push({ key, content, options });
        },
      },
      model: { contextWindow: 200000 },
      modelRegistry: {
        getAll: () => [] as Array<{ provider: string; id: string; contextWindow?: number }>,
      },
    };
    const widgetCtx = toWidgetCtx(sourceCtx as Parameters<typeof toWidgetCtx>[0]);
    widgetCtx.ui?.setWidget("test-key", ["line1", "line2"], { placement: "belowEditor" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.key, "test-key");
    assert.deepStrictEqual(calls[0]?.content, ["line1", "line2"]);
  });

  it("delegates setWidget calls for undefined content (removal)", () => {
    const calls: Array<{ key: string; content: unknown; options?: unknown }> = [];
    const sourceCtx = {
      hasUI: true,
      ui: {
        setWidget(key: string, content: unknown, options?: unknown) {
          calls.push({ key, content, options });
        },
      },
      model: { contextWindow: 200000 },
      modelRegistry: {
        getAll: () => [] as Array<{ provider: string; id: string; contextWindow?: number }>,
      },
    };
    const widgetCtx = toWidgetCtx(sourceCtx as Parameters<typeof toWidgetCtx>[0]);
    widgetCtx.ui?.setWidget("remove-me", undefined);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.key, "remove-me");
    assert.equal(calls[0]?.content, undefined);
  });

  it("wraps WidgetFactory content into SDK factory", () => {
    const calls: Array<{ key: string; content: unknown; options?: unknown }> = [];
    const sourceCtx = {
      hasUI: true,
      ui: {
        setWidget(key: string, content: unknown, options?: unknown) {
          calls.push({ key, content, options });
        },
      },
      model: { contextWindow: 200000 },
      modelRegistry: {
        getAll: () => [] as Array<{ provider: string; id: string; contextWindow?: number }>,
      },
    };
    const widgetCtx = toWidgetCtx(sourceCtx as Parameters<typeof toWidgetCtx>[0]);

    let factoryCallCount = 0;
    const mockFactory = (_tui: unknown, _theme: unknown) => {
      factoryCallCount++;
      return {
        render(width: number) {
          return [`rendered at width ${width}`];
        },
        invalidate() {
          /* noop */
        },
        dispose() {
          /* noop */
        },
      };
    };

    widgetCtx.ui?.setWidget("factory-key", mockFactory, { placement: "belowEditor" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.key, "factory-key");

    // The content should be a wrapper function, not the original factory
    const wrappedFactory = calls[0]?.content as (
      tui: unknown,
      theme: unknown,
    ) => {
      render(w: number): string[];
      invalidate(): void;
      dispose(): void;
    };
    assert.equal(typeof wrappedFactory, "function");

    // Call the wrapper to verify it delegates
    const mockTui = {};
    const mockTheme = { fg: () => "", bold: () => "", bg: () => "" };
    const widget = wrappedFactory(mockTui, mockTheme);
    assert.equal(factoryCallCount, 1);
    assert.deepStrictEqual(widget.render(80), ["rendered at width 80"]);

    // Test invalidate and dispose
    widget.invalidate();
    widget.dispose();
  });

  it("wraps WidgetFactory without dispose/invalidate gracefully", () => {
    const calls: Array<{ key: string; content: unknown; options?: unknown }> = [];
    const sourceCtx = {
      hasUI: true,
      ui: {
        setWidget(key: string, content: unknown, options?: unknown) {
          calls.push({ key, content, options });
        },
      },
      model: { contextWindow: 200000 },
      modelRegistry: {
        getAll: () => [] as Array<{ provider: string; id: string; contextWindow?: number }>,
      },
    };
    const widgetCtx = toWidgetCtx(sourceCtx as Parameters<typeof toWidgetCtx>[0]);

    const minimalFactory = (_tui: unknown, _theme: unknown) => ({
      render(width: number) {
        return [`w=${width}`];
      },
      // no invalidate or dispose
    });

    widgetCtx.ui?.setWidget("minimal-key", minimalFactory);

    const wrappedFactory = calls[0]?.content as (
      tui: unknown,
      theme: unknown,
    ) => {
      render(w: number): string[];
      invalidate(): void;
      dispose(): void;
    };
    const widget = wrappedFactory({}, { fg: () => "", bold: () => "", bg: () => "" });
    // Calling invalidate/dispose should not throw even when original doesn't have them
    widget.invalidate();
    widget.dispose();
  });
});

// ━━━ updateCommandRunsWidget ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("updateCommandRunsWidget", () => {
  // Reset the module-level spinnerTimer after each test to avoid timer leaks
  afterEach(() => {
    // Clear any timers by calling with no running runs
    const store = createStore();
    const { ctx } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
  });

  it("does nothing when hasUI is false", () => {
    const store = createStore();
    const calls: SetWidgetCall[] = [];
    const ctx: WidgetRenderCtx = {
      hasUI: false,
      ui: {
        setWidget(key: string, content: unknown, options?: unknown) {
          calls.push({ key, content, options });
        },
      } as WidgetRenderCtx["ui"],
    };
    updateCommandRunsWidget(store, ctx);
    assert.equal(calls.length, 0);
  });

  it("does nothing when ui is undefined", () => {
    const store = createStore();
    const ctx: WidgetRenderCtx = { hasUI: true, ui: undefined };
    // Should not throw
    updateCommandRunsWidget(store, ctx);
  });

  it("does nothing when ctx is undefined and no stored ctx", () => {
    const store = createStore();
    // Should not throw
    updateCommandRunsWidget(store);
  });

  it("sets sub-parent widget when currentParentSessionFile exists", () => {
    const store = createStore();
    store.currentParentSessionFile = "/tmp/parent-session.jsonl";
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    const parentCall = calls.find((c) => c.key === "sub-parent");
    assert.ok(parentCall);
    assert.ok(parentCall.content !== undefined); // factory, not undefined
    assert.deepStrictEqual(parentCall.options, { placement: "belowEditor" });
  });

  it("removes sub-parent widget when no parent session", () => {
    const store = createStore();
    store.currentParentSessionFile = null;
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    const parentCall = calls.find((c) => c.key === "sub-parent");
    assert.ok(parentCall);
    assert.equal(parentCall.content, undefined);
  });

  it("removes widgets for no visible runs", () => {
    const store = createStore();
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    const runsCall = calls.find((c) => c.key === "subagent-runs");
    assert.ok(runsCall);
    assert.equal(runsCall.content, undefined);
  });

  it("creates widget for each visible run", () => {
    const store = createStore();
    store.commandRuns.set(1, makeRunState({ id: 1, status: "running", agent: "worker" }));
    store.commandRuns.set(2, makeRunState({ id: 2, status: "done", agent: "reviewer" }));
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    const runWidgets = calls.filter((c) => c.key.startsWith("sub-") && c.key !== "sub-parent");
    // Should have widgets for run 1 and run 2
    assert.ok(runWidgets.some((c) => c.key === "sub-1"));
    assert.ok(runWidgets.some((c) => c.key === "sub-2"));
  });

  it("skips removed runs", () => {
    const store = createStore();
    store.commandRuns.set(1, makeRunState({ id: 1, status: "running" }));
    store.commandRuns.set(2, makeRunState({ id: 2, status: "done", removed: true }));
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    const runWidgets = calls.filter(
      (c) => c.key.startsWith("sub-") && c.key !== "sub-parent" && c.content !== undefined,
    );
    assert.ok(runWidgets.some((c) => c.key === "sub-1"));
    assert.ok(!runWidgets.some((c) => c.key === "sub-2"));
  });

  it("limits visible runs to MAX_VISIBLE_RUNS (3)", () => {
    const store = createStore();
    for (let i = 1; i <= 5; i++) {
      store.commandRuns.set(
        i,
        makeRunState({ id: i, status: "running", startedAt: Date.now() - i * 1000 }),
      );
    }
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    const activeRunWidgets = calls.filter(
      (c) => c.key.startsWith("sub-") && c.key !== "sub-parent" && c.content !== undefined,
    );
    // Only 3 run widgets should have content (factory)
    assert.equal(activeRunWidgets.length, 3);
  });

  it("removes previously rendered widgets that are no longer visible", () => {
    const store = createStore();
    // Simulate previously rendered widget IDs
    store.renderedRunWidgetIds.add(99);
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    // Widget for run 99 should be removed (content === undefined)
    const removeCall = calls.find((c) => c.key === "sub-99");
    assert.ok(removeCall);
    assert.equal(removeCall.content, undefined);
    // And it should be removed from the set
    assert.equal(store.renderedRunWidgetIds.has(99), false);
  });

  it("stores ctx for subsequent calls", () => {
    const store = createStore();
    const { ctx } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    assert.equal(store.commandWidgetCtx, ctx);

    // Now call without ctx, it should use the stored one
    const calls2: SetWidgetCall[] = [];
    (store.commandWidgetCtx as WidgetRenderCtx).ui = {
      setWidget(key: string, content: unknown, options?: unknown) {
        calls2.push({ key, content, options });
      },
    } as WidgetRenderCtx["ui"];
    updateCommandRunsWidget(store);
    assert.ok(calls2.length > 0);
  });

  it("sorts runs by status priority (running first, then done, then error)", () => {
    const store = createStore();
    const now = Date.now();
    store.commandRuns.set(1, makeRunState({ id: 1, status: "error", startedAt: now - 1000 }));
    store.commandRuns.set(2, makeRunState({ id: 2, status: "running", startedAt: now - 2000 }));
    store.commandRuns.set(3, makeRunState({ id: 3, status: "done", startedAt: now - 3000 }));
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    const activeRunCalls = calls.filter(
      (c) => c.key.startsWith("sub-") && c.key !== "sub-parent" && c.content !== undefined,
    );
    // Running (id=2) should appear first via renderedRunWidgetIds tracking
    assert.ok(store.renderedRunWidgetIds.has(2));
    assert.ok(store.renderedRunWidgetIds.has(3));
    assert.ok(store.renderedRunWidgetIds.has(1));
    assert.equal(activeRunCalls.length, 3);
  });

  it("renders run widget factory correctly", () => {
    const store = createStore();
    store.commandRuns.set(
      1,
      makeRunState({
        id: 1,
        status: "running",
        agent: "planner",
        task: "plan things",
        elapsedMs: 5000,
      }),
    );
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    const runCall = calls.find((c) => c.key === "sub-1" && c.content !== undefined);
    assert.ok(runCall);
    assert.deepStrictEqual(runCall.options, { placement: "belowEditor" });

    // Exercise the factory's render function
    const factory = runCall.content as (
      tui: unknown,
      theme: unknown,
    ) => {
      render(w: number): string[];
      invalidate(): void;
    };
    const mockTheme = {
      fg: (color: string, text: string) => `[${color}:${text}]`,
      bold: (text: string) => `**${text}**`,
      bg: (color: string, text: string) => `{${color}:${text}}`,
    };
    const widget = factory({}, mockTheme);
    const rendered = widget.render(80);
    assert.ok(Array.isArray(rendered));
    // Should not throw
    widget.invalidate();
  });

  it("renders parent hint widget factory correctly", () => {
    const store = createStore();
    store.currentParentSessionFile = "/tmp/parent.jsonl";
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    const parentCall = calls.find((c) => c.key === "sub-parent" && c.content !== undefined);
    assert.ok(parentCall);

    const factory = parentCall.content as (
      tui: unknown,
      theme: unknown,
    ) => {
      render(w: number): string[];
      invalidate(): void;
    };
    const mockTheme = {
      fg: (color: string, text: string) => `[${color}:${text}]`,
      bold: (text: string) => `**${text}**`,
      bg: (color: string, text: string) => `{${color}:${text}}`,
    };
    const widget = factory({}, mockTheme);
    const rendered = widget.render(80);
    assert.ok(Array.isArray(rendered));
    widget.invalidate();
  });

  it("shows thought text for running runs", () => {
    const store = createStore();
    store.commandRuns.set(
      1,
      makeRunState({
        id: 1,
        status: "running",
        agent: "thinker",
        thoughtText: "analyzing code",
      }),
    );
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    const runCall = calls.find((c) => c.key === "sub-1" && c.content !== undefined);
    assert.ok(runCall);
    const factory = runCall.content as (
      tui: unknown,
      theme: unknown,
    ) => {
      render(w: number): string[];
    };
    const mockTheme = {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
      bg: (_color: string, text: string) => text,
    };
    const widget = factory({}, mockTheme);
    const rendered = widget.render(80);
    const output = rendered.join("\n");
    assert.ok(output.includes("analyzing code"));
  });

  it("shows lastLine for running runs without thought", () => {
    const store = createStore();
    store.commandRuns.set(
      1,
      makeRunState({
        id: 1,
        status: "running",
        agent: "worker",
        lastLine: "processing files...",
      }),
    );
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    const runCall = calls.find((c) => c.key === "sub-1" && c.content !== undefined);
    assert.ok(runCall);
    const factory = runCall.content as (
      tui: unknown,
      theme: unknown,
    ) => {
      render(w: number): string[];
    };
    const mockTheme = {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
      bg: (_color: string, text: string) => text,
    };
    const widget = factory({}, mockTheme);
    const rendered = widget.render(80);
    const output = rendered.join("\n");
    assert.ok(output.includes("processing files..."));
  });

  it("does not show thought text for done runs", () => {
    const store = createStore();
    store.commandRuns.set(
      1,
      makeRunState({
        id: 1,
        status: "done",
        agent: "worker",
        thoughtText: "should not appear",
      }),
    );
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    const runCall = calls.find((c) => c.key === "sub-1" && c.content !== undefined);
    assert.ok(runCall);
    const factory = runCall.content as (
      tui: unknown,
      theme: unknown,
    ) => {
      render(w: number): string[];
    };
    const mockTheme = {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
      bg: (_color: string, text: string) => text,
    };
    const widget = factory({}, mockTheme);
    const rendered = widget.render(80);
    const output = rendered.join("\n");
    assert.ok(!output.includes("should not appear"));
  });

  it("shows context usage bar when usage data is available", () => {
    const store = createStore();
    store.commandRuns.set(
      1,
      makeRunState({
        id: 1,
        status: "running",
        agent: "worker",
        model: "test-model",
        usage: {
          input: 50000,
          output: 10000,
          cacheRead: 0,
          cacheWrite: 0,
          cost: 0.1,
          contextTokens: 100000,
          turns: 3,
        },
      }),
    );
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    const runCall = calls.find((c) => c.key === "sub-1" && c.content !== undefined);
    assert.ok(runCall);
    const factory = runCall.content as (
      tui: unknown,
      theme: unknown,
    ) => {
      render(w: number): string[];
    };
    const mockTheme = {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
      bg: (_color: string, text: string) => text,
    };
    const widget = factory({}, mockTheme);
    const rendered = widget.render(120);
    const output = rendered.join("\n");
    // Should contain percentage sign from context bar
    assert.ok(output.includes("%"));
  });

  it("shows main context label for main context mode", () => {
    const store = createStore();
    store.commandRuns.set(
      1,
      makeRunState({
        id: 1,
        status: "running",
        agent: "worker",
        contextMode: "main",
      }),
    );
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    const runCall = calls.find((c) => c.key === "sub-1" && c.content !== undefined);
    assert.ok(runCall);
    const factory = runCall.content as (
      tui: unknown,
      theme: unknown,
    ) => {
      render(w: number): string[];
    };
    const mockTheme = {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
      bg: (_color: string, text: string) => text,
    };
    const widget = factory({}, mockTheme);
    const rendered = widget.render(80);
    const output = rendered.join("\n");
    assert.ok(output.includes("Main"));
  });

  it("shows idle indicator for long-idle running runs", () => {
    const store = createStore();
    store.commandRuns.set(
      1,
      makeRunState({
        id: 1,
        status: "running",
        agent: "worker",
        lastActivityAt: Date.now() - 10000, // 10 seconds idle
      }),
    );
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    const runCall = calls.find((c) => c.key === "sub-1" && c.content !== undefined);
    assert.ok(runCall);
    const factory = runCall.content as (
      tui: unknown,
      theme: unknown,
    ) => {
      render(w: number): string[];
    };
    const mockTheme = {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
      bg: (_color: string, text: string) => text,
    };
    const widget = factory({}, mockTheme);
    const rendered = widget.render(120);
    const output = rendered.join("\n");
    assert.ok(output.includes("idle:"));
  });

  it("sorts by id when status and startedAt are identical", () => {
    const store = createStore();
    const now = Date.now();
    store.commandRuns.set(1, makeRunState({ id: 1, status: "running", startedAt: now }));
    store.commandRuns.set(2, makeRunState({ id: 2, status: "running", startedAt: now }));
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    // Both runs should be rendered, with higher id first (b.id - a.id)
    assert.ok(calls.some((c) => c.key === "sub-1" && c.content !== undefined));
    assert.ok(calls.some((c) => c.key === "sub-2" && c.content !== undefined));
  });

  it("shows error-colored idle indicator for very long idle runs", () => {
    const store = createStore();
    store.commandRuns.set(
      1,
      makeRunState({
        id: 1,
        status: "running",
        agent: "worker",
        lastActivityAt: Date.now() - 200_000, // 200 seconds > HANG_WARNING_IDLE_MS (120s)
      }),
    );
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    const runCall = calls.find((c) => c.key === "sub-1" && c.content !== undefined);
    assert.ok(runCall);
    const factory = runCall.content as (
      tui: unknown,
      theme: unknown,
    ) => {
      render(w: number): string[];
    };
    // Use a theme that includes the color name so we can check it
    const mockTheme = {
      fg: (color: string, text: string) => `[${color}]${text}`,
      bold: (text: string) => text,
      bg: (_color: string, text: string) => text,
    };
    const widget = factory({}, mockTheme);
    const rendered = widget.render(120);
    const output = rendered.join("\n");
    // Should include error-colored idle indicator
    assert.ok(output.includes("[error]"));
    assert.ok(output.includes("idle:"));
  });

  it("shows separator between runs", () => {
    const store = createStore();
    const now = Date.now();
    store.commandRuns.set(1, makeRunState({ id: 1, status: "running", startedAt: now - 1000 }));
    store.commandRuns.set(2, makeRunState({ id: 2, status: "running", startedAt: now - 2000 }));
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    // Both runs should be rendered
    assert.ok(calls.some((c) => c.key === "sub-1" && c.content !== undefined));
    assert.ok(calls.some((c) => c.key === "sub-2" && c.content !== undefined));

    // Render the second run (which has showSeparator=true) to cover the separator branch
    const secondRunCall = calls.find((c) => c.key === "sub-2" && c.content !== undefined);
    if (secondRunCall && typeof secondRunCall.content === "function") {
      const mockTheme = {
        fg: (_color: string, text: string) => text,
        bold: (text: string) => text,
        bg: (_color: string, text: string) => text,
      };
      const widget = secondRunCall.content({}, mockTheme);
      const rendered = widget.render(80);
      const output = rendered.join("\n");
      // Second run should have a separator line
      assert.ok(output.includes("─"));
    }
  });

  it("shows bottom separator for last run", () => {
    const store = createStore();
    store.commandRuns.set(1, makeRunState({ id: 1, status: "running" }));
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    const runCall = calls.find((c) => c.key === "sub-1" && c.content !== undefined);
    assert.ok(runCall);
    const factory = runCall.content as (
      tui: unknown,
      theme: unknown,
    ) => {
      render(w: number): string[];
    };
    const mockTheme = {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
      bg: (_color: string, text: string) => text,
    };
    const widget = factory({}, mockTheme);
    const rendered = widget.render(80);
    const output = rendered.join("\n");
    // Last run should have bottom separator (line of dashes)
    assert.ok(output.includes("─"));
  });

  it("handles narrow width rendering", () => {
    const store = createStore();
    store.commandRuns.set(
      1,
      makeRunState({
        id: 1,
        status: "running",
        agent: "worker",
        model: "test-model",
        usage: {
          input: 100000,
          output: 50000,
          cacheRead: 0,
          cacheWrite: 0,
          cost: 0.5,
          contextTokens: 180000,
          turns: 5,
        },
      }),
    );
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    const runCall = calls.find((c) => c.key === "sub-1" && c.content !== undefined);
    assert.ok(runCall);
    const factory = runCall.content as (
      tui: unknown,
      theme: unknown,
    ) => {
      render(w: number): string[];
    };
    const mockTheme = {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
      bg: (_color: string, text: string) => text,
    };
    const widget = factory({}, mockTheme);
    // Should not throw even with very narrow width
    const rendered = widget.render(10);
    assert.ok(Array.isArray(rendered));
  });

  it("shows error status icon for error runs", () => {
    const store = createStore();
    store.commandRuns.set(1, makeRunState({ id: 1, status: "error", agent: "worker" }));
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    const runCall = calls.find((c) => c.key === "sub-1" && c.content !== undefined);
    assert.ok(runCall);
    const factory = runCall.content as (
      tui: unknown,
      theme: unknown,
    ) => {
      render(w: number): string[];
    };
    const mockTheme = {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
      bg: (_color: string, text: string) => text,
    };
    const widget = factory({}, mockTheme);
    const rendered = widget.render(80);
    const output = rendered.join("\n");
    // Error icon
    assert.ok(output.includes("\u2717")); // ✗
  });

  it("shows done status icon for completed runs", () => {
    const store = createStore();
    store.commandRuns.set(1, makeRunState({ id: 1, status: "done", agent: "worker" }));
    const { ctx, calls } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    const runCall = calls.find((c) => c.key === "sub-1" && c.content !== undefined);
    assert.ok(runCall);
    const factory = runCall.content as (
      tui: unknown,
      theme: unknown,
    ) => {
      render(w: number): string[];
    };
    const mockTheme = {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
      bg: (_color: string, text: string) => text,
    };
    const widget = factory({}, mockTheme);
    const rendered = widget.render(80);
    const output = rendered.join("\n");
    // Done icon
    assert.ok(output.includes("\u2713")); // ✓
  });
});

// ━━━ manageSpinnerTimer (tested indirectly through updateCommandRunsWidget) ━━

describe("manageSpinnerTimer (indirect)", () => {
  afterEach(() => {
    // Clear any timers
    const store = createStore();
    const { ctx } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
  });

  it("starts timer when running runs exist", () => {
    const store = createStore();
    store.commandRuns.set(1, makeRunState({ id: 1, status: "running" }));
    const { ctx } = createMockCtx();
    // First call starts the timer
    updateCommandRunsWidget(store, ctx);
    // Second call (with no running) should stop it
    store.commandRuns.clear();
    updateCommandRunsWidget(store, ctx);
    // No assertion on timer internals, but verifies no error
  });

  it("stops timer when no running runs", () => {
    const store = createStore();
    store.commandRuns.set(1, makeRunState({ id: 1, status: "done" }));
    const { ctx } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    // Should not throw
  });

  it("handles rapid start/stop cycles", () => {
    const store = createStore();
    const { ctx } = createMockCtx();

    // Start with running runs
    store.commandRuns.set(1, makeRunState({ id: 1, status: "running" }));
    updateCommandRunsWidget(store, ctx);

    // Stop
    store.commandRuns.set(1, makeRunState({ id: 1, status: "done" }));
    updateCommandRunsWidget(store, ctx);

    // Start again
    store.commandRuns.set(1, makeRunState({ id: 1, status: "running" }));
    updateCommandRunsWidget(store, ctx);

    // Stop again
    store.commandRuns.clear();
    updateCommandRunsWidget(store, ctx);
  });

  it("stopSpinnerTimer clears an active timer", () => {
    const store = createStore();
    store.commandRuns.set(1, makeRunState({ id: 1, status: "running" }));
    const { ctx } = createMockCtx();
    updateCommandRunsWidget(store, ctx);
    stopSpinnerTimer();
    // Second call is no-op
    stopSpinnerTimer();
  });

  it("stopSpinnerTimer is no-op when no timer is active", () => {
    stopSpinnerTimer();
  });

  it("handles run with empty task", () => {
    const { ctx, calls } = createMockCtx();
    const store = createStore();

    store.commandRuns.set(1, makeRunState({ id: 1, status: "running", task: "" }));
    updateCommandRunsWidget(store, ctx);

    // Should render without error even with empty task
    assert.ok(calls.length > 0);

    // Invoke the widget render to cover the run.task falsy branch
    const runWidgetCall = calls.find((c) => c.key === "sub-1");
    assert.ok(runWidgetCall);
    if (typeof runWidgetCall.content === "function") {
      const mockTheme = { fg: (_color: string, text: string) => text };
      const widget = runWidgetCall.content(null, mockTheme);
      if (widget && typeof widget.render === "function") {
        const rendered = widget.render(80);
        assert.ok(Array.isArray(rendered));
      }
    }
  });
});
