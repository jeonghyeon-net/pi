import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, before, describe, it } from "node:test";
import { TOOL_VISIBILITY_KEY_SEPARATOR } from "../core/constants.js";
import {
  buildToolVisibilityKey,
  hasNewlyDisabledTools,
  loadToolVisibilitySettings,
  parseToolVisibilityKey,
  saveToolVisibilitySettings,
} from "../core/visibility.js";

// ━━━ temp dir management ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let tmpDir: string;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-bridge-visibility-"));
});

afterEach(() => {
  // Clean up everything inside tmpDir between tests (files and subdirs)
  for (const entry of fs.readdirSync(tmpDir)) {
    fs.rmSync(path.join(tmpDir, entry), { recursive: true, force: true });
  }
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function tmpFile(name: string): string {
  return path.join(tmpDir, name);
}

// ━━━ buildToolVisibilityKey / parseToolVisibilityKey ━━━━━━━━━━━━━━━━━━━━━━

describe("buildToolVisibilityKey", () => {
  it("joins server and tool with the separator", () => {
    const key = buildToolVisibilityKey("my-server", "my-tool");
    assert.equal(key, `my-server${TOOL_VISIBILITY_KEY_SEPARATOR}my-tool`);
  });
});

describe("parseToolVisibilityKey", () => {
  it("splits a valid key", () => {
    const parsed = parseToolVisibilityKey(`foo${TOOL_VISIBILITY_KEY_SEPARATOR}bar`);
    assert.deepEqual(parsed, { serverName: "foo", toolName: "bar" });
  });

  it("trims whitespace from parts", () => {
    const parsed = parseToolVisibilityKey(`  foo  ${TOOL_VISIBILITY_KEY_SEPARATOR}  bar  `);
    assert.deepEqual(parsed, { serverName: "foo", toolName: "bar" });
  });

  it("returns null when separator is missing", () => {
    assert.equal(parseToolVisibilityKey("no-separator"), null);
  });

  it("returns null when separator is at the beginning", () => {
    assert.equal(parseToolVisibilityKey(`${TOOL_VISIBILITY_KEY_SEPARATOR}tool`), null);
  });

  it("returns null when separator is at the end", () => {
    assert.equal(parseToolVisibilityKey(`server${TOOL_VISIBILITY_KEY_SEPARATOR}`), null);
  });

  it("returns null when server name is whitespace only", () => {
    assert.equal(parseToolVisibilityKey(`   ${TOOL_VISIBILITY_KEY_SEPARATOR}tool`), null);
  });

  it("returns null when tool name is whitespace only", () => {
    assert.equal(parseToolVisibilityKey(`server${TOOL_VISIBILITY_KEY_SEPARATOR}   `), null);
  });
});

// ━━━ loadToolVisibilitySettings ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("loadToolVisibilitySettings", () => {
  it("returns empty set when file does not exist", () => {
    const result = loadToolVisibilitySettings(tmpFile("does-not-exist.json"));
    assert.equal(result.disabledToolKeys.size, 0);
    assert.equal(result.warning, undefined);
  });

  it("loads from the record-style format", () => {
    const file = tmpFile("settings.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        disabledTools: {
          serverA: ["tool1", "tool2"],
          serverB: ["tool3"],
        },
      }),
    );
    const result = loadToolVisibilitySettings(file);
    assert.equal(result.warning, undefined);
    assert.equal(result.disabledToolKeys.size, 3);
    assert.ok(result.disabledToolKeys.has(buildToolVisibilityKey("serverA", "tool1")));
    assert.ok(result.disabledToolKeys.has(buildToolVisibilityKey("serverA", "tool2")));
    assert.ok(result.disabledToolKeys.has(buildToolVisibilityKey("serverB", "tool3")));
  });

  it("loads from the list-style format (server/tool strings)", () => {
    const file = tmpFile("list.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        disabledTools: ["serverA/tool1", "serverA/tool2"],
      }),
    );
    const result = loadToolVisibilitySettings(file);
    assert.equal(result.disabledToolKeys.size, 2);
    assert.ok(result.disabledToolKeys.has(buildToolVisibilityKey("serverA", "tool1")));
  });

  it("ignores list items that are not strings", () => {
    const file = tmpFile("mixed-list.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        disabledTools: ["valid/tool", 42, null, "another/tool"],
      }),
    );
    const result = loadToolVisibilitySettings(file);
    assert.equal(result.disabledToolKeys.size, 2);
  });

  it("ignores list items with invalid separator placement", () => {
    const file = tmpFile("invalid-list.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        disabledTools: ["no-slash", "/leading", "trailing/", "a/b"],
      }),
    );
    const result = loadToolVisibilitySettings(file);
    assert.equal(result.disabledToolKeys.size, 1);
    assert.ok(result.disabledToolKeys.has(buildToolVisibilityKey("a", "b")));
  });

  it("ignores empty server/tool names", () => {
    const file = tmpFile("empty-names.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        disabledTools: {
          "  ": ["tool1"],
          good: ["   ", "tool2"],
        },
      }),
    );
    const result = loadToolVisibilitySettings(file);
    assert.equal(result.disabledToolKeys.size, 1);
    assert.ok(result.disabledToolKeys.has(buildToolVisibilityKey("good", "tool2")));
  });

  it("ignores non-array values in map format", () => {
    const file = tmpFile("bad-map.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        disabledTools: {
          serverA: "not-an-array",
          serverB: ["tool1"],
        },
      }),
    );
    const result = loadToolVisibilitySettings(file);
    assert.equal(result.disabledToolKeys.size, 1);
  });

  it("ignores non-string tool names in map format", () => {
    const file = tmpFile("bad-tools.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        disabledTools: {
          serverA: ["valid", 123, null],
        },
      }),
    );
    const result = loadToolVisibilitySettings(file);
    assert.equal(result.disabledToolKeys.size, 1);
  });

  it("returns warning when disabledTools is missing", () => {
    const file = tmpFile("no-disabled.json");
    fs.writeFileSync(file, JSON.stringify({ other: "data" }));
    const result = loadToolVisibilitySettings(file);
    assert.equal(result.disabledToolKeys.size, 0);
    assert.equal(result.warning, undefined);
  });

  it("returns empty set when disabledTools is a primitive (string)", () => {
    const file = tmpFile("primitive.json");
    fs.writeFileSync(file, JSON.stringify({ disabledTools: "nope" }));
    const result = loadToolVisibilitySettings(file);
    assert.equal(result.disabledToolKeys.size, 0);
  });

  it("warns when JSON is not an object", () => {
    const file = tmpFile("not-object.json");
    fs.writeFileSync(file, JSON.stringify("just a string"));
    const result = loadToolVisibilitySettings(file);
    assert.equal(result.disabledToolKeys.size, 0);
    assert.match(result.warning ?? "", /Invalid tool visibility settings format/);
  });

  it("warns when JSON is null", () => {
    const file = tmpFile("null.json");
    fs.writeFileSync(file, "null");
    const result = loadToolVisibilitySettings(file);
    assert.equal(result.disabledToolKeys.size, 0);
    assert.match(result.warning ?? "", /Invalid tool visibility settings format/);
  });

  it("warns on invalid JSON", () => {
    const file = tmpFile("broken.json");
    fs.writeFileSync(file, "{ not: valid json");
    const result = loadToolVisibilitySettings(file);
    assert.equal(result.disabledToolKeys.size, 0);
    assert.match(result.warning ?? "", /Failed to load tool visibility settings/);
  });

  it("warns on file read failure (non-Error value)", () => {
    // Simulate readFileSync throwing non-Error
    const original = fs.readFileSync;
    (fs as { readFileSync: typeof fs.readFileSync }).readFileSync = ((): string => {
      throw "string-failure";
    }) as unknown as typeof fs.readFileSync;

    try {
      const file = tmpFile("any.json");
      fs.writeFileSync(file, "{}");
      // Restore writeFileSync-based original, but leave readFileSync mocked.
      // existsSync might be the real one; we need to restore it but keep read mocked.
      const result = loadToolVisibilitySettings(file);
      assert.equal(result.disabledToolKeys.size, 0);
      assert.match(result.warning ?? "", /string-failure/);
    } finally {
      (fs as { readFileSync: typeof fs.readFileSync }).readFileSync = original;
    }
  });
});

// ━━━ saveToolVisibilitySettings ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("saveToolVisibilitySettings", () => {
  it("creates parent directories and writes file", () => {
    const target = tmpFile("nested/deep/settings.json");
    const keys = new Set([
      buildToolVisibilityKey("serverA", "tool1"),
      buildToolVisibilityKey("serverA", "tool2"),
      buildToolVisibilityKey("serverB", "tool3"),
    ]);
    const result = saveToolVisibilitySettings(keys, target);
    assert.deepEqual(result, { ok: true });
    assert.ok(fs.existsSync(target));

    const saved = JSON.parse(fs.readFileSync(target, "utf-8")) as {
      disabledTools: Record<string, string[]>;
    };
    assert.deepEqual(saved, {
      disabledTools: {
        serverA: ["tool1", "tool2"],
        serverB: ["tool3"],
      },
    });
  });

  it("dedupes and sorts tool names per server", () => {
    const target = tmpFile("dedupe.json");
    const keys = new Set([
      buildToolVisibilityKey("srv", "b"),
      buildToolVisibilityKey("srv", "a"),
      buildToolVisibilityKey("srv", "b"),
    ]);
    const result = saveToolVisibilitySettings(keys, target);
    assert.deepEqual(result, { ok: true });
    const saved = JSON.parse(fs.readFileSync(target, "utf-8")) as {
      disabledTools: Record<string, string[]>;
    };
    assert.deepEqual(saved.disabledTools.srv, ["a", "b"]);
  });

  it("sorts servers alphabetically", () => {
    const target = tmpFile("sorted.json");
    const keys = new Set([
      buildToolVisibilityKey("zebra", "x"),
      buildToolVisibilityKey("alpha", "y"),
    ]);
    saveToolVisibilitySettings(keys, target);
    const saved = JSON.parse(fs.readFileSync(target, "utf-8")) as {
      disabledTools: Record<string, string[]>;
    };
    assert.deepEqual(Object.keys(saved.disabledTools), ["alpha", "zebra"]);
  });

  it("produces empty disabledTools when set is empty", () => {
    const target = tmpFile("empty.json");
    const result = saveToolVisibilitySettings(new Set(), target);
    assert.deepEqual(result, { ok: true });
    const saved = JSON.parse(fs.readFileSync(target, "utf-8")) as {
      disabledTools: Record<string, string[]>;
    };
    assert.deepEqual(saved, { disabledTools: {} });
  });

  it("skips invalid keys that cannot be parsed", () => {
    const target = tmpFile("skip-invalid.json");
    const keys = new Set(["no-separator-here", buildToolVisibilityKey("good", "tool")]);
    saveToolVisibilitySettings(keys, target);
    const saved = JSON.parse(fs.readFileSync(target, "utf-8")) as {
      disabledTools: Record<string, string[]>;
    };
    assert.deepEqual(saved.disabledTools, { good: ["tool"] });
  });

  it("returns error when directory creation fails", () => {
    const original = fs.mkdirSync;
    (fs as { mkdirSync: typeof fs.mkdirSync }).mkdirSync = ((): string => {
      throw new Error("mkdir failed");
    }) as typeof fs.mkdirSync;

    try {
      const result = saveToolVisibilitySettings(new Set(), tmpFile("fail.json"));
      assert.deepEqual(result, { ok: false, error: "mkdir failed" });
    } finally {
      (fs as { mkdirSync: typeof fs.mkdirSync }).mkdirSync = original;
    }
  });

  it("returns stringified non-Error on failure", () => {
    const original = fs.mkdirSync;
    (fs as { mkdirSync: typeof fs.mkdirSync }).mkdirSync = ((): string => {
      throw 42;
    }) as typeof fs.mkdirSync;

    try {
      const result = saveToolVisibilitySettings(new Set(), tmpFile("fail.json"));
      assert.deepEqual(result, { ok: false, error: "42" });
    } finally {
      (fs as { mkdirSync: typeof fs.mkdirSync }).mkdirSync = original;
    }
  });

  it("falls back to empty tools when grouped.get returns undefined (defensive guard)", () => {
    // The serialize path has `grouped.get(serverName) ?? []` to defend against
    // the (normally impossible) case where get() returns undefined. Force that
    // branch by monkey-patching Map.prototype.get to return undefined once.
    const target = tmpFile("defensive.json");
    const origGet = Map.prototype.get;
    let callIdx = 0;
    Map.prototype.get = function get<K, V>(this: Map<K, V>, key: K): V | undefined {
      callIdx++;
      // First get (idx 1) happens while building grouped Map (key not yet set).
      // Second get (idx 2) happens during the final serialization loop; make
      // that one return undefined to exercise the defensive ?? [] branch.
      if (callIdx === 2) return undefined;
      return origGet.call(this, key) as V | undefined;
    };
    try {
      const keys = new Set([buildToolVisibilityKey("srv", "tool")]);
      const result = saveToolVisibilitySettings(keys, target);
      assert.deepEqual(result, { ok: true });
      const saved = JSON.parse(fs.readFileSync(target, "utf-8")) as {
        disabledTools: Record<string, string[]>;
      };
      // grouped.get returned undefined → defaulted to [] → empty → server omitted
      assert.deepEqual(saved, { disabledTools: {} });
    } finally {
      Map.prototype.get = origGet;
    }
  });

  it("round-trips through load", () => {
    const target = tmpFile("roundtrip.json");
    const keys = new Set([
      buildToolVisibilityKey("serverA", "tool1"),
      buildToolVisibilityKey("serverA", "tool2"),
    ]);
    saveToolVisibilitySettings(keys, target);
    const loaded = loadToolVisibilitySettings(target);
    assert.equal(loaded.disabledToolKeys.size, 2);
    assert.deepEqual(Array.from(loaded.disabledToolKeys).sort(), Array.from(keys).sort());
  });
});

// ━━━ hasNewlyDisabledTools ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("hasNewlyDisabledTools", () => {
  it("returns true when a new tool appears in after", () => {
    const before = new Set(["a"]);
    const after = new Set(["a", "b"]);
    assert.equal(hasNewlyDisabledTools(before, after), true);
  });

  it("returns false when after is subset of before", () => {
    const before = new Set(["a", "b"]);
    const after = new Set(["a"]);
    assert.equal(hasNewlyDisabledTools(before, after), false);
  });

  it("returns false when sets are equal", () => {
    const before = new Set(["a", "b"]);
    const after = new Set(["a", "b"]);
    assert.equal(hasNewlyDisabledTools(before, after), false);
  });

  it("returns false when after is empty", () => {
    assert.equal(hasNewlyDisabledTools(new Set(["a"]), new Set()), false);
  });

  it("returns true when before is empty and after is not", () => {
    assert.equal(hasNewlyDisabledTools(new Set(), new Set(["x"])), true);
  });
});
