import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, afterEach, before, describe, it } from "node:test";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { TOOL_VISIBILITY_SETTINGS_PATH } from "../core/constants.js";
import type { McpManager } from "../core/manager.js";
import { buildPiToolName } from "../core/tool-naming.js";
import {
  createVisibilityController,
  removeDisabledToolsFromActiveSet,
  setToolActive,
} from "../core/tool-state.js";
import type { DiscoveredTool } from "../core/types.js";
import { buildToolVisibilityKey } from "../core/visibility.js";

// ━━━ Test isolation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// createVisibilityController.toggle writes to the real
// TOOL_VISIBILITY_SETTINGS_PATH. Snapshot & restore the file to keep tests
// hermetic.

let originalSettings: Buffer | null = null;
let originalExisted = false;

before(() => {
  originalExisted = fs.existsSync(TOOL_VISIBILITY_SETTINGS_PATH);
  if (originalExisted) {
    originalSettings = fs.readFileSync(TOOL_VISIBILITY_SETTINGS_PATH);
  }
});

afterEach(() => {
  // Reset to whatever state the file was in before the suite ran.
  if (originalExisted && originalSettings) {
    fs.mkdirSync(path.dirname(TOOL_VISIBILITY_SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(TOOL_VISIBILITY_SETTINGS_PATH, originalSettings);
    return;
  }
  if (fs.existsSync(TOOL_VISIBILITY_SETTINGS_PATH)) {
    fs.unlinkSync(TOOL_VISIBILITY_SETTINGS_PATH);
  }
});

after(() => {
  if (originalExisted && originalSettings) {
    fs.mkdirSync(path.dirname(TOOL_VISIBILITY_SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(TOOL_VISIBILITY_SETTINGS_PATH, originalSettings);
    return;
  }
  if (fs.existsSync(TOOL_VISIBILITY_SETTINGS_PATH)) {
    fs.unlinkSync(TOOL_VISIBILITY_SETTINGS_PATH);
  }
});

// ━━━ Mocks for pi / manager ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface FakePi {
  active: string[];
  activeToolsReadShouldThrow?: boolean;
  getActiveTools(): string[];
  setActiveTools(tools: string[]): void;
  setActiveToolsCalls: string[][];
}

function makeFakePi(initial: string[] = []): FakePi {
  const pi: FakePi = {
    active: [...initial],
    setActiveToolsCalls: [],
    getActiveTools() {
      if (pi.activeToolsReadShouldThrow) throw new Error("boom");
      return [...pi.active];
    },
    setActiveTools(tools: string[]) {
      pi.active = [...tools];
      pi.setActiveToolsCalls.push([...tools]);
    },
  };
  return pi;
}

function asPi(pi: FakePi): ExtensionAPI {
  return pi as unknown as ExtensionAPI;
}

interface FakeManager {
  all: { serverName: string; tool: DiscoveredTool }[];
  getAllTools(): { serverName: string; tool: DiscoveredTool }[];
}

function makeFakeManager(tools: { serverName: string; tool: DiscoveredTool }[] = []): FakeManager {
  return {
    all: tools,
    getAllTools() {
      return this.all;
    },
  };
}

function asManager(m: FakeManager): McpManager {
  return m as unknown as McpManager;
}

function tool(name: string, description?: string): DiscoveredTool {
  return {
    name,
    ...(description ? { description } : {}),
    inputSchema: { type: "object" as const },
  };
}

// ━━━ createVisibilityController ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("createVisibilityController", () => {
  it("starts with the supplied warning and returns it from getWarning", () => {
    const vc = createVisibilityController(new Set(), "initial-warn");
    assert.equal(vc.getWarning(), "initial-warn");
  });

  it("returns undefined warning when none supplied", () => {
    const vc = createVisibilityController(new Set(), undefined);
    assert.equal(vc.getWarning(), undefined);
  });

  it("isToolDisabled returns false when the tool is not in the set", () => {
    const vc = createVisibilityController(new Set(), undefined);
    assert.equal(vc.isToolDisabled("serverA", "tool1"), false);
  });

  it("isToolDisabled returns true when the key is present", () => {
    const keys = new Set([buildToolVisibilityKey("serverA", "tool1")]);
    const vc = createVisibilityController(keys, undefined);
    assert.equal(vc.isToolDisabled("serverA", "tool1"), true);
    assert.equal(vc.isToolDisabled("serverA", "tool2"), false);
    assert.equal(vc.isToolDisabled("serverB", "tool1"), false);
  });

  it("clearWarning removes the stored warning", () => {
    const vc = createVisibilityController(new Set(), "temp-warn");
    vc.clearWarning();
    assert.equal(vc.getWarning(), undefined);
  });

  it("snapshot returns an independent copy of the set", () => {
    const keys = new Set([buildToolVisibilityKey("s", "a")]);
    const vc = createVisibilityController(keys, undefined);
    const snap = vc.snapshot();
    assert.equal(snap.size, 1);
    // Mutating the snapshot must not affect the internal set.
    snap.add("extra-key");
    assert.equal(vc.snapshot().size, 1);
    // And mutating the internal set (via toggle) must not affect a prior snapshot.
    vc.toggle("s", "b");
    assert.equal(snap.size, 2); // we already added "extra-key" above
  });

  it("hasNewlyDisabled returns true when current set contains a key not in before", () => {
    const vc = createVisibilityController(new Set(), undefined);
    const before = new Set<string>();
    vc.toggle("s", "a");
    assert.equal(vc.hasNewlyDisabled(before), true);
  });

  it("hasNewlyDisabled returns false when no keys have been added since before", () => {
    const keys = new Set([buildToolVisibilityKey("s", "a")]);
    const vc = createVisibilityController(keys, undefined);
    const before = new Set(vc.snapshot());
    assert.equal(vc.hasNewlyDisabled(before), false);
  });

  it("hasNewlyDisabled returns false when current is a subset of before", () => {
    const vc = createVisibilityController(new Set([buildToolVisibilityKey("s", "a")]), undefined);
    const before = new Set([buildToolVisibilityKey("s", "a"), buildToolVisibilityKey("s", "b")]);
    assert.equal(vc.hasNewlyDisabled(before), false);
  });
});

// ━━━ toggle ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("createVisibilityController.toggle", () => {
  it("disables a previously enabled tool and persists to disk", () => {
    const keys = new Set<string>();
    const vc = createVisibilityController(keys, undefined);
    const result = vc.toggle("serverA", "tool1");
    assert.deepEqual(result, { ok: true, disabled: true });
    assert.equal(vc.isToolDisabled("serverA", "tool1"), true);

    assert.ok(fs.existsSync(TOOL_VISIBILITY_SETTINGS_PATH));
    const saved = JSON.parse(fs.readFileSync(TOOL_VISIBILITY_SETTINGS_PATH, "utf-8")) as {
      disabledTools: Record<string, string[]>;
    };
    assert.deepEqual(saved.disabledTools, { serverA: ["tool1"] });
  });

  it("re-enables a previously disabled tool and updates disk", () => {
    const initial = new Set([buildToolVisibilityKey("serverA", "tool1")]);
    const vc = createVisibilityController(initial, undefined);
    const result = vc.toggle("serverA", "tool1");
    assert.deepEqual(result, { ok: true, disabled: false });
    assert.equal(vc.isToolDisabled("serverA", "tool1"), false);

    const saved = JSON.parse(fs.readFileSync(TOOL_VISIBILITY_SETTINGS_PATH, "utf-8")) as {
      disabledTools: Record<string, string[]>;
    };
    assert.deepEqual(saved.disabledTools, {});
  });

  it("clears the startup warning on successful toggle", () => {
    const vc = createVisibilityController(new Set(), "some-warn");
    assert.equal(vc.getWarning(), "some-warn");
    vc.toggle("serverA", "tool1");
    assert.equal(vc.getWarning(), undefined);
  });

  it("rolls back the in-memory state when persisting fails after adding", () => {
    const vc = createVisibilityController(new Set(), undefined);

    // Force writeFileSync to fail so saveToolVisibilitySettings returns !ok.
    const original = fs.writeFileSync;
    (fs as { writeFileSync: typeof fs.writeFileSync }).writeFileSync = ((): void => {
      throw new Error("disk-full");
    }) as typeof fs.writeFileSync;

    try {
      const result = vc.toggle("serverA", "tool1");
      assert.deepEqual(result, { ok: false, error: "disk-full" });
      // Toggle added then rolled back → tool should still be enabled.
      assert.equal(vc.isToolDisabled("serverA", "tool1"), false);
    } finally {
      (fs as { writeFileSync: typeof fs.writeFileSync }).writeFileSync = original;
    }
  });

  it("rolls back the in-memory state when persisting fails after removing", () => {
    const initial = new Set([buildToolVisibilityKey("serverA", "tool1")]);
    const vc = createVisibilityController(initial, undefined);

    const original = fs.writeFileSync;
    (fs as { writeFileSync: typeof fs.writeFileSync }).writeFileSync = ((): void => {
      throw new Error("ro-fs");
    }) as typeof fs.writeFileSync;

    try {
      const result = vc.toggle("serverA", "tool1");
      assert.deepEqual(result, { ok: false, error: "ro-fs" });
      // Remove-then-rollback → tool should still be disabled.
      assert.equal(vc.isToolDisabled("serverA", "tool1"), true);
    } finally {
      (fs as { writeFileSync: typeof fs.writeFileSync }).writeFileSync = original;
    }
  });

  it("does not clear the warning when persistence fails", () => {
    const vc = createVisibilityController(new Set(), "keep-me");

    const original = fs.writeFileSync;
    (fs as { writeFileSync: typeof fs.writeFileSync }).writeFileSync = ((): void => {
      throw new Error("nope");
    }) as typeof fs.writeFileSync;

    try {
      vc.toggle("s", "t");
      assert.equal(vc.getWarning(), "keep-me");
    } finally {
      (fs as { writeFileSync: typeof fs.writeFileSync }).writeFileSync = original;
    }
  });
});

// ━━━ removeDisabledToolsFromActiveSet ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("removeDisabledToolsFromActiveSet", () => {
  it("removes every disabled MCP tool from the active set", () => {
    const disabled = new Set([buildToolVisibilityKey("serverA", "t1")]);
    const vc = createVisibilityController(disabled, undefined);
    const manager = makeFakeManager([
      { serverName: "serverA", tool: tool("t1") },
      { serverName: "serverA", tool: tool("t2") },
      { serverName: "serverB", tool: tool("t3") },
    ]);
    const piToolName = buildPiToolName("serverA", "t1");
    const otherEnabled = buildPiToolName("serverA", "t2");
    const foreign = "builtin_read";
    const pi = makeFakePi([piToolName, otherEnabled, foreign]);

    removeDisabledToolsFromActiveSet(asPi(pi), asManager(manager), vc);

    assert.equal(pi.setActiveToolsCalls.length, 1);
    assert.deepEqual(pi.active.sort(), [foreign, otherEnabled].sort());
  });

  it("is a no-op when no active MCP tool is disabled", () => {
    const vc = createVisibilityController(new Set(), undefined);
    const manager = makeFakeManager([{ serverName: "serverA", tool: tool("t1") }]);
    const pi = makeFakePi([buildPiToolName("serverA", "t1"), "other"]);

    removeDisabledToolsFromActiveSet(asPi(pi), asManager(manager), vc);

    assert.equal(pi.setActiveToolsCalls.length, 0);
  });

  it("skips tools that are disabled but not currently active", () => {
    const disabled = new Set([buildToolVisibilityKey("serverA", "t1")]);
    const vc = createVisibilityController(disabled, undefined);
    const manager = makeFakeManager([{ serverName: "serverA", tool: tool("t1") }]);
    // Not active in the first place → no changes needed.
    const pi = makeFakePi(["other-tool"]);

    removeDisabledToolsFromActiveSet(asPi(pi), asManager(manager), vc);

    assert.equal(pi.setActiveToolsCalls.length, 0);
    assert.deepEqual(pi.active, ["other-tool"]);
  });

  it("returns silently when getActiveTools throws", () => {
    const vc = createVisibilityController(
      new Set([buildToolVisibilityKey("serverA", "t1")]),
      undefined,
    );
    const manager = makeFakeManager([{ serverName: "serverA", tool: tool("t1") }]);
    const pi = makeFakePi();
    pi.activeToolsReadShouldThrow = true;

    assert.doesNotThrow(() => removeDisabledToolsFromActiveSet(asPi(pi), asManager(manager), vc));
    assert.equal(pi.setActiveToolsCalls.length, 0);
  });
});

// ━━━ setToolActive ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("setToolActive", () => {
  it("adds the tool when enabling and previously absent", () => {
    const pi = makeFakePi(["other"]);
    setToolActive(asPi(pi), "mcp_x_y", true);
    assert.equal(pi.setActiveToolsCalls.length, 1);
    assert.deepEqual(pi.active.sort(), ["mcp_x_y", "other"].sort());
  });

  it("is a no-op when enabling an already-active tool", () => {
    const pi = makeFakePi(["mcp_x_y"]);
    setToolActive(asPi(pi), "mcp_x_y", true);
    assert.equal(pi.setActiveToolsCalls.length, 0);
  });

  it("removes the tool when disabling and previously active", () => {
    const pi = makeFakePi(["mcp_x_y", "other"]);
    setToolActive(asPi(pi), "mcp_x_y", false);
    assert.equal(pi.setActiveToolsCalls.length, 1);
    assert.deepEqual(pi.active, ["other"]);
  });

  it("is a no-op when disabling an already-inactive tool", () => {
    const pi = makeFakePi(["other"]);
    setToolActive(asPi(pi), "mcp_x_y", false);
    assert.equal(pi.setActiveToolsCalls.length, 0);
  });

  it("returns silently when getActiveTools throws", () => {
    const pi = makeFakePi();
    pi.activeToolsReadShouldThrow = true;
    assert.doesNotThrow(() => setToolActive(asPi(pi), "mcp_x_y", true));
    assert.equal(pi.setActiveToolsCalls.length, 0);
  });
});
