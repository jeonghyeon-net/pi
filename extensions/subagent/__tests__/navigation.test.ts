import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it, mock } from "node:test";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { createStore } from "../core/store.js";
import {
  captureSwitchSession,
  compactPath,
  ensureSessionFileMaterialized,
  normalizePath,
  resolveParentSessionFile,
  resolveSwitchSession,
  resolveValidPath,
  subBackHandler,
  subTransHandler,
} from "../session/navigation.js";

// ━━━ Temp dir management ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-nav-test-"));

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

// ━━━ normalizePath ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("normalizePath", () => {
  it("returns null for null/undefined/empty", () => {
    assert.equal(normalizePath(null), null);
    assert.equal(normalizePath(undefined), null);
    assert.equal(normalizePath(""), null);
  });

  it("returns null for non-string values", () => {
    assert.equal(normalizePath(42), null);
    assert.equal(normalizePath({}), null);
    assert.equal(normalizePath(true), null);
  });

  it("returns null for whitespace-only strings", () => {
    assert.equal(normalizePath("   "), null);
    assert.equal(normalizePath("\t\n"), null);
  });

  it("trims outer whitespace", () => {
    assert.equal(normalizePath("  /some/path  "), "/some/path");
  });

  it("strips CR/LF/TAB characters", () => {
    assert.equal(normalizePath("/some\r\n/path\t/file"), "/some/path/file");
  });

  it("preserves interior spaces in path", () => {
    assert.equal(normalizePath("/some/path with spaces/file"), "/some/path with spaces/file");
  });
});

// ━━━ compactPath ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("compactPath", () => {
  it("returns null for null/undefined/empty", () => {
    assert.equal(compactPath(null), null);
    assert.equal(compactPath(undefined), null);
    assert.equal(compactPath(""), null);
  });

  it("returns null for non-string values", () => {
    assert.equal(compactPath(42), null);
  });

  it("returns null for whitespace-only strings", () => {
    assert.equal(compactPath("   "), null);
    assert.equal(compactPath("\t \n"), null);
  });

  it("strips ALL whitespace", () => {
    assert.equal(compactPath("/some /path /file"), "/some/path/file");
    assert.equal(compactPath("  /a \t b \n c  "), "/abc");
  });
});

// ━━━ resolveValidPath ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveValidPath", () => {
  it("returns null for null input", () => {
    assert.equal(resolveValidPath(null), null);
  });

  it("returns null for non-existent path", () => {
    assert.equal(resolveValidPath("/tmp/definitely-not-a-real-file-xyz-123"), null);
  });

  it("returns stageA path when file exists", () => {
    const filePath = path.join(tmpDir, "test-file-a.txt");
    fs.writeFileSync(filePath, "hello", "utf-8");
    assert.equal(resolveValidPath(filePath), filePath);
  });

  it("returns stageA path for path with CR/LF wrapping (if file exists after strip)", () => {
    const filePath = path.join(tmpDir, "test-file-b.txt");
    fs.writeFileSync(filePath, "hello", "utf-8");
    // Add CR/LF to the path, normalizePath should strip them
    const wrappedPath = `${filePath}\r\n`;
    assert.equal(resolveValidPath(wrappedPath), filePath);
  });

  it("falls back to stageB (compact) when stageA does not exist but compact does", () => {
    // Create a file whose path has no spaces
    const filePath = path.join(tmpDir, "compacted.txt");
    fs.writeFileSync(filePath, "hello", "utf-8");
    // Feed in the path with spaces inserted — stageA will not find it,
    // but stageB (compact) will find it
    const parent = path.dirname(filePath);
    const spacedPath = `${parent}/ compacted.txt`;
    // stageA = "parent/ compacted.txt" (preserves space) — does not exist
    // stageB = "parent/compacted.txt" (stripped space) — exists
    const result = resolveValidPath(spacedPath);
    assert.equal(result, filePath);
  });

  it("returns null when neither stageA nor stageB paths exist", () => {
    assert.equal(resolveValidPath("/tmp/no-file-here-xxx"), null);
  });

  it("returns stageA when both would be the same (no fallback needed)", () => {
    const filePath = path.join(tmpDir, "same-path.txt");
    fs.writeFileSync(filePath, "hello", "utf-8");
    // stageA and stageB would both produce the same path
    assert.equal(resolveValidPath(filePath), filePath);
  });
});

// ━━━ captureSwitchSession ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("captureSwitchSession", () => {
  it("captures switchSession from ExtensionCommandContext", () => {
    const store = createStore();
    const switchFn = async (_path: string) => ({ cancelled: false });
    const ctx = { switchSession: switchFn } as never;
    captureSwitchSession(store, ctx);
    assert.ok(store.switchSessionFn);
  });

  it("does not overwrite already-captured switchSession", () => {
    const store = createStore();
    const firstFn = async (_path: string) => ({ cancelled: false });
    store.switchSessionFn = firstFn;

    const secondFn = async (_path: string) => ({ cancelled: true });
    const ctx = { switchSession: secondFn } as never;
    captureSwitchSession(store, ctx);
    // Should still be the first function
    assert.equal(store.switchSessionFn, firstFn);
  });

  it("does nothing for ExtensionContext without switchSession", () => {
    const store = createStore();
    const ctx = { someOtherProp: true } as never;
    captureSwitchSession(store, ctx);
    assert.equal(store.switchSessionFn, null);
  });

  it("does nothing when switchSession is not a function", () => {
    const store = createStore();
    const ctx = { switchSession: "not-a-function" } as never;
    captureSwitchSession(store, ctx);
    assert.equal(store.switchSessionFn, null);
  });
});

// ━━━ resolveSwitchSession ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveSwitchSession", () => {
  it("returns switchSession from ctx when available", () => {
    const store = createStore();
    const switchFn = async (_path: string) => ({ cancelled: false });
    const ctx = { switchSession: switchFn } as never;
    const resolved = resolveSwitchSession(ctx, store);
    assert.ok(resolved);
  });

  it("falls back to store.switchSessionFn when ctx has no switchSession", () => {
    const store = createStore();
    const storedFn = async (_path: string) => ({ cancelled: false });
    store.switchSessionFn = storedFn;
    const ctx = {} as never;
    const resolved = resolveSwitchSession(ctx, store);
    assert.equal(resolved, storedFn);
  });

  it("returns null when neither ctx nor store has switchSession", () => {
    const store = createStore();
    const ctx = {} as never;
    const resolved = resolveSwitchSession(ctx, store);
    assert.equal(resolved, null);
  });
});

// ━━━ resolveParentSessionFile ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveParentSessionFile", () => {
  it("returns cached value when it exists on disk", () => {
    const store = createStore();
    const filePath = path.join(tmpDir, "parent-session.jsonl");
    fs.writeFileSync(filePath, "{}", "utf-8");
    store.currentParentSessionFile = filePath;

    const ctx = {
      sessionManager: { getEntries: () => [] },
    } as never;
    const result = resolveParentSessionFile(ctx, store);
    assert.equal(result, filePath);
  });

  it("returns null when cached value does not exist on disk and no entries", () => {
    const store = createStore();
    store.currentParentSessionFile = "/tmp/nonexistent-parent.jsonl";

    const ctx = {
      sessionManager: { getEntries: () => [] },
    } as never;
    const result = resolveParentSessionFile(ctx, store);
    assert.equal(result, null);
  });

  it("rescans entries for parent link when cache is stale", () => {
    const store = createStore();
    store.currentParentSessionFile = "/tmp/nonexistent-parent.jsonl";

    const parentPath = path.join(tmpDir, "parent-from-entry.jsonl");
    fs.writeFileSync(parentPath, "{}", "utf-8");

    const entries = [
      {
        type: "custom" as const,
        id: "e1",
        parentId: null,
        timestamp: new Date().toISOString(),
        customType: "subagent-parent",
        data: { parentSessionFile: parentPath },
      },
    ];
    const ctx = {
      sessionManager: { getEntries: () => entries },
    } as never;
    const result = resolveParentSessionFile(ctx, store);
    assert.equal(result, parentPath);
    assert.equal(store.currentParentSessionFile, parentPath);
  });

  it("uses the latest parent entry when multiple exist", () => {
    const store = createStore();
    store.currentParentSessionFile = null;

    const path1 = path.join(tmpDir, "parent-old.jsonl");
    const path2 = path.join(tmpDir, "parent-new.jsonl");
    fs.writeFileSync(path1, "{}", "utf-8");
    fs.writeFileSync(path2, "{}", "utf-8");

    const entries = [
      {
        type: "custom" as const,
        id: "e1",
        parentId: null,
        timestamp: new Date().toISOString(),
        customType: "subagent-parent",
        data: { parentSessionFile: path1 },
      },
      {
        type: "custom" as const,
        id: "e2",
        parentId: null,
        timestamp: new Date().toISOString(),
        customType: "subagent-parent",
        data: { parentSessionFile: path2 },
      },
    ];
    const ctx = {
      sessionManager: { getEntries: () => entries },
    } as never;
    const result = resolveParentSessionFile(ctx, store);
    assert.equal(result, path2);
  });

  it("returns null when entries rescan finds no valid paths", () => {
    const store = createStore();
    store.currentParentSessionFile = null;

    const entries = [
      {
        type: "custom" as const,
        id: "e1",
        parentId: null,
        timestamp: new Date().toISOString(),
        customType: "subagent-parent",
        data: { parentSessionFile: "/tmp/nonexistent-xxx.jsonl" },
      },
    ];
    const ctx = {
      sessionManager: { getEntries: () => entries },
    } as never;
    const result = resolveParentSessionFile(ctx, store);
    assert.equal(result, null);
  });

  it("handles sessionManager without getEntries method", () => {
    const store = createStore();
    store.currentParentSessionFile = "/tmp/nonexistent-parent.jsonl";
    const ctx = {
      sessionManager: {
        // No getEntries — should fall back to empty array
        getSessionFile: () => "/tmp/test.jsonl",
      },
    } as never;
    const result = resolveParentSessionFile(ctx, store);
    assert.equal(result, null);
  });

  it("handles getEntries throwing gracefully", () => {
    const store = createStore();
    store.currentParentSessionFile = null;

    const ctx = {
      sessionManager: {
        getEntries: () => {
          throw new Error("session error");
        },
      },
    } as never;
    const result = resolveParentSessionFile(ctx, store);
    assert.equal(result, null);
  });
});

// ━━━ Mock helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeMockCtx(overrides: Record<string, unknown> = {}): ExtensionContext {
  const notifyFn = mock.fn(() => {
    /* noop */
  });
  return {
    hasUI: false,
    cwd: "/tmp",
    ui: {
      notify: notifyFn,
      setWidget: () => undefined,
      select: () => Promise.resolve(undefined),
      confirm: () => Promise.resolve(false),
      input: () => Promise.resolve(undefined),
      onTerminalInput: () => () => undefined,
      setStatus: () => undefined,
      setWorkingMessage: () => undefined,
      setHiddenThinkingLabel: () => undefined,
      setFooter: () => undefined,
      setTitle: () => undefined,
      custom: () => Promise.resolve(undefined),
      pasteToEditor: () => undefined,
      setEditorText: () => undefined,
      getEditorText: () => "",
      editor: () => Promise.resolve(undefined),
      setEditorComponent: () => undefined,
      setHeader: () => undefined,
      theme: {} as ExtensionContext["ui"]["theme"],
      getAllThemes: () => [],
      getTheme: () => undefined,
      setTheme: () => ({ success: true }),
      getToolsExpanded: () => false,
      setToolsExpanded: () => undefined,
    },
    sessionManager: {
      getSessionFile: () => "/tmp/current-session.jsonl",
      getEntries: () => [],
      getCwd: () => "/tmp",
      getSessionDir: () => "/tmp",
      getSessionId: () => "test-session",
      getLeafId: () => "leaf-id",
      getLeafEntry: () => undefined,
      getEntry: () => undefined,
      getLabel: () => undefined,
      getBranch: () => [],
      getHeader: () => undefined,
      getTree: () => [],
      getSessionName: () => undefined,
    },
    modelRegistry: {
      getAll: () => [],
    } as unknown as ExtensionContext["modelRegistry"],
    model: undefined,
    isIdle: () => true,
    signal: undefined,
    abort: () => undefined,
    hasPendingMessages: () => false,
    shutdown: () => undefined,
    getContextUsage: () => undefined,
    compact: () => undefined,
    getSystemPrompt: () => "",
    ...overrides,
  } as unknown as ExtensionContext;
}

// ━━━ ensureSessionFileMaterialized ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ensureSessionFileMaterialized", () => {
  it("does nothing when sessionFile is null", () => {
    const ctx = makeMockCtx();
    ensureSessionFileMaterialized(ctx, null);
    // No error thrown, nothing written
  });

  it("does nothing when sessionFile normalizes to null", () => {
    const ctx = makeMockCtx();
    ensureSessionFileMaterialized(ctx, "   ");
  });

  it("does nothing when file already exists", () => {
    const existing = path.join(tmpDir, "already-exists.jsonl");
    fs.writeFileSync(existing, "{}", "utf-8");
    const ctx = makeMockCtx();
    ensureSessionFileMaterialized(ctx, existing);
    // File content unchanged
    assert.equal(fs.readFileSync(existing, "utf-8"), "{}");
  });

  it("materializes session file with valid header from getHeader", () => {
    const targetFile = path.join(tmpDir, "materialized-header.jsonl");
    const validHeader = { type: "session", version: 3, id: "s1" };
    const ctx = makeMockCtx({
      sessionManager: {
        getSessionFile: () => "/tmp/current.jsonl",
        getHeader: () => validHeader,
        getEntries: () => [],
        getCwd: () => "/tmp",
        getSessionId: () => "s1",
      },
    });
    ensureSessionFileMaterialized(ctx, targetFile);
    assert.ok(fs.existsSync(targetFile));
    const content = fs.readFileSync(targetFile, "utf-8");
    assert.ok(content.includes('"type":"session"'));
  });

  it("materializes session file with fallback header (no getHeader)", () => {
    const targetFile = path.join(tmpDir, "materialized-fallback.jsonl");
    const ctx = makeMockCtx({
      sessionManager: {
        getSessionFile: () => "/tmp/current.jsonl",
        getEntries: () => [],
        getCwd: () => "/tmp",
        getSessionId: () => "fallback-id",
      },
    });
    ensureSessionFileMaterialized(ctx, targetFile);
    assert.ok(fs.existsSync(targetFile));
    const content = fs.readFileSync(targetFile, "utf-8");
    assert.ok(content.includes('"type":"session"'));
    assert.ok(content.includes("fallback-id"));
  });

  it("materializes with fallback header when getHeader returns non-session", () => {
    const targetFile = path.join(tmpDir, "materialized-nonsess.jsonl");
    const ctx = makeMockCtx({
      sessionManager: {
        getSessionFile: () => "/tmp/current.jsonl",
        getHeader: () => ({ type: "other" }),
        getEntries: () => [],
        getSessionId: () => "fb-id",
        getCwd: () => "/work",
      },
    });
    ensureSessionFileMaterialized(ctx, targetFile);
    assert.ok(fs.existsSync(targetFile));
    const content = fs.readFileSync(targetFile, "utf-8");
    assert.ok(content.includes("fb-id"));
  });

  it("materializes with fallback header when getHeader returns null", () => {
    const targetFile = path.join(tmpDir, "materialized-null-hdr.jsonl");
    const ctx = makeMockCtx({
      sessionManager: {
        getSessionFile: () => "/tmp/current.jsonl",
        getHeader: () => null,
        getEntries: () => [],
        getSessionId: () => "null-hdr-id",
        getCwd: () => "/work",
      },
    });
    ensureSessionFileMaterialized(ctx, targetFile);
    assert.ok(fs.existsSync(targetFile));
    const content = fs.readFileSync(targetFile, "utf-8");
    assert.ok(content.includes("null-hdr-id"));
  });

  it("materializes with entries included", () => {
    const targetFile = path.join(tmpDir, "materialized-entries.jsonl");
    const entries = [{ type: "message", id: "e1", parentId: null, timestamp: "2024-01-01" }];
    const ctx = makeMockCtx({
      sessionManager: {
        getSessionFile: () => "/tmp/current.jsonl",
        getHeader: () => ({ type: "session", version: 3, id: "s2" }),
        getEntries: () => entries,
      },
    });
    ensureSessionFileMaterialized(ctx, targetFile);
    const content = fs.readFileSync(targetFile, "utf-8");
    const lines = content.trim().split("\n");
    assert.equal(lines.length, 2); // header + 1 entry
  });

  it("creates parent directory if needed", () => {
    const nestedDir = path.join(tmpDir, "nested", "deep");
    const targetFile = path.join(nestedDir, "materialized.jsonl");
    const ctx = makeMockCtx({
      sessionManager: {
        getSessionFile: () => "/tmp/current.jsonl",
        getHeader: () => ({ type: "session", version: 3, id: "s3" }),
        getEntries: () => [],
      },
    });
    ensureSessionFileMaterialized(ctx, targetFile);
    assert.ok(fs.existsSync(targetFile));
  });

  it("uses ctx.cwd as fallback when getCwd is missing", () => {
    const targetFile = path.join(tmpDir, "materialized-nocwd.jsonl");
    const ctx = makeMockCtx({
      cwd: "/my-cwd",
      sessionManager: {
        getSessionFile: () => "/tmp/current.jsonl",
        getEntries: () => [],
        // No getHeader, no getCwd, no getSessionId
      },
    });
    ensureSessionFileMaterialized(ctx, targetFile);
    assert.ok(fs.existsSync(targetFile));
    const content = fs.readFileSync(targetFile, "utf-8");
    assert.ok(content.includes("/my-cwd"));
    // No getSessionId, so fallback-<timestamp> is used
    assert.ok(content.includes("fallback-"));
  });

  it("materializes with empty entries when getEntries is missing", () => {
    const targetFile = path.join(tmpDir, "materialized-no-getentries.jsonl");
    const ctx = makeMockCtx({
      sessionManager: {
        getSessionFile: () => "/tmp/current.jsonl",
        getHeader: () => ({ type: "session", version: 3, id: "no-entries" }),
        // No getEntries method
      },
    });
    ensureSessionFileMaterialized(ctx, targetFile);
    assert.ok(fs.existsSync(targetFile));
    const content = fs.readFileSync(targetFile, "utf-8");
    const lines = content.trim().split("\n");
    // Only header, no entries
    assert.equal(lines.length, 1);
  });

  it("silently ignores errors during materialization", () => {
    // Force an error by passing a path to a read-only location
    // We simulate by mocking getEntries to throw
    const targetFile = path.join(tmpDir, "materialized-error.jsonl");
    const ctx = makeMockCtx({
      sessionManager: {
        getSessionFile: () => "/tmp/current.jsonl",
        getHeader: () => {
          throw new Error("header error");
        },
        getEntries: () => [],
      },
    });
    // Should not throw
    ensureSessionFileMaterialized(ctx, targetFile);
  });
});

// ━━━ subTransHandler ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("subTransHandler", () => {
  it("handles null/undefined args (defaults to empty string)", async () => {
    const store = createStore();
    const ctx = makeMockCtx();
    const pi = {
      appendEntry: mock.fn(() => {
        /* noop */
      }),
      sendMessage: mock.fn(() => {
        /* noop */
      }),
    };
    // Pass undefined (cast as any) to trigger ?? fallback
    await subTransHandler(undefined as unknown as string, ctx, store, pi as never);
    const calls = (ctx.ui.notify as unknown as ReturnType<typeof mock.fn>).mock.calls;
    // Should behave same as empty string: no completed runs
    assert.equal(calls.length, 1);
    assert.ok((calls[0]?.arguments[0] as string).includes("No completed runs"));
  });

  it("notifies when no completed runs exist (no args)", async () => {
    const store = createStore();
    const ctx = makeMockCtx();
    const pi = {
      appendEntry: mock.fn(() => {
        /* noop */
      }),
      sendMessage: mock.fn(() => {
        /* noop */
      }),
    };
    await subTransHandler("", ctx, store, pi as never);
    const calls = (ctx.ui.notify as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.equal(calls.length, 1);
    assert.ok((calls[0]?.arguments[0] as string).includes("No completed runs"));
  });

  it("auto-switches to latest completed run (no args)", async () => {
    const store = createStore();
    const sessionFile = path.join(tmpDir, "sub-session-trans.jsonl");
    fs.writeFileSync(sessionFile, "{}", "utf-8");
    store.commandRuns.set(1, {
      id: 1,
      agent: "worker",
      task: "t",
      status: "done",
      startedAt: Date.now() - 1000,
      elapsedMs: 1000,
      toolCalls: 0,
      lastLine: "",
      turnCount: 1,
      lastActivityAt: Date.now(),
      sessionFile,
    });
    const switchFn = mock.fn(async (_p: string) => ({ cancelled: false }));
    const ctx = makeMockCtx({ switchSession: switchFn });
    const pi = {
      appendEntry: mock.fn(() => {
        /* noop */
      }),
      sendMessage: mock.fn(() => {
        /* noop */
      }),
    };
    await subTransHandler("", ctx, store, pi as never);
    assert.equal(switchFn.mock.callCount(), 1);
  });

  it("notifies on invalid runId", async () => {
    const store = createStore();
    const ctx = makeMockCtx();
    const pi = {
      appendEntry: mock.fn(() => {
        /* noop */
      }),
      sendMessage: mock.fn(() => {
        /* noop */
      }),
    };
    await subTransHandler("abc", ctx, store, pi as never);
    const calls = (ctx.ui.notify as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.ok((calls[0]?.arguments[0] as string).includes("Usage"));
  });

  it("notifies when run not found", async () => {
    const store = createStore();
    const ctx = makeMockCtx();
    const pi = {
      appendEntry: mock.fn(() => {
        /* noop */
      }),
      sendMessage: mock.fn(() => {
        /* noop */
      }),
    };
    await subTransHandler("999", ctx, store, pi as never);
    const calls = (ctx.ui.notify as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.ok((calls[0]?.arguments[0] as string).includes("not found"));
  });

  it("notifies when run is still running", async () => {
    const store = createStore();
    store.commandRuns.set(1, {
      id: 1,
      agent: "worker",
      task: "t",
      status: "running",
      startedAt: Date.now(),
      elapsedMs: 0,
      toolCalls: 0,
      lastLine: "",
      turnCount: 1,
      lastActivityAt: Date.now(),
    });
    const ctx = makeMockCtx();
    const pi = {
      appendEntry: mock.fn(() => {
        /* noop */
      }),
      sendMessage: mock.fn(() => {
        /* noop */
      }),
    };
    await subTransHandler("1", ctx, store, pi as never);
    const calls = (ctx.ui.notify as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.ok((calls[0]?.arguments[0] as string).includes("still running"));
  });

  it("notifies when run has no session file", async () => {
    const store = createStore();
    store.commandRuns.set(1, {
      id: 1,
      agent: "worker",
      task: "t",
      status: "done",
      startedAt: Date.now(),
      elapsedMs: 0,
      toolCalls: 0,
      lastLine: "",
      turnCount: 1,
      lastActivityAt: Date.now(),
    });
    const ctx = makeMockCtx();
    const pi = {
      appendEntry: mock.fn(() => {
        /* noop */
      }),
      sendMessage: mock.fn(() => {
        /* noop */
      }),
    };
    await subTransHandler("1", ctx, store, pi as never);
    const calls = (ctx.ui.notify as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.ok((calls[0]?.arguments[0] as string).includes("no session file"));
  });

  it("notifies when switchSession not available", async () => {
    const store = createStore();
    store.commandRuns.set(1, {
      id: 1,
      agent: "worker",
      task: "t",
      status: "done",
      startedAt: Date.now(),
      elapsedMs: 0,
      toolCalls: 0,
      lastLine: "",
      turnCount: 1,
      lastActivityAt: Date.now(),
      sessionFile: "/tmp/sess.jsonl",
    });
    const ctx = makeMockCtx();
    const pi = {
      appendEntry: mock.fn(() => {
        /* noop */
      }),
      sendMessage: mock.fn(() => {
        /* noop */
      }),
    };
    await subTransHandler("1", ctx, store, pi as never);
    const calls = (ctx.ui.notify as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.ok((calls[0]?.arguments[0] as string).includes("not ready"));
  });

  it("handles switchFn returning cancelled", async () => {
    const store = createStore();
    const sessionFile = path.join(tmpDir, "sub-session-cancel.jsonl");
    fs.writeFileSync(sessionFile, "{}", "utf-8");
    store.commandRuns.set(1, {
      id: 1,
      agent: "worker",
      task: "t",
      status: "done",
      startedAt: Date.now(),
      elapsedMs: 0,
      toolCalls: 0,
      lastLine: "",
      turnCount: 1,
      lastActivityAt: Date.now(),
      sessionFile,
    });
    const switchFn = mock.fn(async (_p: string) => ({ cancelled: true }));
    const ctx = makeMockCtx({ switchSession: switchFn });
    const pi = {
      appendEntry: mock.fn(() => {
        /* noop */
      }),
      sendMessage: mock.fn(() => {
        /* noop */
      }),
    };
    await subTransHandler("1", ctx, store, pi as never);
    const calls = (ctx.ui.notify as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.ok((calls[0]?.arguments[0] as string).includes("Failed to switch"));
  });

  it("handles switchFn throwing error", async () => {
    const store = createStore();
    const sessionFile = path.join(tmpDir, "sub-session-err.jsonl");
    fs.writeFileSync(sessionFile, "{}", "utf-8");
    store.commandRuns.set(1, {
      id: 1,
      agent: "worker",
      task: "t",
      status: "done",
      startedAt: Date.now(),
      elapsedMs: 0,
      toolCalls: 0,
      lastLine: "",
      turnCount: 1,
      lastActivityAt: Date.now(),
      sessionFile,
    });
    const switchFn = mock.fn(async (_p: string) => {
      throw new Error("switch failed");
    });
    const ctx = makeMockCtx({ switchSession: switchFn });
    const pi = {
      appendEntry: mock.fn(() => {
        /* noop */
      }),
      sendMessage: mock.fn(() => {
        /* noop */
      }),
    };
    await subTransHandler("1", ctx, store, pi as never);
    const calls = (ctx.ui.notify as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.ok((calls[0]?.arguments[0] as string).includes("Session switch error"));
  });

  it("handles session file that normalizes to null (no parent link persisted)", async () => {
    const store = createStore();
    const sessionFile = path.join(tmpDir, "sub-session-null-parent.jsonl");
    fs.writeFileSync(sessionFile, "{}", "utf-8");
    store.commandRuns.set(1, {
      id: 1,
      agent: "worker",
      task: "t",
      status: "done",
      startedAt: Date.now(),
      elapsedMs: 0,
      toolCalls: 0,
      lastLine: "",
      turnCount: 1,
      lastActivityAt: Date.now(),
      sessionFile,
    });
    const switchFn = mock.fn(async (_p: string) => ({ cancelled: false }));
    const appendEntryFn = mock.fn(() => {
      /* noop */
    });
    // Session file returns empty/whitespace → normalizePath returns null
    const ctx = makeMockCtx({
      switchSession: switchFn,
      sessionManager: {
        getSessionFile: () => "   ",
        getEntries: () => [],
        getCwd: () => "/tmp",
        getSessionDir: () => "/tmp",
        getSessionId: () => "test",
      },
    });
    const pi = {
      appendEntry: appendEntryFn,
      sendMessage: mock.fn(() => {
        /* noop */
      }),
    };
    await subTransHandler("1", ctx, store, pi as never);
    // Switch should succeed
    assert.equal(switchFn.mock.callCount(), 1);
    // But parent link should NOT be persisted since parentSessionFile is undefined
    assert.equal(appendEntryFn.mock.callCount(), 0);
  });

  it("persists parent link on successful switch", async () => {
    const store = createStore();
    const sessionFile = path.join(tmpDir, "sub-session-success.jsonl");
    fs.writeFileSync(sessionFile, "{}", "utf-8");
    store.commandRuns.set(1, {
      id: 1,
      agent: "worker",
      task: "t",
      status: "done",
      startedAt: Date.now(),
      elapsedMs: 0,
      toolCalls: 0,
      lastLine: "",
      turnCount: 1,
      lastActivityAt: Date.now(),
      sessionFile,
    });
    const switchFn = mock.fn(async (_p: string) => ({ cancelled: false }));
    const appendEntryFn = mock.fn(() => {
      /* noop */
    });
    const ctx = makeMockCtx({ switchSession: switchFn });
    const pi = {
      appendEntry: appendEntryFn,
      sendMessage: mock.fn(() => {
        /* noop */
      }),
    };
    await subTransHandler("1", ctx, store, pi as never);
    assert.equal(appendEntryFn.mock.callCount(), 1);
    assert.equal(store.currentParentSessionFile, "/tmp/current-session.jsonl");
  });
});

// ━���━ subBackHandler ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("subBackHandler", () => {
  it("notifies when no parent session exists", async () => {
    const store = createStore();
    const ctx = makeMockCtx();
    await subBackHandler(ctx, store);
    const calls = (ctx.ui.notify as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.ok((calls[0]?.arguments[0] as string).includes("No parent session"));
  });

  it("clears stale parent reference and notifies", async () => {
    const store = createStore();
    store.currentParentSessionFile = "/tmp/nonexistent-parent.jsonl";
    const ctx = makeMockCtx();
    await subBackHandler(ctx, store);
    assert.equal(store.currentParentSessionFile, null);
    const calls = (ctx.ui.notify as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.ok((calls[0]?.arguments[0] as string).includes("No parent session"));
  });

  it("notifies when switchSession not available", async () => {
    const store = createStore();
    const parentFile = path.join(tmpDir, "parent-back.jsonl");
    fs.writeFileSync(parentFile, "{}", "utf-8");
    store.currentParentSessionFile = parentFile;
    const ctx = makeMockCtx();
    await subBackHandler(ctx, store);
    const calls = (ctx.ui.notify as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.ok((calls[0]?.arguments[0] as string).includes("not ready"));
  });

  it("switches to parent session successfully", async () => {
    const store = createStore();
    const parentFile = path.join(tmpDir, "parent-switch.jsonl");
    fs.writeFileSync(parentFile, "{}", "utf-8");
    store.currentParentSessionFile = parentFile;
    const switchFn = mock.fn(async (_p: string) => ({ cancelled: false }));
    const ctx = makeMockCtx({ switchSession: switchFn });
    await subBackHandler(ctx, store);
    assert.equal(switchFn.mock.callCount(), 1);
    assert.equal(switchFn.mock.calls[0]?.arguments[0], parentFile);
  });

  it("notifies when switch is cancelled", async () => {
    const store = createStore();
    const parentFile = path.join(tmpDir, "parent-cancel.jsonl");
    fs.writeFileSync(parentFile, "{}", "utf-8");
    store.currentParentSessionFile = parentFile;
    const switchFn = mock.fn(async (_p: string) => ({ cancelled: true }));
    const ctx = makeMockCtx({ switchSession: switchFn });
    await subBackHandler(ctx, store);
    const calls = (ctx.ui.notify as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.ok((calls[0]?.arguments[0] as string).includes("Failed to return"));
  });

  it("handles switchFn throwing error", async () => {
    const store = createStore();
    const parentFile = path.join(tmpDir, "parent-error.jsonl");
    fs.writeFileSync(parentFile, "{}", "utf-8");
    store.currentParentSessionFile = parentFile;
    const switchFn = mock.fn(async (_p: string) => {
      throw new Error("switch error");
    });
    const ctx = makeMockCtx({ switchSession: switchFn });
    await subBackHandler(ctx, store);
    const calls = (ctx.ui.notify as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.ok((calls[0]?.arguments[0] as string).includes("Session switch error"));
  });
});
