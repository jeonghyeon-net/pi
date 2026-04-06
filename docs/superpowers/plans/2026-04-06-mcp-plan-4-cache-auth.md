# MCP Extension Plan 4: Cache + Auth

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the caching layer (metadata cache with 7-day TTL, NPX resolution cache with 24h TTL) and authentication layer (OAuth token management, Bearer auth, pre-execution consent).

**Architecture:** 4 source modules + 5 test files. All use dependency injection (FsOps pattern). Atomic writes via temp file with PID + rename. Consent is session-only (Map-based, no persistence). Every file <= 99 lines.

**Tech Stack:** TypeScript, Vitest

**Dependencies:** Plan 1 (types-config, constants, errors, env), Plan 2 (config-hash for cache invalidation).

---

### Task 1: cache-metadata.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/cache-metadata.ts`
- Create: `01_EXTENSIONS/mcp/tests/cache-metadata.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { loadMetadataCache, saveMetadataCache, isMetadataCacheValid } from "../src/cache-metadata.js";

describe("loadMetadataCache", () => {
  it("returns null when file does not exist", () => {
    const fs = { existsSync: () => false, readFileSync: vi.fn(), writeFileSync: vi.fn(), renameSync: vi.fn() };
    expect(loadMetadataCache("/cache.json", fs)).toBeNull();
  });

  it("returns parsed cache when file exists", () => {
    const cache = { version: 1, servers: {}, savedAt: Date.now(), configHash: "abc" };
    const fs = {
      existsSync: () => true,
      readFileSync: () => JSON.stringify(cache),
      writeFileSync: vi.fn(),
      renameSync: vi.fn(),
    };
    const result = loadMetadataCache("/cache.json", fs);
    expect(result?.configHash).toBe("abc");
  });

  it("returns null on invalid JSON", () => {
    const fs = {
      existsSync: () => true,
      readFileSync: () => "not json",
      writeFileSync: vi.fn(),
      renameSync: vi.fn(),
    };
    expect(loadMetadataCache("/cache.json", fs)).toBeNull();
  });
});

describe("saveMetadataCache", () => {
  it("writes via atomic temp file then rename", () => {
    const fs = { existsSync: vi.fn(), readFileSync: vi.fn(), writeFileSync: vi.fn(), renameSync: vi.fn() };
    const cache = { version: 1, servers: {}, savedAt: Date.now(), configHash: "h" };
    saveMetadataCache("/cache.json", cache, fs);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const tmpPath = fs.writeFileSync.mock.calls[0][0];
    expect(tmpPath).toContain(".tmp");
    expect(fs.renameSync).toHaveBeenCalledWith(tmpPath, "/cache.json");
  });
});

describe("isMetadataCacheValid", () => {
  it("returns false for null cache", () => {
    expect(isMetadataCacheValid(null, "hash", Date.now)).toBe(false);
  });

  it("returns false when config hash differs", () => {
    const cache = { version: 1, servers: {}, savedAt: Date.now(), configHash: "old" };
    expect(isMetadataCacheValid(cache, "new", Date.now)).toBe(false);
  });

  it("returns false when TTL expired", () => {
    const expired = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const cache = { version: 1, servers: {}, savedAt: expired, configHash: "h" };
    expect(isMetadataCacheValid(cache, "h", Date.now)).toBe(false);
  });

  it("returns true when hash matches and within TTL", () => {
    const cache = { version: 1, servers: {}, savedAt: Date.now(), configHash: "h" };
    expect(isMetadataCacheValid(cache, "h", Date.now)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/cache-metadata.test.ts
```

Expected: FAIL (cache-metadata module not found)

- [ ] **Step 3: Write cache-metadata.ts**

```typescript
import { METADATA_CACHE_TTL_MS } from "./constants.js";

export interface MetadataCache {
  version: number;
  servers: Record<string, unknown>;
  savedAt: number;
  configHash: string;
}

interface CacheFsOps {
  existsSync(p: string): boolean;
  readFileSync(p: string): string;
  writeFileSync(p: string, data: string): void;
  renameSync(src: string, dest: string): void;
}

export function loadMetadataCache(path: string, fs: CacheFsOps): MetadataCache | null {
  if (!fs.existsSync(path)) return null;
  try {
    const raw = fs.readFileSync(path);
    const parsed: unknown = JSON.parse(raw);
    return parsed as MetadataCache;
  } catch {
    return null;
  }
}

export function saveMetadataCache(path: string, cache: MetadataCache, fs: CacheFsOps): void {
  const tmp = `${path}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache));
  fs.renameSync(tmp, path);
}

export function isMetadataCacheValid(
  cache: MetadataCache | null,
  configHash: string,
  now: () => number,
): boolean {
  if (!cache) return false;
  if (cache.configHash !== configHash) return false;
  return now() - cache.savedAt < METADATA_CACHE_TTL_MS;
}
```

Note: `parsed as MetadataCache` uses `as MetadataCache`, which is allowed. The Go test regex `\bas\s+(any|unknown|never)\b` only matches `as any`, `as unknown`, or `as never`.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/cache-metadata.test.ts
```

Expected: PASS (7 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/cache-metadata.ts tests/cache-metadata.test.ts
git commit -m "mcp: cache-metadata (7-day TTL, hash invalidation, atomic write)"
```

---

### Task 2: cache-npx.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/cache-npx.ts`
- Create: `01_EXTENSIONS/mcp/tests/cache-npx.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { loadNpxCache, saveNpxCache, getNpxEntry, setNpxEntry, isNpxEntryValid } from "../src/cache-npx.js";

describe("loadNpxCache", () => {
  it("returns empty entries when file does not exist", () => {
    const fs = { existsSync: () => false, readFileSync: vi.fn(), writeFileSync: vi.fn(), renameSync: vi.fn() };
    const cache = loadNpxCache("/npx.json", fs);
    expect(cache.entries).toEqual({});
  });

  it("returns parsed entries when file exists", () => {
    const data = { entries: { pkg: { resolvedPath: "/bin/pkg", savedAt: Date.now() } } };
    const fs = {
      existsSync: () => true,
      readFileSync: () => JSON.stringify(data),
      writeFileSync: vi.fn(),
      renameSync: vi.fn(),
    };
    const cache = loadNpxCache("/npx.json", fs);
    expect(cache.entries.pkg.resolvedPath).toBe("/bin/pkg");
  });

  it("returns empty entries on invalid JSON", () => {
    const fs = {
      existsSync: () => true,
      readFileSync: () => "{broken",
      writeFileSync: vi.fn(),
      renameSync: vi.fn(),
    };
    expect(loadNpxCache("/npx.json", fs).entries).toEqual({});
  });
});

describe("saveNpxCache", () => {
  it("writes via atomic temp file then rename", () => {
    const fs = { existsSync: vi.fn(), readFileSync: vi.fn(), writeFileSync: vi.fn(), renameSync: vi.fn() };
    saveNpxCache("/npx.json", { entries: {} }, fs);
    const tmpPath = fs.writeFileSync.mock.calls[0][0];
    expect(tmpPath).toContain(".tmp");
    expect(fs.renameSync).toHaveBeenCalledWith(tmpPath, "/npx.json");
  });
});

describe("getNpxEntry", () => {
  it("returns entry if present", () => {
    const cache = { entries: { pkg: { resolvedPath: "/bin/p", savedAt: 1 } } };
    expect(getNpxEntry(cache, "pkg")?.resolvedPath).toBe("/bin/p");
  });

  it("returns undefined if missing", () => {
    expect(getNpxEntry({ entries: {} }, "pkg")).toBeUndefined();
  });
});

describe("setNpxEntry", () => {
  it("sets entry in cache", () => {
    const cache = { entries: {} };
    setNpxEntry(cache, "pkg", "/bin/p", Date.now);
    expect(cache.entries.pkg.resolvedPath).toBe("/bin/p");
  });
});

describe("isNpxEntryValid", () => {
  it("returns false for undefined entry", () => {
    expect(isNpxEntryValid(undefined, Date.now)).toBe(false);
  });

  it("returns false when TTL expired", () => {
    const old = { resolvedPath: "/p", savedAt: Date.now() - 25 * 60 * 60 * 1000 };
    expect(isNpxEntryValid(old, Date.now)).toBe(false);
  });

  it("returns true within TTL", () => {
    const fresh = { resolvedPath: "/p", savedAt: Date.now() };
    expect(isNpxEntryValid(fresh, Date.now)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/cache-npx.test.ts
```

Expected: FAIL (cache-npx module not found)

- [ ] **Step 3: Write cache-npx.ts**

```typescript
import { NPX_CACHE_TTL_MS } from "./constants.js";

export interface NpxEntry {
  resolvedPath: string;
  savedAt: number;
}

export interface NpxCache {
  entries: Record<string, NpxEntry>;
}

interface NpxFsOps {
  existsSync(p: string): boolean;
  readFileSync(p: string): string;
  writeFileSync(p: string, data: string): void;
  renameSync(src: string, dest: string): void;
}

export function loadNpxCache(path: string, fs: NpxFsOps): NpxCache {
  if (!fs.existsSync(path)) return { entries: {} };
  try {
    const raw = fs.readFileSync(path);
    const parsed: unknown = JSON.parse(raw);
    const obj = parsed as NpxCache;
    return obj.entries ? obj : { entries: {} };
  } catch {
    return { entries: {} };
  }
}

export function saveNpxCache(path: string, cache: NpxCache, fs: NpxFsOps): void {
  const tmp = `${path}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache));
  fs.renameSync(tmp, path);
}

export function getNpxEntry(cache: NpxCache, pkg: string): NpxEntry | undefined {
  return cache.entries[pkg];
}

export function setNpxEntry(cache: NpxCache, pkg: string, resolvedPath: string, now: () => number): void {
  cache.entries[pkg] = { resolvedPath, savedAt: now() };
}

export function isNpxEntryValid(entry: NpxEntry | undefined, now: () => number): boolean {
  if (!entry) return false;
  return now() - entry.savedAt < NPX_CACHE_TTL_MS;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/cache-npx.test.ts
```

Expected: PASS (9 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/cache-npx.ts tests/cache-npx.test.ts
git commit -m "mcp: cache-npx (24h TTL, atomic write)"
```

---

### Task 3: auth.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/auth.ts`
- Create: `01_EXTENSIONS/mcp/tests/auth.test.ts`
- Create: `01_EXTENSIONS/mcp/tests/auth-oauth.test.ts`

This module handles two auth strategies:
1. **OAuth** -- load tokens from `~/.pi/agent/mcp-oauth/{serverName}/tokens.json`, validate structure, check expiry.
2. **Bearer** -- direct token string or env var reference (`bearerTokenEnv`), resolved via `interpolateEnv` from `env.ts`.

- [ ] **Step 1: Write the failing test (auth.test.ts -- Bearer auth)**

```typescript
import { describe, expect, it } from "vitest";
import { resolveBearer, buildAuthHeader } from "../src/auth.js";

describe("resolveBearer", () => {
  it("returns direct token when bearerToken is set", () => {
    const result = resolveBearer({ bearerToken: "tok123" }, {});
    expect(result).toBe("tok123");
  });

  it("resolves token from env var", () => {
    const result = resolveBearer({ bearerTokenEnv: "MY_TOKEN" }, { MY_TOKEN: "envtok" });
    expect(result).toBe("envtok");
  });

  it("returns undefined when env var is missing", () => {
    const result = resolveBearer({ bearerTokenEnv: "MISSING" }, {});
    expect(result).toBeUndefined();
  });

  it("prefers bearerToken over bearerTokenEnv", () => {
    const result = resolveBearer(
      { bearerToken: "direct", bearerTokenEnv: "MY_TOKEN" },
      { MY_TOKEN: "envtok" },
    );
    expect(result).toBe("direct");
  });

  it("returns undefined when neither is set", () => {
    const result = resolveBearer({}, {});
    expect(result).toBeUndefined();
  });
});

describe("buildAuthHeader", () => {
  it("returns Bearer header for token", () => {
    expect(buildAuthHeader("tok")).toEqual({ Authorization: "Bearer tok" });
  });

  it("returns empty object for undefined token", () => {
    expect(buildAuthHeader(undefined)).toEqual({});
  });
});
```

- [ ] **Step 2: Write the failing test (auth-oauth.test.ts -- OAuth token management)**

```typescript
import { describe, expect, it, vi } from "vitest";
import { loadOAuthTokens, isOAuthTokenValid } from "../src/auth.js";

describe("loadOAuthTokens", () => {
  it("returns null when file does not exist", () => {
    const fs = { existsSync: () => false, readFileSync: vi.fn() };
    expect(loadOAuthTokens("/oauth/s1/tokens.json", fs)).toBeNull();
  });

  it("returns parsed tokens when file exists", () => {
    const tokens = { access_token: "abc", token_type: "bearer", expiresAt: Date.now() + 60000 };
    const fs = { existsSync: () => true, readFileSync: () => JSON.stringify(tokens) };
    const result = loadOAuthTokens("/oauth/s1/tokens.json", fs);
    expect(result?.access_token).toBe("abc");
  });

  it("returns null on invalid JSON", () => {
    const fs = { existsSync: () => true, readFileSync: () => "bad" };
    expect(loadOAuthTokens("/oauth/s1/tokens.json", fs)).toBeNull();
  });

  it("returns null when access_token is not a string", () => {
    const tokens = { access_token: 123 };
    const fs = { existsSync: () => true, readFileSync: () => JSON.stringify(tokens) };
    expect(loadOAuthTokens("/oauth/s1/tokens.json", fs)).toBeNull();
  });
});

describe("isOAuthTokenValid", () => {
  it("returns false for null tokens", () => {
    expect(isOAuthTokenValid(null, Date.now)).toBe(false);
  });

  it("returns false when expired", () => {
    const tokens = { access_token: "a", token_type: "bearer", expiresAt: Date.now() - 1000 };
    expect(isOAuthTokenValid(tokens, Date.now)).toBe(false);
  });

  it("returns true when not expired", () => {
    const tokens = { access_token: "a", token_type: "bearer", expiresAt: Date.now() + 60000 };
    expect(isOAuthTokenValid(tokens, Date.now)).toBe(true);
  });

  it("returns true when no expiresAt (never expires)", () => {
    const tokens = { access_token: "a", token_type: "bearer" };
    expect(isOAuthTokenValid(tokens, Date.now)).toBe(true);
  });

  it("defaults token_type to bearer", () => {
    const tokens = { access_token: "a" };
    const fs = { existsSync: () => true, readFileSync: () => JSON.stringify(tokens) };
    const result = loadOAuthTokens("/path", fs);
    expect(result?.token_type).toBe("bearer");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/auth.test.ts tests/auth-oauth.test.ts
```

Expected: FAIL (auth module not found)

- [ ] **Step 4: Write auth.ts**

```typescript
import { SERVER_NAME_SANITIZE_RE, OAUTH_TOKEN_DIR } from "./constants.js";

export interface OAuthTokens {
  access_token: string;
  token_type: string;
  expiresAt?: number;
}

interface BearerOpts {
  bearerToken?: string;
  bearerTokenEnv?: string;
}

interface OAuthFsOps {
  existsSync(p: string): boolean;
  readFileSync(p: string): string;
}

export function resolveBearer(opts: BearerOpts, env: Record<string, string | undefined>): string | undefined {
  if (opts.bearerToken) return opts.bearerToken;
  if (opts.bearerTokenEnv) return env[opts.bearerTokenEnv] ?? undefined;
  return undefined;
}

export function buildAuthHeader(token: string | undefined): Record<string, string> {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export function loadOAuthTokens(path: string, fs: OAuthFsOps): OAuthTokens | null {
  if (!fs.existsSync(path)) return null;
  try {
    const raw = fs.readFileSync(path);
    const parsed: unknown = JSON.parse(raw);
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.access_token !== "string") return null;
    return {
      access_token: obj.access_token,
      token_type: typeof obj.token_type === "string" ? obj.token_type : "bearer",
      expiresAt: typeof obj.expiresAt === "number" ? obj.expiresAt : undefined,
    };
  } catch {
    return null;
  }
}

export function isOAuthTokenValid(tokens: OAuthTokens | null, now: () => number): boolean {
  if (!tokens) return false;
  if (tokens.expiresAt !== undefined && now() > tokens.expiresAt) return false;
  return true;
}

export function oauthTokenPath(serverName: string): string {
  const safe = serverName.replace(SERVER_NAME_SANITIZE_RE, "");
  return `${OAUTH_TOKEN_DIR}/${safe}/tokens.json`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/auth.test.ts tests/auth-oauth.test.ts
```

Expected: PASS (14 tests across 2 files)

- [ ] **Step 6: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/auth.ts tests/auth.test.ts tests/auth-oauth.test.ts
git commit -m "mcp: auth (OAuth token load/validate, Bearer resolution)"
```

---

### Task 4: consent.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/consent.ts`
- Create: `01_EXTENSIONS/mcp/tests/consent.test.ts`

Consent is session-only (Map-based, no file persistence). Three modes:
- `never` -- no prompts, automatic execution
- `once-per-server` (default) -- prompt once per server per session
- `always` -- prompt every time

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import { createConsentManager } from "../src/consent.js";

describe("consent - never mode", () => {
  it("always returns approved without prompting", () => {
    const mgr = createConsentManager("never");
    expect(mgr.needsConsent("server1")).toBe(false);
  });
});

describe("consent - once-per-server mode", () => {
  let mgr: ReturnType<typeof createConsentManager>;
  beforeEach(() => { mgr = createConsentManager("once-per-server"); });

  it("needs consent on first call for a server", () => {
    expect(mgr.needsConsent("s1")).toBe(true);
  });

  it("does not need consent after approval", () => {
    mgr.recordApproval("s1");
    expect(mgr.needsConsent("s1")).toBe(false);
  });

  it("does not need consent after denial", () => {
    mgr.recordDenial("s1");
    expect(mgr.needsConsent("s1")).toBe(false);
  });

  it("tracks servers independently", () => {
    mgr.recordApproval("s1");
    expect(mgr.needsConsent("s2")).toBe(true);
  });

  it("isDenied returns true after denial", () => {
    mgr.recordDenial("s1");
    expect(mgr.isDenied("s1")).toBe(true);
  });

  it("isDenied returns false after approval", () => {
    mgr.recordApproval("s1");
    expect(mgr.isDenied("s1")).toBe(false);
  });

  it("isDenied returns false for unknown server", () => {
    expect(mgr.isDenied("s1")).toBe(false);
  });
});

describe("consent - always mode", () => {
  it("always needs consent even after approval", () => {
    const mgr = createConsentManager("always");
    mgr.recordApproval("s1");
    expect(mgr.needsConsent("s1")).toBe(true);
  });

  it("isDenied tracks denial even in always mode", () => {
    const mgr = createConsentManager("always");
    mgr.recordDenial("s1");
    expect(mgr.isDenied("s1")).toBe(true);
  });
});

describe("consent - reset", () => {
  it("clears all consent state", () => {
    const mgr = createConsentManager("once-per-server");
    mgr.recordApproval("s1");
    mgr.reset();
    expect(mgr.needsConsent("s1")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/consent.test.ts
```

Expected: FAIL (consent module not found)

- [ ] **Step 3: Write consent.ts**

```typescript
import type { ConsentMode } from "./types-config.js";

export interface ConsentManager {
  needsConsent(server: string): boolean;
  recordApproval(server: string): void;
  recordDenial(server: string): void;
  isDenied(server: string): boolean;
  reset(): void;
}

export function createConsentManager(mode: ConsentMode): ConsentManager {
  const approved = new Set<string>();
  const denied = new Set<string>();

  return {
    needsConsent(server: string): boolean {
      if (mode === "never") return false;
      if (mode === "always") return true;
      return !approved.has(server) && !denied.has(server);
    },

    recordApproval(server: string): void {
      approved.add(server);
      denied.delete(server);
    },

    recordDenial(server: string): void {
      denied.add(server);
      approved.delete(server);
    },

    isDenied(server: string): boolean {
      return denied.has(server);
    },

    reset(): void {
      approved.clear();
      denied.clear();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/consent.test.ts
```

Expected: PASS (11 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/consent.ts tests/consent.test.ts
git commit -m "mcp: consent (never/once-per-server/always, session-only)"
```

---

### Task 5: Full test suite + Go architecture tests

- [ ] **Step 1: Run full test suite**

```bash
cd 01_EXTENSIONS/mcp && npm test
```

Expected: All tests pass. Coverage thresholds met (100% on all non-index files).

- [ ] **Step 2: Run Go architecture tests**

```bash
cd /Users/me/Desktop/pi && go test ./00_ARCHITECTURE/tests/ -v -count=1
```

Expected: ALL tests pass. Every `.ts` file is under 99 lines, no `as any/unknown/never`, no `ExtensionAPI` outside index.ts.

- [ ] **Step 3: Commit**

```bash
cd 01_EXTENSIONS/mcp && git add -A && git commit -m "mcp: Plan 4 Cache + Auth complete (4 modules)"
```
