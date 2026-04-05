import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { errorToMessage, execCommandHook } from "../core/exec.js";

// ━━━ errorToMessage ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("errorToMessage", () => {
  it("returns .message for Error instances", () => {
    assert.equal(errorToMessage(new Error("boom")), "boom");
  });

  it("returns .message for Error subclasses", () => {
    assert.equal(errorToMessage(new TypeError("bad type")), "bad type");
  });

  it("stringifies non-Error values (string)", () => {
    assert.equal(errorToMessage("plain"), "plain");
  });

  it("stringifies non-Error values (number)", () => {
    assert.equal(errorToMessage(42), "42");
  });

  it("stringifies undefined and null", () => {
    assert.equal(errorToMessage(undefined), "undefined");
    assert.equal(errorToMessage(null), "null");
  });
});

// Real subprocess-based tests. Each uses small, fast shell commands.
// These validate the end-to-end spawn/pipe/parse behavior of execCommandHook.

describe("execCommandHook", () => {
  it("captures stdout from a successful command", async () => {
    const result = await execCommandHook("echo hello-world", process.cwd(), {}, 10_000);
    assert.equal(result.code, 0);
    assert.ok(result.stdout.includes("hello-world"));
    assert.equal(result.stderr, "");
    assert.equal(result.timedOut, false);
    assert.equal(result.command, "echo hello-world");
  });

  it("captures non-zero exit codes", async () => {
    const result = await execCommandHook("exit 7", process.cwd(), {}, 10_000);
    assert.equal(result.code, 7);
    assert.equal(result.timedOut, false);
  });

  it("captures stderr output", async () => {
    const result = await execCommandHook("echo oops 1>&2; exit 1", process.cwd(), {}, 10_000);
    assert.equal(result.code, 1);
    assert.ok(result.stderr.includes("oops"));
  });

  it("parses JSON from stdout when present", async () => {
    const result = await execCommandHook(`echo '{"decision":"allow"}'`, process.cwd(), {}, 10_000);
    assert.equal(result.code, 0);
    assert.deepEqual(result.json, { decision: "allow" });
  });

  it("returns null json when stdout is not valid JSON", async () => {
    const result = await execCommandHook("echo not-json", process.cwd(), {}, 10_000);
    assert.equal(result.json, null);
  });

  it("sends payload to stdin as JSON", async () => {
    // cat echoes stdin back out; the hook sends payload + newline.
    const result = await execCommandHook("cat", process.cwd(), { foo: "bar" }, 10_000);
    assert.equal(result.code, 0);
    const parsed = JSON.parse(result.stdout.trim());
    assert.deepEqual(parsed, { foo: "bar" });
  });

  it("sets CLAUDE_PROJECT_DIR and PWD env vars to cwd", async () => {
    const result = await execCommandHook('echo "$CLAUDE_PROJECT_DIR|$PWD"', "/tmp", {}, 10_000);
    assert.equal(result.code, 0);
    assert.ok(result.stdout.includes("/tmp|/tmp"));
  });

  it("times out long-running commands and marks timedOut=true", async () => {
    // 10s sleep, but we abort after 150ms.
    const result = await execCommandHook("sleep 10", process.cwd(), {}, 150);
    assert.equal(result.timedOut, true);
    // code should not be 0 (killed process exits non-zero)
    assert.notEqual(result.code, 0);
  });

  it("treats timeoutMs <= 0 as no timeout", async () => {
    const result = await execCommandHook("echo no-timeout", process.cwd(), {}, 0);
    assert.equal(result.code, 0);
    assert.equal(result.timedOut, false);
    assert.ok(result.stdout.includes("no-timeout"));
  });

  it("treats non-finite timeoutMs as no timeout", async () => {
    const result = await execCommandHook("echo inf", process.cwd(), {}, Number.POSITIVE_INFINITY);
    assert.equal(result.code, 0);
    assert.equal(result.timedOut, false);
  });

  it("resolves with code 1 and captures error when spawn cwd is invalid", async () => {
    // Invalid cwd makes the child emit an 'error' event.
    const result = await execCommandHook(
      "echo never",
      "/nonexistent-directory-xyz-12345",
      {},
      10_000,
    );
    assert.equal(result.code, 1);
    // stderr should contain some error message from spawn failure
    assert.ok(result.stderr.length > 0);
  });

  it("captures stdin write failure when payload contains circular references", async () => {
    // JSON.stringify throws on circular structures; the catch branch should
    // finalize the result with code=1 and the error message in stderr.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = await execCommandHook("cat", process.cwd(), circular, 10_000);
    assert.equal(result.code, 1);
    assert.ok(result.stderr.includes("stdin write failed"));
    assert.ok(result.stderr.includes("circular"));
  });
});
