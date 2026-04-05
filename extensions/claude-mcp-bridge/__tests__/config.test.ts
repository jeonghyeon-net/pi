import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import {
  collectScopedConfigCandidates,
  expandEnvVars,
  expandRecord,
  extractRawServers,
  loadConfig,
  normalizeServer,
  safeReadJson,
} from "../core/config.js";
import type { HttpMcpServer, RawMcpServer, SseMcpServer, StdioMcpServer } from "../core/types.js";

// ━━━ temp dir management ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let tmpDir: string;
const origEnv: Record<string, string | undefined> = {};

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-bridge-config-"));
  for (const key of [
    "TEST_VAR",
    "TEST_HOST",
    "TEST_TOKEN",
    "TEST_PATH",
    "PI_MCP_CONFIG",
    "MISSING_VAR",
    "HOME",
    "USERPROFILE",
  ]) {
    origEnv[key] = process.env[key];
  }
});

beforeEach(() => {
  process.env.TEST_VAR = "world";
  process.env.TEST_HOST = "example.com";
  process.env.TEST_TOKEN = "tok-123";
  process.env.TEST_PATH = "/home/user/tools";
  Reflect.deleteProperty(process.env, "MISSING_VAR");
  Reflect.deleteProperty(process.env, "PI_MCP_CONFIG");
  // Redirect HOME to tmpDir so loadConfig's walk stops at tmpDir and doesn't pick up
  // real user config files (~/.mcp.json, ~/.claude.json).
  process.env.HOME = tmpDir;
  process.env.USERPROFILE = tmpDir;
});

afterEach(() => {
  for (const entry of fs.readdirSync(tmpDir)) {
    fs.rmSync(path.join(tmpDir, entry), { recursive: true, force: true });
  }
  Reflect.deleteProperty(process.env, "PI_MCP_CONFIG");
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  for (const [key, val] of Object.entries(origEnv)) {
    if (val === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = val;
  }
});

function writeJson(relPath: string, data: unknown): string {
  const full = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data));
  return full;
}

// ━━━ expandEnvVars ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("expandEnvVars", () => {
  it("replaces ${VAR} with env value", () => {
    assert.equal(expandEnvVars("hello ${TEST_VAR}"), "hello world");
  });

  it("replaces multiple variables", () => {
    assert.equal(expandEnvVars("${TEST_HOST}:${TEST_TOKEN}"), "example.com:tok-123");
  });

  it("replaces missing env var with empty string", () => {
    assert.equal(expandEnvVars("value=${MISSING_VAR}"), "value=");
  });

  it("returns string unchanged when no placeholders", () => {
    assert.equal(expandEnvVars("no placeholders"), "no placeholders");
  });

  it("leaves lone $ and malformed tokens alone", () => {
    assert.equal(expandEnvVars("$NOT_BRACED ${TEST_VAR}"), "$NOT_BRACED world");
  });
});

// ━━━ expandRecord ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("expandRecord", () => {
  it("expands each value in the record", () => {
    const result = expandRecord({
      host: "${TEST_HOST}",
      plain: "value",
    });
    assert.deepEqual(result, { host: "example.com", plain: "value" });
  });

  it("returns empty object for undefined input", () => {
    assert.deepEqual(expandRecord(), {});
  });

  it("returns empty object for empty input", () => {
    assert.deepEqual(expandRecord({}), {});
  });
});

// ━━━ safeReadJson ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("safeReadJson", () => {
  it("returns null when file does not exist", () => {
    assert.equal(safeReadJson(path.join(tmpDir, "nope.json")), null);
  });

  it("returns parsed JSON for valid file", () => {
    const file = writeJson("valid.json", { foo: "bar" });
    assert.deepEqual(safeReadJson(file), { foo: "bar" });
  });

  it("returns null for invalid JSON", () => {
    const file = path.join(tmpDir, "broken.json");
    fs.writeFileSync(file, "{not valid");
    assert.equal(safeReadJson(file), null);
  });
});

// ━━━ extractRawServers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractRawServers", () => {
  it("returns null for non-object input", () => {
    assert.equal(extractRawServers(null), null);
    assert.equal(extractRawServers("string"), null);
    assert.equal(extractRawServers(42), null);
  });

  it("prefers mcpServers key", () => {
    const servers = { a: { command: "cmd" } };
    const result = extractRawServers({ mcpServers: servers, mcp: { servers: {} } });
    assert.strictEqual(result, servers);
  });

  it("falls back to mcp.servers", () => {
    const servers = { a: { command: "cmd" } };
    const result = extractRawServers({ mcp: { servers } });
    assert.strictEqual(result, servers);
  });

  it("falls back to top-level servers", () => {
    const servers = { a: { command: "cmd" } };
    const result = extractRawServers({ servers });
    assert.strictEqual(result, servers);
  });

  it("returns null when no recognized key", () => {
    assert.equal(extractRawServers({ other: "data" }), null);
  });

  it("returns null when mcp exists but has no servers", () => {
    assert.equal(extractRawServers({ mcp: { other: "data" } }), null);
  });

  it("returns null when mcp.servers is not an object", () => {
    assert.equal(extractRawServers({ mcp: { servers: "nope" } }), null);
  });

  it("returns null when mcpServers is not an object", () => {
    assert.equal(extractRawServers({ mcpServers: "nope" }), null);
  });

  it("returns null when servers at top level is not an object", () => {
    assert.equal(extractRawServers({ servers: 42 }), null);
  });

  it("returns null when mcp is not an object", () => {
    assert.equal(extractRawServers({ mcp: "nope" }), null);
  });
});

// ━━━ normalizeServer ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("normalizeServer", () => {
  it("returns null when enabled is false", () => {
    const result = normalizeServer("srv", { enabled: false, command: "node" });
    assert.equal(result, null);
  });

  it("builds stdio server when command is present", () => {
    const result = normalizeServer("srv", {
      command: "${TEST_HOST}-cmd",
      args: ["--flag=${TEST_TOKEN}"],
      env: { X: "${TEST_VAR}" },
      cwd: "${TEST_PATH}",
    }) as StdioMcpServer;
    assert.ok(result);
    assert.equal(result.type, "stdio");
    assert.equal(result.name, "srv");
    assert.equal(result.enabled, true);
    assert.equal(result.command, "example.com-cmd");
    assert.deepEqual(result.args, ["--flag=tok-123"]);
    assert.equal(result.env.X, "world");
    // Should include process.env values merged in
    assert.equal(result.env.TEST_VAR, "world");
    assert.equal(result.cwd, "/home/user/tools");
  });

  it("builds stdio server without cwd when not provided", () => {
    const result = normalizeServer("srv", { command: "node" }) as StdioMcpServer;
    assert.ok(result);
    assert.equal(result.cwd, undefined);
  });

  it("builds stdio server with default empty args/env", () => {
    const result = normalizeServer("srv", { command: "node" }) as StdioMcpServer;
    assert.ok(result);
    assert.deepEqual(result.args, []);
    // env should still contain process.env values
    assert.ok(Object.keys(result.env).length > 0);
  });

  it("builds stdio server when type=stdio but no command returns null", () => {
    const result = normalizeServer("srv", { type: "stdio" });
    assert.equal(result, null);
  });

  it("builds stdio server when type=stdio and command present", () => {
    const result = normalizeServer("srv", {
      type: "stdio",
      command: "foo",
    }) as StdioMcpServer;
    assert.ok(result);
    assert.equal(result.type, "stdio");
  });

  it("builds http server when url present without type", () => {
    const result = normalizeServer("srv", {
      url: "https://${TEST_HOST}/api",
      headers: { Auth: "Bearer ${TEST_TOKEN}" },
    }) as HttpMcpServer;
    assert.ok(result);
    assert.equal(result.type, "http");
    assert.equal(result.url, "https://example.com/api");
    assert.deepEqual(result.headers, { Auth: "Bearer tok-123" });
  });

  it("builds sse server when explicit type=sse", () => {
    const result = normalizeServer("srv", {
      type: "sse",
      url: "https://example.com/stream",
    }) as SseMcpServer;
    assert.ok(result);
    assert.equal(result.type, "sse");
  });

  it("builds http server when explicit type=http", () => {
    const result = normalizeServer("srv", {
      type: "http",
      url: "https://example.com/sse/",
    }) as HttpMcpServer;
    assert.ok(result);
    assert.equal(result.type, "http");
  });

  it("infers sse from URL ending in /sse", () => {
    const result = normalizeServer("srv", {
      url: "https://example.com/sse",
    }) as SseMcpServer;
    assert.ok(result);
    assert.equal(result.type, "sse");
  });

  it("infers sse from URL ending in /sse/", () => {
    const result = normalizeServer("srv", {
      url: "https://example.com/sse/",
    }) as SseMcpServer;
    assert.ok(result);
    assert.equal(result.type, "sse");
  });

  it("infers sse from URL with /sse? query", () => {
    const result = normalizeServer("srv", {
      url: "https://example.com/sse?foo=1",
    }) as SseMcpServer;
    assert.ok(result);
    assert.equal(result.type, "sse");
  });

  it("defaults to http for arbitrary URLs", () => {
    const result = normalizeServer("srv", {
      url: "https://example.com/other",
    }) as HttpMcpServer;
    assert.ok(result);
    assert.equal(result.type, "http");
  });

  it("uppercases type is lowercased", () => {
    const result = normalizeServer("srv", {
      type: "SSE",
      url: "https://example.com/other",
    }) as SseMcpServer;
    assert.ok(result);
    assert.equal(result.type, "sse");
  });

  it("returns null when url is missing but type is remote", () => {
    const result = normalizeServer("srv", { type: "http" });
    assert.equal(result, null);
  });

  it("returns null when raw.url flips to falsy between checks", () => {
    // normalizeServer gates on raw.url, then buildRemoteServer re-reads raw.url.
    // Use a getter so the second read returns a falsy value and we hit the
    // defensive guard inside buildRemoteServer.
    let reads = 0;
    const raw: RawMcpServer = {};
    Object.defineProperty(raw, "url", {
      get(): string | undefined {
        reads++;
        return reads === 1 ? "https://example.com" : undefined;
      },
    });
    const result = normalizeServer("srv", raw);
    assert.equal(result, null);
  });

  it("returns null when no command and no url", () => {
    const result = normalizeServer("srv", {});
    assert.equal(result, null);
  });

  it("command takes precedence even when url is set", () => {
    const result = normalizeServer("srv", {
      command: "node",
      url: "https://example.com",
    }) as StdioMcpServer;
    assert.ok(result);
    assert.equal(result.type, "stdio");
  });

  it("filters non-string env values from process.env", () => {
    // Node's process.env typing forces strings; but ensure entry pattern handles it.
    const result = normalizeServer("srv", {
      command: "node",
      env: { CUSTOM: "custom-val" },
    }) as StdioMcpServer;
    assert.ok(result);
    assert.equal(result.env.CUSTOM, "custom-val");
    // All values must be strings
    for (const v of Object.values(result.env)) {
      assert.equal(typeof v, "string");
    }
  });

  it("skips non-string process.env values via type guard", () => {
    // process.env always returns strings in normal use, so to exercise the
    // `typeof v === "string"` guard's false branch we mock Object.entries.
    const origEntries = Object.entries;
    Object.entries = ((obj: object): [string, unknown][] => {
      if (obj === process.env) {
        return [
          ["STRING_KEY", "string-value"],
          ["NON_STRING_KEY", 42 as unknown as string],
          ["UNDEF_KEY", undefined as unknown as string],
        ];
      }
      return origEntries(obj);
    }) as typeof Object.entries;

    try {
      const result = normalizeServer("srv", { command: "node" }) as StdioMcpServer;
      assert.ok(result);
      assert.equal(result.env.STRING_KEY, "string-value");
      assert.equal(result.env.NON_STRING_KEY, undefined);
      assert.equal(result.env.UNDEF_KEY, undefined);
    } finally {
      Object.entries = origEntries;
    }
  });
});

// ━━━ collectScopedConfigCandidates ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("collectScopedConfigCandidates", () => {
  it("includes candidate paths walking up from cwd", () => {
    const candidates = collectScopedConfigCandidates(tmpDir);
    assert.ok(candidates.length > 0);
    assert.ok(candidates.some((p) => p === path.join(tmpDir, ".pi", "mcp.json")));
    assert.ok(candidates.some((p) => p === path.join(tmpDir, ".mcp.json")));
    assert.ok(candidates.some((p) => p === path.join(tmpDir, "backend", ".mcp.json")));
    assert.ok(candidates.some((p) => p === path.join(tmpDir, "frontend", ".mcp.json")));
  });

  it("includes home .mcp.json and .claude.json at end", () => {
    const candidates = collectScopedConfigCandidates(tmpDir);
    assert.ok(candidates.includes(path.join(os.homedir(), ".mcp.json")));
    assert.ok(candidates.includes(path.join(os.homedir(), ".claude.json")));
  });

  it("dedupes candidates", () => {
    const candidates = collectScopedConfigCandidates(tmpDir);
    const unique = new Set(candidates);
    assert.equal(candidates.length, unique.size);
  });

  it("walks from deep subdirectory up through home", () => {
    const deep = path.join(tmpDir, "a", "b", "c");
    fs.mkdirSync(deep, { recursive: true });
    const candidates = collectScopedConfigCandidates(deep);
    assert.ok(candidates.some((p) => p === path.join(deep, ".pi", "mcp.json")));
    assert.ok(candidates.some((p) => p === path.join(path.dirname(deep), ".pi", "mcp.json")));
  });

  it("stops when reaching root", () => {
    const root = path.parse(os.homedir()).root;
    const candidates = collectScopedConfigCandidates(root);
    assert.ok(candidates.length > 0);
  });

  it("breaks when path.dirname returns the same path (defensive guard)", () => {
    // To hit the `if (parent === current) break;` branch, we need a path where
    // path.dirname(p) === p, but p is neither home nor root. Mock path.dirname
    // so that it returns its input when asked about our sentinel path.
    const sentinel = path.join(tmpDir, "sentinel");
    fs.mkdirSync(sentinel, { recursive: true });
    const origDirname = path.dirname;
    (path as { dirname: typeof path.dirname }).dirname = ((p: string): string => {
      if (p === sentinel) return sentinel;
      return origDirname(p);
    }) as typeof path.dirname;

    try {
      // Temporarily set HOME away from sentinel so `current === home` check fails.
      const prevHome = process.env.HOME;
      process.env.HOME = path.join(tmpDir, "other-home");
      try {
        const candidates = collectScopedConfigCandidates(sentinel);
        assert.ok(candidates.length > 0);
      } finally {
        if (prevHome === undefined) Reflect.deleteProperty(process.env, "HOME");
        else process.env.HOME = prevHome;
      }
    } finally {
      (path as { dirname: typeof path.dirname }).dirname = origDirname;
    }
  });
});

// ━━━ loadConfig ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("loadConfig", () => {
  it("returns empty result when no config found", () => {
    // Use a dir guaranteed not to have any mcp.json
    const emptyDir = fs.mkdtempSync(path.join(tmpDir, "empty-"));
    // Make PI_MCP_CONFIG point to nowhere so only candidates are searched
    process.env.PI_MCP_CONFIG = path.join(tmpDir, "missing-explicit.json");
    const result = loadConfig(emptyDir);
    assert.equal(result.sourcePath, null);
    assert.deepEqual(result.servers, []);
  });

  it("loads from PI_MCP_CONFIG explicit path", () => {
    const file = writeJson("explicit.json", {
      mcpServers: {
        srv1: { command: "node" },
      },
    });
    process.env.PI_MCP_CONFIG = file;
    const result = loadConfig(tmpDir);
    assert.equal(result.sourcePath, file);
    assert.equal(result.servers.length, 1);
    const s0 = result.servers[0];
    assert.ok(s0);
    assert.equal(s0.name, "srv1");
  });

  it("expands env vars in PI_MCP_CONFIG path", () => {
    const file = writeJson("sub/explicit.json", {
      mcpServers: { srv1: { command: "node" } },
    });
    process.env.TEST_EXPLICIT_PATH = file;
    process.env.PI_MCP_CONFIG = "${TEST_EXPLICIT_PATH}";
    const result = loadConfig(tmpDir);
    assert.equal(result.sourcePath, file);
    Reflect.deleteProperty(process.env, "TEST_EXPLICIT_PATH");
  });

  it("loads from scoped candidates", () => {
    const cwd = path.join(tmpDir, "project");
    fs.mkdirSync(cwd, { recursive: true });
    writeJson("project/.mcp.json", {
      mcpServers: {
        foo: { command: "cmd" },
      },
    });
    process.env.PI_MCP_CONFIG = path.join(tmpDir, "no-such-file.json");
    // Clear PI_MCP_CONFIG so scoped candidates are searched
    Reflect.deleteProperty(process.env, "PI_MCP_CONFIG");
    const result = loadConfig(cwd);
    assert.ok(result.sourcePath);
    assert.ok(result.sourcePath?.includes(".mcp.json"));
    assert.equal(result.servers.length, 1);
    const s0 = result.servers[0];
    assert.ok(s0);
    assert.equal(s0.name, "foo");
  });

  it("warns on duplicate server names across sources", () => {
    const cwd = path.join(tmpDir, "project");
    fs.mkdirSync(path.join(cwd, "backend"), { recursive: true });
    writeJson("project/.mcp.json", {
      mcpServers: { dupe: { command: "first" } },
    });
    writeJson("project/backend/.mcp.json", {
      mcpServers: { dupe: { command: "second" } },
    });
    Reflect.deleteProperty(process.env, "PI_MCP_CONFIG");
    const result = loadConfig(cwd);
    assert.equal(result.servers.length, 1);
    assert.equal((result.servers[0] as StdioMcpServer).command, "first");
    assert.ok(result.warnings.some((w) => w.includes("duplicate MCP server config: dupe")));
  });

  it("warns on invalid server config", () => {
    writeJson(".mcp.json", {
      mcpServers: {
        good: { command: "ok" },
        bad: {}, // no command and no url
      },
    });
    Reflect.deleteProperty(process.env, "PI_MCP_CONFIG");
    const result = loadConfig(tmpDir);
    assert.equal(result.servers.length, 1);
    assert.ok(result.warnings.some((w) => w.includes("invalid MCP server config: bad")));
  });

  it("skips sources where extraction fails", () => {
    writeJson(".mcp.json", { nothing: "here" });
    writeJson("backend/.mcp.json", {
      mcpServers: { srv: { command: "cmd" } },
    });
    Reflect.deleteProperty(process.env, "PI_MCP_CONFIG");
    const result = loadConfig(tmpDir);
    assert.equal(result.servers.length, 1);
  });

  it("skips sources where rawServers is empty object", () => {
    writeJson(".mcp.json", { mcpServers: {} });
    writeJson("backend/.mcp.json", {
      mcpServers: { srv: { command: "cmd" } },
    });
    Reflect.deleteProperty(process.env, "PI_MCP_CONFIG");
    const result = loadConfig(tmpDir);
    assert.equal(result.servers.length, 1);
    const s0 = result.servers[0];
    assert.ok(s0);
    assert.equal(s0.name, "srv");
  });

  it("joins multiple source paths with comma", () => {
    writeJson(".mcp.json", { mcpServers: { a: { command: "cmd1" } } });
    writeJson("backend/.mcp.json", { mcpServers: { b: { command: "cmd2" } } });
    Reflect.deleteProperty(process.env, "PI_MCP_CONFIG");
    const result = loadConfig(tmpDir);
    assert.equal(result.servers.length, 2);
    assert.ok(result.sourcePath?.includes(", "));
  });

  it("handles unreadable config files gracefully", () => {
    // safeReadJson returns null for invalid JSON
    fs.writeFileSync(path.join(tmpDir, ".mcp.json"), "{ broken");
    writeJson("backend/.mcp.json", { mcpServers: { b: { command: "cmd" } } });
    Reflect.deleteProperty(process.env, "PI_MCP_CONFIG");
    const result = loadConfig(tmpDir);
    assert.equal(result.servers.length, 1);
    const s0 = result.servers[0];
    assert.ok(s0);
    assert.equal(s0.name, "b");
  });
});

// ━━━ type guard: RawMcpServer shape sanity ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("RawMcpServer input shapes", () => {
  it("accepts minimal stdio", () => {
    const raw: RawMcpServer = { command: "node" };
    const result = normalizeServer("s", raw) as StdioMcpServer;
    assert.ok(result);
    assert.equal(result.type, "stdio");
  });
});
