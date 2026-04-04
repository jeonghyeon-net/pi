import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, afterEach, before, describe, it } from "node:test";

// The persist module captures SUBAGENT_STATE_DIR = path.join(os.homedir(), ".pi", "agent", "state")
// at module load time. We set HOME to a single temp directory BEFORE loading the module,
// then clean up the state file between tests (not the directory).

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-persist-test-"));
const origHome = process.env.HOME;
const origUserProfile = process.env.USERPROFILE;

// Set HOME before module import
process.env.HOME = tmpDir;
process.env.USERPROFILE = tmpDir;

const stateDir = path.join(tmpDir, ".pi", "agent", "state");
const stateFile = path.join(stateDir, "subagent-pending-groups.json");

// Dynamic import to ensure HOME is set before module initialization
let persist: typeof import("../session/persist.js");

before(async () => {
  persist = await import("../session/persist.js");
});

afterEach(() => {
  // Clean state file between tests
  try {
    if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
  } catch {
    // ignore
  }
});

after(() => {
  // Restore HOME and clean up
  if (origHome !== undefined) process.env.HOME = origHome;
  else process.env.HOME = undefined;
  if (origUserProfile !== undefined) process.env.USERPROFILE = origUserProfile;
  else process.env.USERPROFILE = undefined;
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

function makeEntry(
  overrides: Partial<import("../session/persist.js").PersistedPendingGroupCompletion> = {},
): import("../session/persist.js").PersistedPendingGroupCompletion {
  return {
    scope: "batch",
    groupId: "g1",
    originSessionFile: "/tmp/session-a.jsonl",
    runIds: [1, 2],
    pendingCompletion: {
      message: { customType: "test", content: "done", display: true, details: {} },
      options: { deliverAs: "followUp" },
      createdAt: Date.now(),
    },
    ...overrides,
  };
}

describe("persist.ts -- group pending completions", () => {
  it("upsertPendingGroupCompletion creates state file and adds entry", () => {
    persist.upsertPendingGroupCompletion(makeEntry({ groupId: "batch-001" }));

    assert.ok(fs.existsSync(stateFile), "State file should be created");
    const raw = fs.readFileSync(stateFile, "utf-8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].groupId, "batch-001");
  });

  it("upsertPendingGroupCompletion updates existing entry by scope+groupId", () => {
    persist.upsertPendingGroupCompletion(makeEntry({ scope: "batch", groupId: "g1" }));
    persist.upsertPendingGroupCompletion(makeEntry({ scope: "chain", groupId: "g2" }));

    // Update batch g1 with new runIds
    persist.upsertPendingGroupCompletion(
      makeEntry({ scope: "batch", groupId: "g1", runIds: [1, 2, 3] }),
    );

    const parsed = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
    assert.equal(parsed.length, 2);
    const updated = parsed.find(
      (e: Record<string, string>) => e.scope === "batch" && e.groupId === "g1",
    );
    assert.deepStrictEqual(updated.runIds, [1, 2, 3]);
  });

  it("clearPendingGroupCompletion removes matching entry", () => {
    persist.upsertPendingGroupCompletion(makeEntry({ scope: "batch", groupId: "g1" }));
    persist.upsertPendingGroupCompletion(makeEntry({ scope: "chain", groupId: "g2" }));

    persist.clearPendingGroupCompletion("batch", "g1");

    const parsed = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].scope, "chain");
    assert.equal(parsed[0].groupId, "g2");
  });

  it("consumePendingGroupCompletionsForSession returns and removes matching entries", () => {
    persist.upsertPendingGroupCompletion(
      makeEntry({ scope: "batch", groupId: "g1", originSessionFile: "/tmp/session-a.jsonl" }),
    );
    persist.upsertPendingGroupCompletion(
      makeEntry({ scope: "chain", groupId: "g2", originSessionFile: "/tmp/session-a.jsonl" }),
    );
    persist.upsertPendingGroupCompletion(
      makeEntry({ scope: "batch", groupId: "g3", originSessionFile: "/tmp/session-b.jsonl" }),
    );

    const consumed = persist.consumePendingGroupCompletionsForSession("/tmp/session-a.jsonl");
    assert.equal(consumed.length, 2);
    assert.ok(consumed.some((e) => e.groupId === "g1"));
    assert.ok(consumed.some((e) => e.groupId === "g2"));

    // g3 should remain
    const remaining = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].groupId, "g3");
  });

  it("consumePendingGroupCompletionsForSession returns empty for no match", () => {
    persist.upsertPendingGroupCompletion(
      makeEntry({ scope: "batch", groupId: "g1", originSessionFile: "/tmp/session-a.jsonl" }),
    );

    const consumed = persist.consumePendingGroupCompletionsForSession("/tmp/session-x.jsonl");
    assert.equal(consumed.length, 0);

    // Original entry should still be present
    const remaining = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
    assert.equal(remaining.length, 1);
  });

  it("evictStalePendingGroupCompletions removes old entries", () => {
    const now = Date.now();

    persist.upsertPendingGroupCompletion(
      makeEntry({
        groupId: "fresh",
        pendingCompletion: {
          message: { customType: "test", content: "done", display: true, details: {} },
          options: { deliverAs: "followUp" },
          createdAt: now,
        },
      }),
    );
    persist.upsertPendingGroupCompletion(
      makeEntry({
        groupId: "stale",
        pendingCompletion: {
          message: { customType: "test", content: "done", display: true, details: {} },
          options: { deliverAs: "followUp" },
          createdAt: now - 60 * 60 * 1000, // 1 hour ago
        },
      }),
    );

    persist.evictStalePendingGroupCompletions(30 * 60 * 1000); // 30 min max age

    const remaining = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].groupId, "fresh");
  });

  it("handles missing state file gracefully (reads as empty)", () => {
    // State file doesn't exist yet; consuming should return empty
    const consumed = persist.consumePendingGroupCompletionsForSession("/tmp/nonexistent.jsonl");
    assert.deepStrictEqual(consumed, []);
  });

  it("handles empty state file gracefully", () => {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(stateFile, "   ", "utf-8");

    const consumed = persist.consumePendingGroupCompletionsForSession("/tmp/session.jsonl");
    assert.deepStrictEqual(consumed, []);
  });

  it("handles non-array JSON in state file", () => {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(stateFile, '{"not": "array"}', "utf-8");

    const consumed = persist.consumePendingGroupCompletionsForSession("/tmp/session.jsonl");
    assert.deepStrictEqual(consumed, []);
  });

  it("filters out invalid entries from state file", () => {
    fs.mkdirSync(stateDir, { recursive: true });
    // Write a JSON array with valid and invalid entries
    const entries = [
      null,
      {
        scope: "invalid-scope",
        groupId: "g1",
        originSessionFile: "/tmp/s.jsonl",
        runIds: [1],
        pendingCompletion: { createdAt: Date.now() },
      },
      {
        scope: "batch",
        groupId: 123,
        originSessionFile: "/tmp/s.jsonl",
        runIds: [1],
        pendingCompletion: { createdAt: Date.now() },
      },
      {
        scope: "batch",
        groupId: "valid",
        originSessionFile: "/tmp/s.jsonl",
        runIds: [1],
        pendingCompletion: { createdAt: Date.now() },
      },
    ];
    fs.writeFileSync(stateFile, JSON.stringify(entries), "utf-8");

    // The valid entry should survive, invalid ones filtered out
    const consumed = persist.consumePendingGroupCompletionsForSession("/tmp/s.jsonl");
    assert.equal(consumed.length, 1);
    assert.equal(consumed[0]?.groupId, "valid");
  });

  it("handles corrupt state file gracefully", () => {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(stateFile, "not valid json{{{", "utf-8");

    // Should not throw, treats as empty
    const consumed = persist.consumePendingGroupCompletionsForSession("/tmp/session.jsonl");
    assert.deepStrictEqual(consumed, []);
  });
});

describe("persist.ts -- escalation", () => {
  it("getEscalationFilePath derives path from session file", () => {
    const result = persist.getEscalationFilePath("/some/path/session-123.jsonl");
    assert.ok(result.endsWith("session-123.yaml"));
    assert.ok(result.includes("escalations"));
  });

  it("readAndConsumeEscalation returns null for non-existent file", () => {
    const result = persist.readAndConsumeEscalation("/tmp/nonexistent-session.jsonl");
    assert.equal(result, null);
  });

  it("readAndConsumeEscalation reads valid YAML file, returns record, and deletes file", () => {
    // Create escalation directory and file in the test HOME
    const escalationsDir = path.join(tmpDir, ".pi", "agent", "escalations");
    fs.mkdirSync(escalationsDir, { recursive: true });

    const yamlContent = [
      "sessionFile: /tmp/subagent-42.jsonl",
      "message: Need help with deployment",
      "context: Running in production",
      'timestamp: "2024-01-15T10:30:00Z"',
    ].join("\n");

    const yamlPath = path.join(escalationsDir, "subagent-42.yaml");
    fs.writeFileSync(yamlPath, yamlContent, "utf-8");

    // readAndConsumeEscalation uses getEscalationFilePath which derives from session file
    const result = persist.readAndConsumeEscalation("/any/path/subagent-42.jsonl");
    assert.ok(result);
    assert.equal(result.sessionFile, "/tmp/subagent-42.jsonl");
    assert.equal(result.message, "Need help with deployment");
    assert.equal(result.context, "Running in production");
    assert.equal(result.timestamp, "2024-01-15T10:30:00Z");

    // File should be deleted after consumption
    assert.equal(fs.existsSync(yamlPath), false);
  });

  it("readAndConsumeEscalation handles YAML without timestamp field", () => {
    const escalationsDir = path.join(tmpDir, ".pi", "agent", "escalations");
    fs.mkdirSync(escalationsDir, { recursive: true });

    // No timestamp field → timestamp defaults to ""
    const yamlContent = [
      "sessionFile: /tmp/subagent-notimestamp.jsonl",
      "message: No timestamp here",
    ].join("\n");

    const yamlPath = path.join(escalationsDir, "subagent-notimestamp.yaml");
    fs.writeFileSync(yamlPath, yamlContent, "utf-8");

    const result = persist.readAndConsumeEscalation("/any/path/subagent-notimestamp.jsonl");
    assert.ok(result);
    assert.equal(result.sessionFile, "/tmp/subagent-notimestamp.jsonl");
    assert.equal(result.message, "No timestamp here");
    assert.equal(result.timestamp, "");
  });

  it("readAndConsumeEscalation returns null for YAML missing required fields", () => {
    const escalationsDir = path.join(tmpDir, ".pi", "agent", "escalations");
    fs.mkdirSync(escalationsDir, { recursive: true });

    // Missing 'message' field
    const yamlContent = "sessionFile: /tmp/subagent-99.jsonl\ncontext: some context\n";
    const yamlPath = path.join(escalationsDir, "subagent-99.yaml");
    fs.writeFileSync(yamlPath, yamlContent, "utf-8");

    const result = persist.readAndConsumeEscalation("/any/path/subagent-99.jsonl");
    assert.equal(result, null);
  });

  it("readAndConsumeEscalation handles multiline YAML values", () => {
    const escalationsDir = path.join(tmpDir, ".pi", "agent", "escalations");
    fs.mkdirSync(escalationsDir, { recursive: true });

    const yamlContent = [
      "sessionFile: /tmp/subagent-50.jsonl",
      "message: First line",
      "  continuation of message",
      "  third line of message",
      "timestamp: 2024-01-15",
    ].join("\n");

    const yamlPath = path.join(escalationsDir, "subagent-50.yaml");
    fs.writeFileSync(yamlPath, yamlContent, "utf-8");

    const result = persist.readAndConsumeEscalation("/any/path/subagent-50.jsonl");
    assert.ok(result);
    assert.equal(result.sessionFile, "/tmp/subagent-50.jsonl");
    assert.ok(result.message.includes("First line"));
    assert.ok(result.message.includes("continuation of message"));
    assert.ok(result.message.includes("third line of message"));
  });

  it("readAndConsumeEscalation handles YAML with comments and empty lines", () => {
    const escalationsDir = path.join(tmpDir, ".pi", "agent", "escalations");
    fs.mkdirSync(escalationsDir, { recursive: true });

    const yamlContent = [
      "# This is a comment",
      "",
      "sessionFile: /tmp/subagent-51.jsonl",
      "# Another comment",
      "message: Help needed",
      "",
      "timestamp: now",
    ].join("\n");

    const yamlPath = path.join(escalationsDir, "subagent-51.yaml");
    fs.writeFileSync(yamlPath, yamlContent, "utf-8");

    const result = persist.readAndConsumeEscalation("/any/path/subagent-51.jsonl");
    assert.ok(result);
    assert.equal(result.sessionFile, "/tmp/subagent-51.jsonl");
    assert.equal(result.message, "Help needed");
    assert.equal(result.timestamp, "now");
  });

  it("readAndConsumeEscalation strips surrounding quotes from values", () => {
    const escalationsDir = path.join(tmpDir, ".pi", "agent", "escalations");
    fs.mkdirSync(escalationsDir, { recursive: true });

    const yamlContent = [
      'sessionFile: "/tmp/subagent-52.jsonl"',
      "message: 'quoted message'",
      "timestamp: plain-value",
    ].join("\n");

    const yamlPath = path.join(escalationsDir, "subagent-52.yaml");
    fs.writeFileSync(yamlPath, yamlContent, "utf-8");

    const result = persist.readAndConsumeEscalation("/any/path/subagent-52.jsonl");
    assert.ok(result);
    assert.equal(result.sessionFile, "/tmp/subagent-52.jsonl");
    assert.equal(result.message, "quoted message");
  });

  it("readAndConsumeEscalation handles YAML with lines that have no colon", () => {
    const escalationsDir = path.join(tmpDir, ".pi", "agent", "escalations");
    fs.mkdirSync(escalationsDir, { recursive: true });

    const yamlContent = [
      "sessionFile: /tmp/subagent-53.jsonl",
      "message: test message",
      "no-colon-at-start",
      "timestamp: now",
    ].join("\n");

    const yamlPath = path.join(escalationsDir, "subagent-53.yaml");
    fs.writeFileSync(yamlPath, yamlContent, "utf-8");

    const result = persist.readAndConsumeEscalation("/any/path/subagent-53.jsonl");
    assert.ok(result);
    assert.equal(result.sessionFile, "/tmp/subagent-53.jsonl");
    assert.equal(result.message, "test message");
  });

  it("readAndConsumeEscalation succeeds even when file deletion fails (read-only dir)", () => {
    const escalationsDir = path.join(tmpDir, ".pi", "agent", "escalations");
    fs.mkdirSync(escalationsDir, { recursive: true });

    const yamlContent = [
      "sessionFile: /tmp/subagent-54.jsonl",
      "message: delete will fail",
      "timestamp: now",
    ].join("\n");

    const yamlPath = path.join(escalationsDir, "subagent-54.yaml");
    fs.writeFileSync(yamlPath, yamlContent, "utf-8");

    // Make the directory read-only so unlinkSync fails
    fs.chmodSync(escalationsDir, 0o555);
    try {
      const result = persist.readAndConsumeEscalation("/any/path/subagent-54.jsonl");
      assert.ok(result);
      assert.equal(result.sessionFile, "/tmp/subagent-54.jsonl");
      assert.equal(result.message, "delete will fail");
      // File should still exist since deletion failed
      assert.ok(fs.existsSync(yamlPath));
    } finally {
      // Restore permissions for cleanup
      fs.chmodSync(escalationsDir, 0o755);
      try {
        fs.unlinkSync(yamlPath);
      } catch {
        // ignore
      }
    }
  });

  it("readAndConsumeEscalation returns null on outer catch when file read fails", () => {
    const escalationsDir = path.join(tmpDir, ".pi", "agent", "escalations");
    fs.mkdirSync(escalationsDir, { recursive: true });

    const yamlPath = path.join(escalationsDir, "subagent-55.yaml");
    fs.writeFileSync(yamlPath, "valid content", "utf-8");
    // Make file unreadable
    fs.chmodSync(yamlPath, 0o000);

    try {
      const result = persist.readAndConsumeEscalation("/any/path/subagent-55.jsonl");
      assert.equal(result, null);
    } finally {
      // Restore permissions for cleanup
      fs.chmodSync(yamlPath, 0o644);
      fs.unlinkSync(yamlPath);
    }
  });
});
