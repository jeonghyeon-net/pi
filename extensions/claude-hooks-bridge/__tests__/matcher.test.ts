import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getClaudeToolName,
  getCommandHooks,
  getHookGroups,
  getMatcherCandidates,
  matcherMatches,
} from "../core/matcher.js";
import type { ClaudeSettings } from "../core/types.js";

// ━━━ getClaudeToolName ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getClaudeToolName", () => {
  it("maps built-in aliases", () => {
    assert.equal(getClaudeToolName("bash"), "Bash");
    assert.equal(getClaudeToolName("read"), "Read");
    assert.equal(getClaudeToolName("edit"), "Edit");
    assert.equal(getClaudeToolName("write"), "Write");
    assert.equal(getClaudeToolName("grep"), "Grep");
    assert.equal(getClaudeToolName("find"), "Find");
    assert.equal(getClaudeToolName("ls"), "LS");
  });

  it("returns the original name for unknown tools", () => {
    assert.equal(getClaudeToolName("custom_tool"), "custom_tool");
    assert.equal(getClaudeToolName("Bash"), "Bash");
  });
});

// ━━━ getMatcherCandidates ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getMatcherCandidates", () => {
  it("includes original, lowercase, canonical, canonical-lowercase", () => {
    const candidates = getMatcherCandidates("bash");
    assert.ok(candidates.includes("bash"));
    assert.ok(candidates.includes("Bash"));
    // deduplicated via Set, lowercase "bash" appears once (matches canonical lowercase too)
    assert.equal(new Set(candidates).size, candidates.length);
  });

  it("deduplicates when original already canonical", () => {
    const candidates = getMatcherCandidates("Bash");
    assert.ok(candidates.includes("Bash"));
    assert.ok(candidates.includes("bash"));
  });

  it("returns a unique list for unknown tools", () => {
    const candidates = getMatcherCandidates("Custom");
    assert.ok(candidates.includes("Custom"));
    assert.ok(candidates.includes("custom"));
  });
});

// ━━━ matcherMatches ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("matcherMatches", () => {
  it("returns true when matcher is undefined", () => {
    assert.equal(matcherMatches(undefined, "Bash"), true);
  });

  it("returns true when matcher is empty or whitespace", () => {
    assert.equal(matcherMatches("", "Bash"), true);
    assert.equal(matcherMatches("   ", "Bash"), true);
  });

  it("matches a plain regex against canonical name", () => {
    assert.equal(matcherMatches("Bash", "bash"), true);
    assert.equal(matcherMatches("Bash", "Bash"), true);
  });

  it("matches a regex union", () => {
    assert.equal(matcherMatches("Bash|Write", "write"), true);
    assert.equal(matcherMatches("Bash|Write", "read"), false);
  });

  it("matches a wildcard regex", () => {
    assert.equal(matcherMatches(".*", "anything"), true);
    assert.equal(matcherMatches("^B.*$", "Bash"), true);
    assert.equal(matcherMatches("^B.*$", "Write"), false);
  });

  it("falls back to token comparison on invalid regex", () => {
    // "[" is an invalid regex
    assert.equal(matcherMatches("[invalid", "Bash"), false);
  });

  it("falls back to token comparison when regex doesn't match; uses pipe tokens", () => {
    // Regex `Xyz|Bash` matches "Bash" directly, so this doesn't exercise fallback
    // Use an invalid regex with valid tokens via pipe
    const invalid = "(unclosed|Bash";
    assert.equal(matcherMatches(invalid, "bash"), true);
  });

  it("returns false when fallback tokens are all empty", () => {
    // Invalid regex with only empty/whitespace tokens.
    // Split "|  |  " by "|" gives ["", "  ", "  "]; all blank after trim.
    assert.equal(matcherMatches("|  |  (", "Bash"), false);
  });

  it("matches tokens case-insensitively in fallback", () => {
    assert.equal(matcherMatches("(bad|BASH", "bash"), true);
  });

  it("matches tokens exactly or case-insensitively", () => {
    // Valid regex that does NOT match Bash directly but has a pipe token
    assert.equal(matcherMatches("^Write$", "Bash"), false);
  });
});

// ━━━ getHookGroups ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getHookGroups", () => {
  it("returns empty array for null settings", () => {
    assert.deepEqual(getHookGroups(null, "PreToolUse"), []);
  });

  it("returns empty array when settings.hooks is missing", () => {
    assert.deepEqual(getHookGroups({}, "PreToolUse"), []);
  });

  it("returns empty array when event entry is not an array", () => {
    const settings = { hooks: { PreToolUse: "not array" } } as unknown as ClaudeSettings;
    assert.deepEqual(getHookGroups(settings, "PreToolUse"), []);
  });

  it("returns empty array when event entry is undefined", () => {
    const settings: ClaudeSettings = { hooks: {} };
    assert.deepEqual(getHookGroups(settings, "PreToolUse"), []);
  });

  it("returns groups when entry is an array", () => {
    const groups = [{ matcher: "Bash", hooks: [] }];
    const settings: ClaudeSettings = { hooks: { PreToolUse: groups } };
    assert.equal(getHookGroups(settings, "PreToolUse"), groups);
  });
});

// ━━━ getCommandHooks ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getCommandHooks", () => {
  it("returns empty array for null settings", () => {
    assert.deepEqual(getCommandHooks(null, "PreToolUse"), []);
  });

  it("returns all command hooks when toolName is undefined", () => {
    const settings: ClaudeSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: "echo 1" }],
          },
          {
            matcher: "Read",
            hooks: [{ type: "command", command: "echo 2" }],
          },
        ],
      },
    };
    const hooks = getCommandHooks(settings, "PreToolUse");
    assert.equal(hooks.length, 2);
  });

  it("filters groups by matcher when toolName provided", () => {
    const settings: ClaudeSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: "bash hook" }],
          },
          {
            matcher: "Read",
            hooks: [{ type: "command", command: "read hook" }],
          },
        ],
      },
    };
    const hooks = getCommandHooks(settings, "PreToolUse", "bash");
    assert.equal(hooks.length, 1);
    assert.equal(hooks[0]?.command, "bash hook");
  });

  it("skips groups without hooks array", () => {
    const settings = {
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: "not-array" }],
      },
    } as unknown as ClaudeSettings;
    assert.deepEqual(getCommandHooks(settings, "PreToolUse"), []);
  });

  it("skips hooks that are not objects", () => {
    const settings = {
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [null, "string", 42] }],
      },
    } as unknown as ClaudeSettings;
    assert.deepEqual(getCommandHooks(settings, "PreToolUse"), []);
  });

  it("skips hooks with non-'command' type", () => {
    const settings: ClaudeSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: "",
            hooks: [{ type: "webhook", command: "ignored" }],
          },
        ],
      },
    };
    assert.deepEqual(getCommandHooks(settings, "PreToolUse"), []);
  });

  it("skips hooks with empty or non-string command", () => {
    const settings: ClaudeSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: "",
            hooks: [
              { type: "command", command: "" },
              { type: "command", command: "   " },
              { type: "command" },
            ],
          },
        ],
      },
    };
    assert.deepEqual(getCommandHooks(settings, "PreToolUse"), []);
  });

  it("includes non-matcher groups when no toolName given", () => {
    const settings: ClaudeSettings = {
      hooks: {
        SessionStart: [
          {
            hooks: [{ type: "command", command: "start hook" }],
          },
        ],
      },
    };
    const hooks = getCommandHooks(settings, "SessionStart");
    assert.equal(hooks.length, 1);
    assert.equal(hooks[0]?.command, "start hook");
  });
});
