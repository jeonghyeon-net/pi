import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  clearStopHookActive,
  getHookSessionId,
  getSessionId,
  getStopHookActive,
  markParseErrorNotified,
  pinHookSessionId,
  resetHookSessionId,
  setStopHookActive,
} from "../core/session.js";

function makeCtx(sessionId: string | undefined | (() => string | undefined)): ExtensionContext {
  return {
    sessionManager: {
      getSessionId: typeof sessionId === "function" ? sessionId : () => sessionId,
    },
  } as unknown as ExtensionContext;
}

// ━━━ getSessionId ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getSessionId", () => {
  it("returns the session id from sessionManager", () => {
    const ctx = makeCtx("abc123");
    assert.equal(getSessionId(ctx), "abc123");
  });

  it("returns 'unknown' when session id is empty string", () => {
    const ctx = makeCtx("");
    assert.equal(getSessionId(ctx), "unknown");
  });

  it("returns 'unknown' when session id is undefined", () => {
    const ctx = makeCtx(undefined);
    assert.equal(getSessionId(ctx), "unknown");
  });

  it("returns 'unknown' when getSessionId throws", () => {
    const ctx = makeCtx(() => {
      throw new Error("session manager unavailable");
    });
    assert.equal(getSessionId(ctx), "unknown");
  });
});

// ━━━ getHookSessionId / pinHookSessionId / resetHookSessionId ━━━━━━━━━━━━━

describe("hook session id pinning", () => {
  beforeEach(() => {
    resetHookSessionId();
  });

  it("pins the session id on first call and returns the pinned value thereafter", () => {
    let current = "first";
    const ctx = makeCtx(() => current);
    assert.equal(getHookSessionId(ctx), "first");
    current = "changed";
    assert.equal(getHookSessionId(ctx), "first");
  });

  it("pinHookSessionId overrides any previously pinned id", () => {
    const ctx = makeCtx("from-ctx");
    assert.equal(getHookSessionId(ctx), "from-ctx");
    pinHookSessionId("explicit");
    assert.equal(getHookSessionId(ctx), "explicit");
  });

  it("resetHookSessionId clears the pinned id so next call re-reads from ctx", () => {
    pinHookSessionId("stale");
    resetHookSessionId();
    const ctx = makeCtx("fresh");
    assert.equal(getHookSessionId(ctx), "fresh");
  });

  it("falls back to 'unknown' when ctx throws and nothing is pinned", () => {
    const ctx = makeCtx(() => {
      throw new Error("boom");
    });
    assert.equal(getHookSessionId(ctx), "unknown");
  });
});

// ━━━ stop hook active map ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("stop hook active state", () => {
  beforeEach(() => {
    clearStopHookActive();
  });

  it("returns false by default", () => {
    assert.equal(getStopHookActive("session-x"), false);
  });

  it("stores and retrieves per-session values", () => {
    setStopHookActive("session-a", true);
    setStopHookActive("session-b", false);
    assert.equal(getStopHookActive("session-a"), true);
    assert.equal(getStopHookActive("session-b"), false);
  });

  it("overwrites existing values", () => {
    setStopHookActive("s1", true);
    setStopHookActive("s1", false);
    assert.equal(getStopHookActive("s1"), false);
  });

  it("clearStopHookActive empties all entries", () => {
    setStopHookActive("a", true);
    setStopHookActive("b", true);
    clearStopHookActive();
    assert.equal(getStopHookActive("a"), false);
    assert.equal(getStopHookActive("b"), false);
  });
});

// ━━━ markParseErrorNotified ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("markParseErrorNotified", () => {
  it("returns true the first time a path is seen", () => {
    assert.equal(markParseErrorNotified("/tmp/unique-path-1.json"), true);
  });

  it("returns false for subsequent calls with the same path", () => {
    const p = "/tmp/unique-path-2.json";
    assert.equal(markParseErrorNotified(p), true);
    assert.equal(markParseErrorNotified(p), false);
    assert.equal(markParseErrorNotified(p), false);
  });

  it("tracks different paths independently", () => {
    assert.equal(markParseErrorNotified("/tmp/a.json"), true);
    assert.equal(markParseErrorNotified("/tmp/b.json"), true);
    assert.equal(markParseErrorNotified("/tmp/a.json"), false);
  });
});
