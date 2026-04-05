import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  convertHookTimeoutToMs,
  extractDecision,
  fallbackReason,
  parseJsonFromStdout,
  toBlockReason,
} from "../core/decision.js";
import { DEFAULT_HOOK_TIMEOUT_MS, type HookExecResult } from "../core/types.js";

function makeResult(overrides: Partial<HookExecResult> = {}): HookExecResult {
  return {
    command: "echo",
    code: 0,
    stdout: "",
    stderr: "",
    timedOut: false,
    json: null,
    ...overrides,
  };
}

// ━━━ convertHookTimeoutToMs ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("convertHookTimeoutToMs", () => {
  it("converts a positive finite number of seconds to milliseconds", () => {
    assert.equal(convertHookTimeoutToMs(30), 30_000);
    assert.equal(convertHookTimeoutToMs(1.5), 1500);
  });

  it("returns default when undefined", () => {
    assert.equal(convertHookTimeoutToMs(undefined), DEFAULT_HOOK_TIMEOUT_MS);
  });

  it("returns default when zero or negative", () => {
    assert.equal(convertHookTimeoutToMs(0), DEFAULT_HOOK_TIMEOUT_MS);
    assert.equal(convertHookTimeoutToMs(-5), DEFAULT_HOOK_TIMEOUT_MS);
  });

  it("returns default when NaN or Infinity", () => {
    assert.equal(convertHookTimeoutToMs(Number.NaN), DEFAULT_HOOK_TIMEOUT_MS);
    assert.equal(convertHookTimeoutToMs(Number.POSITIVE_INFINITY), DEFAULT_HOOK_TIMEOUT_MS);
  });

  it("returns default when passed a non-number via any-cast", () => {
    assert.equal(
      convertHookTimeoutToMs("10" as unknown as number | undefined),
      DEFAULT_HOOK_TIMEOUT_MS,
    );
  });
});

// ━━━ parseJsonFromStdout ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseJsonFromStdout", () => {
  it("returns null for empty/whitespace stdout", () => {
    assert.equal(parseJsonFromStdout(""), null);
    assert.equal(parseJsonFromStdout("   \n\t "), null);
  });

  it("parses a single JSON object", () => {
    const result = parseJsonFromStdout('{"a": 1}');
    assert.deepEqual(result, { a: 1 });
  });

  it("parses last valid JSON line when whole-string parse fails", () => {
    const stdout = 'garbage line\n{"ok": true}\ntail garbage';
    const result = parseJsonFromStdout(stdout);
    // last line doesn't parse, but the middle one does
    assert.deepEqual(result, { ok: true });
  });

  it("scans from the end backwards and picks the last parseable line", () => {
    const stdout = '{"first": 1}\n{"second": 2}';
    const result = parseJsonFromStdout(stdout);
    assert.deepEqual(result, { second: 2 });
  });

  it("returns null when no line parses", () => {
    assert.equal(parseJsonFromStdout("not json\nalso not json"), null);
  });

  it("parses non-object JSON values", () => {
    assert.equal(parseJsonFromStdout("42"), 42);
    assert.equal(parseJsonFromStdout('"hello"'), "hello");
    assert.equal(parseJsonFromStdout("null"), null); // treated as JSON null → returns null
    assert.equal(parseJsonFromStdout("true"), true);
  });

  it("skips blank lines when scanning", () => {
    const stdout = '\n\n  \n{"kept": true}\n\n  \n';
    const result = parseJsonFromStdout(stdout);
    assert.deepEqual(result, { kept: true });
  });
});

// ━━━ fallbackReason ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("fallbackReason", () => {
  it("returns undefined when both stderr and stdout are empty", () => {
    assert.equal(fallbackReason("", ""), undefined);
    assert.equal(fallbackReason("  ", "\n\t"), undefined);
  });

  it("prefers stderr over stdout", () => {
    assert.equal(fallbackReason("err text", "out text"), "err text");
  });

  it("falls back to stdout when stderr is empty", () => {
    assert.equal(fallbackReason("", "out text"), "out text");
  });

  it("truncates text over 2000 chars", () => {
    const long = "x".repeat(2500);
    const result = fallbackReason(long, "");
    assert.ok(result);
    assert.equal(result?.length, 2003);
    assert.ok(result?.endsWith("..."));
  });

  it("does not truncate text exactly 2000 chars", () => {
    const text = "y".repeat(2000);
    assert.equal(fallbackReason(text, ""), text);
  });
});

// ━━━ extractDecision ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractDecision", () => {
  it("returns none for null json and non-zero exit not equal 2", () => {
    assert.deepEqual(extractDecision(makeResult()), { action: "none" });
  });

  it("maps permissionDecision=allow at top level", () => {
    const result = makeResult({ json: { permissionDecision: "allow" } });
    assert.deepEqual(extractDecision(result), { action: "allow" });
  });

  it("maps permissionDecision=ask at top level", () => {
    const result = makeResult({ json: { permissionDecision: "ask" } });
    assert.deepEqual(extractDecision(result), { action: "ask" });
  });

  it("maps permissionDecision=deny at top level to block", () => {
    const result = makeResult({ json: { permissionDecision: "deny" } });
    assert.deepEqual(extractDecision(result), { action: "block" });
  });

  it("maps decision=block at top level to block", () => {
    const result = makeResult({ json: { decision: "block" } });
    assert.deepEqual(extractDecision(result), { action: "block" });
  });

  it("prefers hookSpecificOutput.permissionDecision over top-level", () => {
    const result = makeResult({
      json: {
        permissionDecision: "deny",
        hookSpecificOutput: { permissionDecision: "allow" },
      },
    });
    assert.deepEqual(extractDecision(result), { action: "allow" });
  });

  it("prefers hookSpecificOutput.decision over top-level decision", () => {
    const result = makeResult({
      json: {
        decision: "block",
        hookSpecificOutput: { decision: "approve" },
      },
    });
    // "approve" is not mapped, and exit code is 0, so falls through to "none"
    assert.equal(extractDecision(result).action, "none");
  });

  it("falls back to decision field when permissionDecision is missing", () => {
    const result = makeResult({ json: { decision: "allow" } });
    assert.equal(extractDecision(result).action, "allow");
  });

  it("is case-insensitive", () => {
    assert.equal(extractDecision(makeResult({ json: { decision: "ALLOW" } })).action, "allow");
    assert.equal(extractDecision(makeResult({ json: { decision: "Block" } })).action, "block");
    assert.equal(extractDecision(makeResult({ json: { decision: "ASK" } })).action, "ask");
    assert.equal(extractDecision(makeResult({ json: { decision: "DENY" } })).action, "block");
  });

  it("attaches a reason from hookSpecificOutput.permissionDecisionReason", () => {
    const result = makeResult({
      json: {
        hookSpecificOutput: {
          permissionDecision: "deny",
          permissionDecisionReason: "too spicy",
        },
      },
    });
    assert.deepEqual(extractDecision(result), { action: "block", reason: "too spicy" });
  });

  it("attaches a reason from top-level permissionDecisionReason", () => {
    const result = makeResult({
      json: { permissionDecision: "deny", permissionDecisionReason: "nope" },
    });
    assert.deepEqual(extractDecision(result), { action: "block", reason: "nope" });
  });

  it("attaches a reason from hookSpecificOutput.reason", () => {
    const result = makeResult({
      json: { decision: "block", hookSpecificOutput: { reason: "inner" } },
    });
    assert.deepEqual(extractDecision(result), { action: "block", reason: "inner" });
  });

  it("attaches a reason from top-level reason", () => {
    const result = makeResult({ json: { decision: "block", reason: "top-level" } });
    assert.deepEqual(extractDecision(result), { action: "block", reason: "top-level" });
  });

  it("uses fallbackReason from stderr when no reason fields", () => {
    const result = makeResult({
      code: 2,
      stderr: "boom",
      stdout: "",
      json: null,
    });
    assert.deepEqual(extractDecision(result), { action: "block", reason: "boom" });
  });

  it("defaults block reason when exit code 2 and stderr empty", () => {
    const result = makeResult({ code: 2 });
    assert.deepEqual(extractDecision(result), {
      action: "block",
      reason: "Hook requested block (exit code 2).",
    });
  });

  it("falls through to none when json present but no decision field and code != 2", () => {
    const result = makeResult({ code: 1, json: { foo: "bar" } });
    assert.equal(extractDecision(result).action, "none");
  });

  it("attaches fallback reason to 'none' when stdout/stderr has text", () => {
    const result = makeResult({ code: 1, stderr: "warning" });
    // extractDecision attaches reason even for "none" if fallback yields text
    assert.deepEqual(extractDecision(result), { action: "none", reason: "warning" });
  });

  it("handles hookSpecificOutput that is not an object", () => {
    const result = makeResult({
      json: { hookSpecificOutput: "not-an-object", decision: "allow" },
    });
    assert.equal(extractDecision(result).action, "allow");
  });

  it("handles json that is not an object (number)", () => {
    const result = makeResult({ json: 42 });
    assert.equal(extractDecision(result).action, "none");
  });

  it("ignores non-string permissionDecision value", () => {
    const result = makeResult({ json: { permissionDecision: 123 } });
    assert.equal(extractDecision(result).action, "none");
  });

  it("returns decision unchanged when reason already set on allow", () => {
    // allow sets no reason; fallback reason from stderr should be appended
    const result = makeResult({
      json: { permissionDecision: "allow" },
      stderr: "info",
    });
    assert.deepEqual(extractDecision(result), { action: "allow", reason: "info" });
  });
});

// ━━━ toBlockReason ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("toBlockReason", () => {
  it("returns fallback when reason is undefined", () => {
    assert.equal(toBlockReason(undefined, "fb"), "fb");
  });

  it("returns fallback when reason is blank", () => {
    assert.equal(toBlockReason("   ", "fb"), "fb");
    assert.equal(toBlockReason("", "fb"), "fb");
  });

  it("returns trimmed reason when present and short", () => {
    assert.equal(toBlockReason("  hello  ", "fb"), "hello");
  });

  it("returns reason as-is when exactly 2000 chars (post-trim)", () => {
    const text = "a".repeat(2000);
    assert.equal(toBlockReason(text, "fb"), text);
  });

  it("truncates reason over 2000 chars with ellipsis", () => {
    const text = "b".repeat(2500);
    const result = toBlockReason(text, "fb");
    assert.equal(result.length, 2003);
    assert.ok(result.endsWith("..."));
  });
});
