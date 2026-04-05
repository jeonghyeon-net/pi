import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  BUILTIN_TOOL_ALIASES,
  DEFAULT_HOOK_TIMEOUT_MS,
  SETTINGS_REL_PATH,
  TRANSCRIPT_TMP_DIR,
} from "../core/types.js";

describe("types constants", () => {
  it("SETTINGS_REL_PATH points to .claude/settings.json", () => {
    assert.equal(SETTINGS_REL_PATH, path.join(".claude", "settings.json"));
  });

  it("TRANSCRIPT_TMP_DIR lives under os.tmpdir()", () => {
    assert.equal(TRANSCRIPT_TMP_DIR, path.join(os.tmpdir(), "pi-claude-hooks-bridge"));
  });

  it("DEFAULT_HOOK_TIMEOUT_MS is 600s in ms", () => {
    assert.equal(DEFAULT_HOOK_TIMEOUT_MS, 600_000);
  });

  it("BUILTIN_TOOL_ALIASES maps each lowercase name to canonical", () => {
    assert.equal(BUILTIN_TOOL_ALIASES.bash, "Bash");
    assert.equal(BUILTIN_TOOL_ALIASES.read, "Read");
    assert.equal(BUILTIN_TOOL_ALIASES.edit, "Edit");
    assert.equal(BUILTIN_TOOL_ALIASES.write, "Write");
    assert.equal(BUILTIN_TOOL_ALIASES.grep, "Grep");
    assert.equal(BUILTIN_TOOL_ALIASES.find, "Find");
    assert.equal(BUILTIN_TOOL_ALIASES.ls, "LS");
  });
});
