import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { countHooks, getSettingsPath, loadSettings } from "../core/settings.js";
import type { ClaudeSettings } from "../core/types.js";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claude-hooks-bridge-settings-"));

function makeCwd(name: string): string {
  const cwd = path.join(tmpRoot, name);
  fs.mkdirSync(path.join(cwd, ".claude"), { recursive: true });
  return cwd;
}

function writeSettings(cwd: string, body: string): string {
  const p = path.join(cwd, ".claude", "settings.json");
  fs.writeFileSync(p, body, "utf8");
  return p;
}

after(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

// ━━━ getSettingsPath ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getSettingsPath", () => {
  it("returns cwd/.claude/settings.json", () => {
    assert.equal(getSettingsPath("/foo/bar"), path.join("/foo/bar", ".claude", "settings.json"));
  });
});

// ━━━ loadSettings ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("loadSettings", () => {
  let counter = 0;
  beforeEach(() => {
    counter += 1;
  });

  it("returns null settings when file does not exist", () => {
    const cwd = makeCwd(`missing-${counter}`);
    const loaded = loadSettings(cwd);
    assert.equal(loaded.settings, null);
    assert.equal(loaded.path, getSettingsPath(cwd));
    assert.equal(loaded.parseError, undefined);
  });

  it("loads and parses a valid JSON settings file", () => {
    const cwd = makeCwd(`valid-${counter}`);
    writeSettings(
      cwd,
      JSON.stringify({
        hooks: {
          PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] }],
        },
      }),
    );
    const loaded = loadSettings(cwd);
    assert.ok(loaded.settings);
    assert.ok(loaded.settings?.hooks?.PreToolUse);
    assert.equal(loaded.parseError, undefined);
  });

  it("returns parseError when JSON is malformed", () => {
    const cwd = makeCwd(`malformed-${counter}`);
    writeSettings(cwd, "{ not valid json");
    const loaded = loadSettings(cwd);
    assert.equal(loaded.settings, null);
    assert.ok(loaded.parseError);
    assert.ok(loaded.parseError?.includes(".claude/settings.json"));
  });

  it("returns null settings when file is not an object (e.g. null)", () => {
    const cwd = makeCwd(`null-${counter}`);
    writeSettings(cwd, "null");
    const loaded = loadSettings(cwd);
    assert.equal(loaded.settings, null);
    assert.equal(loaded.parseError, undefined);
  });

  it("returns null settings when JSON is a bare number", () => {
    const cwd = makeCwd(`number-${counter}`);
    writeSettings(cwd, "42");
    const loaded = loadSettings(cwd);
    assert.equal(loaded.settings, null);
  });

  it("caches settings when mtime unchanged across calls", () => {
    const cwd = makeCwd(`cache-${counter}`);
    writeSettings(cwd, JSON.stringify({ hooks: { PreToolUse: [] } }));
    const first = loadSettings(cwd);
    const second = loadSettings(cwd);
    // Same reference because cache returned the same LoadedSettings object
    assert.equal(first, second);
  });

  it("reloads when file mtime changes", () => {
    const cwd = makeCwd(`reload-${counter}`);
    const p = writeSettings(cwd, JSON.stringify({ hooks: {} }));
    const first = loadSettings(cwd);

    // Force a different mtime (add 2s to be safe)
    const future = new Date(Date.now() + 2000);
    fs.utimesSync(p, future, future);
    // Also rewrite with a different payload
    writeSettings(cwd, JSON.stringify({ hooks: { PreToolUse: [{ matcher: "X" }] } }));
    // Re-utimes because writeFileSync resets mtime
    const future2 = new Date(Date.now() + 3000);
    fs.utimesSync(p, future2, future2);

    const second = loadSettings(cwd);
    assert.notEqual(first, second);
    assert.ok(second.settings?.hooks?.PreToolUse);
  });

  it("caches parseError results too", () => {
    const cwd = makeCwd(`cache-err-${counter}`);
    writeSettings(cwd, "{ bad json");
    const first = loadSettings(cwd);
    const second = loadSettings(cwd);
    assert.equal(first, second);
    assert.ok(first.parseError);
  });
});

// ━━━ countHooks ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("countHooks", () => {
  it("returns 0 when hooks is undefined", () => {
    assert.equal(countHooks({}), 0);
  });

  it("returns 0 when hooks is an empty object", () => {
    assert.equal(countHooks({ hooks: {} }), 0);
  });

  it("skips event entries that are not arrays", () => {
    const settings = { hooks: { PreToolUse: "not an array" } } as unknown as ClaudeSettings;
    assert.equal(countHooks(settings), 0);
  });

  it("skips groups whose hooks is not an array", () => {
    const settings = {
      hooks: { PreToolUse: [{ matcher: "Bash", hooks: "str" }] },
    } as unknown as ClaudeSettings;
    assert.equal(countHooks(settings), 0);
  });

  it("counts only command hooks with string commands", () => {
    const settings: ClaudeSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              { type: "command", command: "echo 1" },
              { type: "command", command: "echo 2" },
              { type: "command" }, // no command string → skipped
              { type: "webhook", command: "echo 3" }, // wrong type → skipped
            ],
          },
        ],
        PostToolUse: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "echo 4" }],
          },
        ],
      },
    };
    assert.equal(countHooks(settings), 3);
  });

  it("handles null hooks entries in the group array", () => {
    const settings = {
      hooks: {
        PreToolUse: [
          {
            matcher: "",
            hooks: [null, { type: "command", command: "ok" }],
          },
        ],
      },
    } as unknown as ClaudeSettings;
    assert.equal(countHooks(settings), 1);
  });
});
