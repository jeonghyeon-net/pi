# MCP Extension Plan 5: Lifecycle

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 4 lifecycle modules that orchestrate MCP server startup, shutdown, idle detection, and keep-alive health checks. `lifecycle-init.ts` is the most complex module (~70-85 lines) — it wires together config, cache, server connections, tool registration, and timer setup into a single `session_start` handler.

**Architecture:** 4 modules with clear responsibilities. `lifecycle-init` is the orchestrator; the other 3 are focused single-concern modules. All use dependency injection via narrow interfaces. Every file <= 99 lines.

**Tech Stack:** TypeScript, Vitest

**Prerequisites:** Plan 1 (Foundation), Plan 2 (Config), Plan 3 (Server), Plan 4 (Cache + Auth), Plan 6 (Tool Management) completed.

**Dependencies from earlier plans:**
- Plan 1: `state.ts` (getGeneration, incrementGeneration, setConfig, setConnection, getConnections, setMetadata, updateFooterStatus, resetState), `logger.ts` (createLogger, Logger), `constants.ts` (DEFAULT_IDLE_TIMEOUT_MS, KEEPALIVE_INTERVAL_MS, MAX_CONCURRENCY), `parallel.ts` (parallelLimit), `types-config.ts` (McpConfig, ServerEntry, LifecycleMode), `types-server.ts` (ServerConnection, McpClient), `types-tool.ts` (ToolDef, ToolMetadata)
- Plan 2: `config-load.ts` (loadConfig), `config-merge.ts` (mergeConfigs), `config-hash.ts` (computeConfigHash)
- Plan 3: `server-connect.ts` (connectServer), `server-close.ts` (closeServer, closeAllServers), `server-pool.ts` (getOrConnect)
- Plan 4: `cache-metadata.ts` (loadCache, saveCache), `auth.ts` (loadAuth)
- Plan 6: `tool-metadata.ts` (buildMetadata), `tool-direct.ts` (resolveDirectTools), `tool-direct-register.ts` (registerDirectTools), `tool-resource.ts` (buildResourceTools), `tool-collision.ts` (deduplicateTools)

---

### Task 1: lifecycle-idle.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/lifecycle-idle.ts`
- Create: `01_EXTENSIONS/mcp/tests/lifecycle-idle.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { startIdleTimer, stopIdleTimer } from "../src/lifecycle-idle.js";

describe("lifecycle-idle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stopIdleTimer();
  });
  afterEach(() => {
    stopIdleTimer();
    vi.useRealTimers();
  });

  it("closes idle non-keep-alive servers after timeout", () => {
    const closeFn = vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined);
    const now = Date.now();
    const connections = new Map([
      ["idle-server", { name: "idle-server", lastUsedAt: now - 700_000, status: "connected" }],
    ]);
    const servers: Record<string, { lifecycle?: string }> = { "idle-server": {} };
    startIdleTimer({ connections, servers, closeFn, timeoutMs: 600_000, intervalMs: 60_000 });
    vi.advanceTimersByTime(60_000);
    expect(closeFn).toHaveBeenCalledWith("idle-server");
  });

  it("skips keep-alive servers", () => {
    const closeFn = vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined);
    const now = Date.now();
    const connections = new Map([
      ["ka", { name: "ka", lastUsedAt: now - 700_000, status: "connected" }],
    ]);
    const servers: Record<string, { lifecycle?: string }> = { ka: { lifecycle: "keep-alive" } };
    startIdleTimer({ connections, servers, closeFn, timeoutMs: 600_000, intervalMs: 60_000 });
    vi.advanceTimersByTime(60_000);
    expect(closeFn).not.toHaveBeenCalled();
  });

  it("skips recently-used servers", () => {
    const closeFn = vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined);
    const connections = new Map([
      ["active", { name: "active", lastUsedAt: Date.now(), status: "connected" }],
    ]);
    const servers: Record<string, { lifecycle?: string }> = { active: {} };
    startIdleTimer({ connections, servers, closeFn, timeoutMs: 600_000, intervalMs: 60_000 });
    vi.advanceTimersByTime(60_000);
    expect(closeFn).not.toHaveBeenCalled();
  });

  it("stopIdleTimer prevents further checks", () => {
    const closeFn = vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined);
    const connections = new Map([
      ["s1", { name: "s1", lastUsedAt: Date.now() - 700_000, status: "connected" }],
    ]);
    const servers: Record<string, { lifecycle?: string }> = { s1: {} };
    startIdleTimer({ connections, servers, closeFn, timeoutMs: 600_000, intervalMs: 60_000 });
    stopIdleTimer();
    vi.advanceTimersByTime(60_000);
    expect(closeFn).not.toHaveBeenCalled();
  });

  it("skips servers not in connected status", () => {
    const closeFn = vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined);
    const connections = new Map([
      ["s1", { name: "s1", lastUsedAt: Date.now() - 700_000, status: "closed" }],
    ]);
    const servers: Record<string, { lifecycle?: string }> = { s1: {} };
    startIdleTimer({ connections, servers, closeFn, timeoutMs: 600_000, intervalMs: 60_000 });
    vi.advanceTimersByTime(60_000);
    expect(closeFn).not.toHaveBeenCalled();
  });

  it("uses per-server idleTimeout override", () => {
    const closeFn = vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined);
    const now = Date.now();
    const connections = new Map([
      ["s1", { name: "s1", lastUsedAt: now - 200_000, status: "connected" }],
    ]);
    const servers: Record<string, { lifecycle?: string; idleTimeout?: number }> = {
      s1: { idleTimeout: 100_000 },
    };
    startIdleTimer({ connections, servers, closeFn, timeoutMs: 600_000, intervalMs: 60_000 });
    vi.advanceTimersByTime(60_000);
    expect(closeFn).toHaveBeenCalledWith("s1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/lifecycle-idle.test.ts
```

Expected: FAIL (lifecycle-idle module not found)

- [ ] **Step 3: Write lifecycle-idle.ts**

```typescript
import type { Logger } from "./logger.js";

interface IdleConn {
  name: string;
  lastUsedAt: number;
  status: string;
}

interface IdleOpts {
  connections: Map<string, IdleConn>;
  servers: Record<string, { lifecycle?: string; idleTimeout?: number }>;
  closeFn: (name: string) => Promise<void>;
  timeoutMs: number;
  intervalMs: number;
  logger?: Logger;
}

let timer: ReturnType<typeof setInterval> | null = null;

function checkIdle(opts: IdleOpts): void {
  const now = Date.now();
  for (const [name, conn] of opts.connections) {
    if (conn.status !== "connected") continue;
    const serverDef = opts.servers[name];
    if (serverDef?.lifecycle === "keep-alive") continue;
    const timeout = serverDef?.idleTimeout ?? opts.timeoutMs;
    if (now - conn.lastUsedAt > timeout) {
      opts.logger?.info(`Closing idle server: ${name}`);
      opts.closeFn(name).catch(() => {});
    }
  }
}

export function startIdleTimer(opts: IdleOpts): void {
  stopIdleTimer();
  timer = setInterval(() => checkIdle(opts), opts.intervalMs);
}

export function stopIdleTimer(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/lifecycle-idle.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/lifecycle-idle.ts tests/lifecycle-idle.test.ts
git commit -m "mcp: lifecycle-idle (idle timeout detection + shutdown)"
```

---

### Task 2: lifecycle-keepalive.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/lifecycle-keepalive.ts`
- Create: `01_EXTENSIONS/mcp/tests/lifecycle-keepalive.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { startKeepalive, stopKeepalive } from "../src/lifecycle-keepalive.js";

describe("lifecycle-keepalive", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stopKeepalive();
  });
  afterEach(() => {
    stopKeepalive();
    vi.useRealTimers();
  });

  it("pings keep-alive servers on interval", async () => {
    const pingFn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const reconnectFn = vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined);
    const connections = new Map([
      ["ka", { name: "ka", client: { ping: pingFn }, status: "connected" }],
    ]);
    const servers: Record<string, { lifecycle?: string }> = { ka: { lifecycle: "keep-alive" } };
    startKeepalive({ connections, servers, reconnectFn, intervalMs: 30_000 });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(pingFn).toHaveBeenCalledOnce();
  });

  it("triggers reconnect on ping failure", async () => {
    const pingFn = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("timeout"));
    const reconnectFn = vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined);
    const connections = new Map([
      ["ka", { name: "ka", client: { ping: pingFn }, status: "connected" }],
    ]);
    const servers: Record<string, { lifecycle?: string }> = { ka: { lifecycle: "keep-alive" } };
    startKeepalive({ connections, servers, reconnectFn, intervalMs: 30_000 });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reconnectFn).toHaveBeenCalledWith("ka");
  });

  it("skips non-keep-alive servers", async () => {
    const pingFn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const reconnectFn = vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined);
    const connections = new Map([
      ["lazy", { name: "lazy", client: { ping: pingFn }, status: "connected" }],
    ]);
    const servers: Record<string, { lifecycle?: string }> = { lazy: {} };
    startKeepalive({ connections, servers, reconnectFn, intervalMs: 30_000 });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(pingFn).not.toHaveBeenCalled();
  });

  it("skips servers not in connected status", async () => {
    const pingFn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const reconnectFn = vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined);
    const connections = new Map([
      ["ka", { name: "ka", client: { ping: pingFn }, status: "failed" }],
    ]);
    const servers: Record<string, { lifecycle?: string }> = { ka: { lifecycle: "keep-alive" } };
    startKeepalive({ connections, servers, reconnectFn, intervalMs: 30_000 });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(pingFn).not.toHaveBeenCalled();
  });

  it("stopKeepalive prevents further pings", async () => {
    const pingFn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const reconnectFn = vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined);
    const connections = new Map([
      ["ka", { name: "ka", client: { ping: pingFn }, status: "connected" }],
    ]);
    const servers: Record<string, { lifecycle?: string }> = { ka: { lifecycle: "keep-alive" } };
    startKeepalive({ connections, servers, reconnectFn, intervalMs: 30_000 });
    stopKeepalive();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(pingFn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/lifecycle-keepalive.test.ts
```

Expected: FAIL (lifecycle-keepalive module not found)

- [ ] **Step 3: Write lifecycle-keepalive.ts**

```typescript
import type { Logger } from "./logger.js";

interface KeepaliveClient {
  ping(): Promise<void>;
}

interface KeepaliveConn {
  name: string;
  client: KeepaliveClient;
  status: string;
}

interface KeepaliveOpts {
  connections: Map<string, KeepaliveConn>;
  servers: Record<string, { lifecycle?: string }>;
  reconnectFn: (name: string) => Promise<void>;
  intervalMs: number;
  logger?: Logger;
}

let timer: ReturnType<typeof setInterval> | null = null;

async function pingAll(opts: KeepaliveOpts): Promise<void> {
  for (const [name, conn] of opts.connections) {
    if (conn.status !== "connected") continue;
    if (opts.servers[name]?.lifecycle !== "keep-alive") continue;
    try {
      await conn.client.ping();
      opts.logger?.debug(`Ping OK: ${name}`);
    } catch {
      opts.logger?.warn(`Ping failed, reconnecting: ${name}`);
      opts.reconnectFn(name).catch(() => {});
    }
  }
}

export function startKeepalive(opts: KeepaliveOpts): void {
  stopKeepalive();
  timer = setInterval(() => { pingAll(opts).catch(() => {}); }, opts.intervalMs);
}

export function stopKeepalive(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/lifecycle-keepalive.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/lifecycle-keepalive.ts tests/lifecycle-keepalive.test.ts
git commit -m "mcp: lifecycle-keepalive (periodic ping + auto-reconnect)"
```

---

### Task 3: lifecycle-shutdown.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/lifecycle-shutdown.ts`
- Create: `01_EXTENSIONS/mcp/tests/lifecycle-shutdown.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { onSessionShutdown } from "../src/lifecycle-shutdown.js";

describe("lifecycle-shutdown", () => {
  const makeOps = () => ({
    saveCache: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    closeAll: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stopIdle: vi.fn(),
    stopKeepalive: vi.fn(),
    resetState: vi.fn(),
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
  });

  it("calls dual-flush in order: saveCache then closeAll", async () => {
    const ops = makeOps();
    const order: string[] = [];
    ops.saveCache.mockImplementation(async () => { order.push("save"); });
    ops.closeAll.mockImplementation(async () => { order.push("close"); });
    const handler = onSessionShutdown(ops);
    await handler(undefined, undefined);
    expect(order).toEqual(["save", "close"]);
  });

  it("closeAll runs even if saveCache throws", async () => {
    const ops = makeOps();
    ops.saveCache.mockRejectedValue(new Error("disk full"));
    const handler = onSessionShutdown(ops);
    await handler(undefined, undefined);
    expect(ops.closeAll).toHaveBeenCalled();
    expect(ops.logger.error).toHaveBeenCalled();
  });

  it("stops timers before closing connections", async () => {
    const ops = makeOps();
    const order: string[] = [];
    ops.stopIdle.mockImplementation(() => { order.push("stopIdle"); });
    ops.stopKeepalive.mockImplementation(() => { order.push("stopKA"); });
    ops.saveCache.mockImplementation(async () => { order.push("save"); });
    const handler = onSessionShutdown(ops);
    await handler(undefined, undefined);
    expect(order[0]).toBe("stopIdle");
    expect(order[1]).toBe("stopKA");
  });

  it("calls resetState after everything", async () => {
    const ops = makeOps();
    const handler = onSessionShutdown(ops);
    await handler(undefined, undefined);
    expect(ops.resetState).toHaveBeenCalled();
  });

  it("resetState runs even if closeAll throws", async () => {
    const ops = makeOps();
    ops.closeAll.mockRejectedValue(new Error("stuck"));
    const handler = onSessionShutdown(ops);
    await handler(undefined, undefined);
    expect(ops.resetState).toHaveBeenCalled();
    expect(ops.logger.error).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/lifecycle-shutdown.test.ts
```

Expected: FAIL (lifecycle-shutdown module not found)

- [ ] **Step 3: Write lifecycle-shutdown.ts**

```typescript
import type { Logger } from "./logger.js";

interface ShutdownOps {
  saveCache: () => Promise<void>;
  closeAll: () => Promise<void>;
  stopIdle: () => void;
  stopKeepalive: () => void;
  resetState: () => void;
  logger: Logger;
}

export function onSessionShutdown(ops: ShutdownOps) {
  return async (_event: unknown, _ctx: unknown): Promise<void> => {
    ops.logger.info("Session shutdown starting");
    ops.stopIdle();
    ops.stopKeepalive();
    try {
      await ops.saveCache();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ops.logger.error(`Cache save failed: ${msg}`);
    }
    try {
      await ops.closeAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ops.logger.error(`Close connections failed: ${msg}`);
    }
    ops.resetState();
    ops.logger.info("Session shutdown complete");
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/lifecycle-shutdown.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/lifecycle-shutdown.ts tests/lifecycle-shutdown.test.ts
git commit -m "mcp: lifecycle-shutdown (dual-flush + timer teardown)"
```

---

### Task 4: lifecycle-init.ts (Part 1 — Test Files)

This is the most complex module (~70-85 lines). It orchestrates the entire `session_start` flow. Due to complexity, tests are split into two files.

**Files:**
- Create: `01_EXTENSIONS/mcp/tests/lifecycle-init.test.ts`
- Create: `01_EXTENSIONS/mcp/tests/lifecycle-init-errors.test.ts`

- [ ] **Step 1: Write lifecycle-init.test.ts (happy path)**

```typescript
import { describe, expect, it, vi } from "vitest";
import { onSessionStart } from "../src/lifecycle-init.js";
import type { InitDeps } from "../src/lifecycle-init.js";

const mockPi = () => ({ registerTool: vi.fn(), exec: vi.fn(), sendMessage: vi.fn() });

function makeDeps(overrides?: Partial<InitDeps>): InitDeps {
  return {
    loadConfig: vi.fn().mockResolvedValue({ mcpServers: { s1: { lifecycle: "eager" } } }),
    mergeConfigs: vi.fn().mockImplementation((c) => c),
    computeHash: vi.fn().mockReturnValue("hash1"),
    loadCache: vi.fn().mockReturnValue(null),
    saveCache: vi.fn().mockResolvedValue(undefined),
    connectServer: vi.fn().mockResolvedValue({ name: "s1", client: {}, status: "connected" }),
    buildMetadata: vi.fn().mockResolvedValue([{ name: "t1", originalName: "t1", serverName: "s1", description: "" }]),
    resolveDirectTools: vi.fn().mockReturnValue([]),
    registerDirectTools: vi.fn(),
    buildResourceTools: vi.fn().mockReturnValue([]),
    deduplicateTools: vi.fn().mockImplementation((tools) => tools),
    startIdleTimer: vi.fn(), startKeepalive: vi.fn(),
    setConfig: vi.fn(), setConnection: vi.fn(), setMetadata: vi.fn(),
    incrementGeneration: vi.fn().mockReturnValue(1),
    getGeneration: vi.fn().mockReturnValue(1),
    updateFooter: vi.fn(),
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
    ...overrides,
  };
}

async function run(deps: InitDeps) {
  const pi = mockPi();
  await onSessionStart(pi, deps)(undefined, undefined);
  return pi;
}

describe("lifecycle-init", () => {
  it("loads config and connects eager servers", async () => {
    const deps = makeDeps();
    await run(deps);
    expect(deps.loadConfig).toHaveBeenCalled();
    expect(deps.connectServer).toHaveBeenCalledWith("s1", expect.anything());
  });
  it("skips lazy servers during init", async () => {
    const deps = makeDeps({
      loadConfig: vi.fn().mockResolvedValue({ mcpServers: { s1: { lifecycle: "lazy" } } }),
    });
    await run(deps);
    expect(deps.connectServer).not.toHaveBeenCalled();
  });
  it("connects keep-alive servers", async () => {
    const deps = makeDeps({
      loadConfig: vi.fn().mockResolvedValue({ mcpServers: { ka: { lifecycle: "keep-alive" } } }),
      connectServer: vi.fn().mockResolvedValue({ name: "ka", client: {}, status: "connected" }),
    });
    await run(deps);
    expect(deps.connectServer).toHaveBeenCalledWith("ka", expect.anything());
  });
  it("builds and registers direct tools", async () => {
    const spec = { serverName: "s1", originalName: "t1", prefixedName: "s1_t1", description: "d" };
    const deps = makeDeps({ resolveDirectTools: vi.fn().mockReturnValue([spec]) });
    await run(deps);
    expect(deps.registerDirectTools).toHaveBeenCalled();
  });
  it("starts idle and keepalive timers", async () => {
    const deps = makeDeps();
    await run(deps);
    expect(deps.startIdleTimer).toHaveBeenCalled();
    expect(deps.startKeepalive).toHaveBeenCalled();
  });
  it("updates footer status", async () => {
    const deps = makeDeps();
    await run(deps);
    expect(deps.updateFooter).toHaveBeenCalled();
  });
  it("uses cache when hash matches", async () => {
    const cached = { hash: "hash1", servers: { s1: [{ name: "t1" }] }, timestamp: Date.now() };
    const deps = makeDeps({ loadCache: vi.fn().mockReturnValue(cached) });
    await run(deps);
    expect(deps.loadCache).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write lifecycle-init-errors.test.ts (error paths)**

```typescript
import { describe, expect, it, vi } from "vitest";
import { onSessionStart } from "../src/lifecycle-init.js";
import type { InitDeps } from "../src/lifecycle-init.js";

const mockPi = () => ({ registerTool: vi.fn(), exec: vi.fn(), sendMessage: vi.fn() });

function makeDeps(overrides?: Partial<InitDeps>): InitDeps {
  return {
    loadConfig: vi.fn().mockResolvedValue({ mcpServers: {} }),
    mergeConfigs: vi.fn().mockImplementation((c) => c),
    computeHash: vi.fn().mockReturnValue("hash1"),
    loadCache: vi.fn().mockReturnValue(null),
    saveCache: vi.fn().mockResolvedValue(undefined),
    connectServer: vi.fn().mockResolvedValue({ name: "s1", client: {}, status: "connected" }),
    buildMetadata: vi.fn().mockResolvedValue([]),
    resolveDirectTools: vi.fn().mockReturnValue([]),
    registerDirectTools: vi.fn(),
    buildResourceTools: vi.fn().mockReturnValue([]),
    deduplicateTools: vi.fn().mockImplementation((tools) => tools),
    startIdleTimer: vi.fn(), startKeepalive: vi.fn(),
    setConfig: vi.fn(), setConnection: vi.fn(), setMetadata: vi.fn(),
    incrementGeneration: vi.fn().mockReturnValue(1),
    getGeneration: vi.fn().mockReturnValue(1),
    updateFooter: vi.fn(),
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
    ...overrides,
  };
}

async function run(deps: InitDeps) {
  await onSessionStart(mockPi(), deps)(undefined, undefined);
}

describe("lifecycle-init errors", () => {
  it("continues when one server fails to connect", async () => {
    const deps = makeDeps({
      loadConfig: vi.fn().mockResolvedValue({
        mcpServers: { good: { lifecycle: "eager" }, bad: { lifecycle: "eager" } },
      }),
      connectServer: vi.fn().mockImplementation((name: string) => {
        if (name === "bad") return Promise.reject(new Error("refused"));
        return Promise.resolve({ name, client: {}, status: "connected" });
      }),
    });
    await run(deps);
    expect(deps.setConnection).toHaveBeenCalledWith("good", expect.anything());
    expect(deps.logger.warn).toHaveBeenCalled();
  });
  it("handles loadConfig failure gracefully", async () => {
    const deps = makeDeps({ loadConfig: vi.fn().mockRejectedValue(new Error("no config")) });
    await run(deps);
    expect(deps.logger.error).toHaveBeenCalled();
  });
  it("skips stale generation writes", async () => {
    let gen = 1;
    const deps = makeDeps({
      loadConfig: vi.fn().mockResolvedValue({ mcpServers: { s1: { lifecycle: "eager" } } }),
      incrementGeneration: vi.fn().mockReturnValue(1),
      getGeneration: vi.fn().mockImplementation(() => gen),
      connectServer: vi.fn().mockImplementation(async () => {
        gen = 2;
        return { name: "s1", client: {}, status: "connected" };
      }),
    });
    await run(deps);
    expect(deps.setConnection).not.toHaveBeenCalled();
  });
  it("handles empty server list", async () => {
    const deps = makeDeps();
    await run(deps);
    expect(deps.updateFooter).toHaveBeenCalled();
  });
  it("handles buildMetadata failure for a server", async () => {
    const deps = makeDeps({
      loadConfig: vi.fn().mockResolvedValue({ mcpServers: { s1: { lifecycle: "eager" } } }),
      buildMetadata: vi.fn().mockRejectedValue(new Error("discovery failed")),
    });
    await run(deps);
    expect(deps.logger.warn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/lifecycle-init.test.ts tests/lifecycle-init-errors.test.ts
```

Expected: FAIL (lifecycle-init module not found)

---

### Task 5: lifecycle-init.ts (Part 2 — Implementation)

**Files:**
- Create: `01_EXTENSIONS/mcp/src/lifecycle-init.ts`

This is the tightest module. The orchestration is split into the main handler function and two helper functions to stay under 99 lines.

- [ ] **Step 1: Write lifecycle-init.ts**

```typescript
import type { Logger } from "./logger.js";
import type { McpConfig, ServerEntry } from "./types-config.js";
import type { ToolMetadata, DirectToolSpec, ToolDef } from "./types-tool.js";

interface InitPi {
  registerTool(tool: ToolDef): void;
  exec(cmd: string, args: string[], opts?: { cwd?: string }): Promise<{ stdout: string; code: number }>;
  sendMessage(msg: { customType: string; content: string; display: boolean }): void;
}

export interface InitDeps {
  loadConfig: () => Promise<McpConfig>;
  mergeConfigs: (config: McpConfig) => McpConfig;
  computeHash: (config: McpConfig) => string;
  loadCache: () => { hash: string; servers: Record<string, unknown[]>; timestamp: number } | null;
  saveCache: (hash: string, metadata: Map<string, ToolMetadata[]>) => Promise<void>;
  connectServer: (name: string, entry: ServerEntry) => Promise<{ name: string; client: unknown; status: string }>;
  buildMetadata: (name: string, client: unknown) => Promise<ToolMetadata[]>;
  resolveDirectTools: (metadata: Map<string, ToolMetadata[]>, config: McpConfig) => DirectToolSpec[];
  registerDirectTools: (pi: InitPi, specs: DirectToolSpec[], deps: InitDeps) => void;
  buildResourceTools: (name: string, client: unknown) => ToolMetadata[];
  deduplicateTools: (tools: DirectToolSpec[]) => DirectToolSpec[];
  startIdleTimer: (opts: unknown) => void;
  startKeepalive: (opts: unknown) => void;
  setConfig: (config: McpConfig) => void;
  setConnection: (name: string, conn: unknown) => void;
  setMetadata: (name: string, tools: ToolMetadata[]) => void;
  incrementGeneration: () => number;
  getGeneration: () => number;
  updateFooter: () => void;
  logger: Logger;
}

type ServerClassification = { name: string; entry: ServerEntry; mode: string };

function classifyServers(config: McpConfig): { eager: ServerClassification[]; lazy: ServerClassification[] } {
  const eager: ServerClassification[] = [];
  const lazy: ServerClassification[] = [];
  for (const [name, entry] of Object.entries(config.mcpServers)) {
    const mode = entry.lifecycle ?? "lazy";
    if (mode === "lazy") lazy.push({ name, entry, mode });
    else eager.push({ name, entry, mode });
  }
  return { eager, lazy };
}

async function connectAndDiscover(
  gen: number, server: ServerClassification, deps: InitDeps,
): Promise<void> {
  try {
    const conn = await deps.connectServer(server.name, server.entry);
    if (deps.getGeneration() !== gen) return;
    deps.setConnection(server.name, conn);
    try {
      const tools = await deps.buildMetadata(server.name, conn.client);
      if (deps.getGeneration() !== gen) return;
      deps.setMetadata(server.name, tools);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      deps.logger.warn(`Tool discovery failed for ${server.name}: ${msg}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.logger.warn(`Failed to connect ${server.name}: ${msg}`);
  }
}

export function onSessionStart(pi: InitPi, deps: InitDeps) {
  return async (_event: unknown, _ctx: unknown): Promise<void> => {
    const gen = deps.incrementGeneration();
    deps.logger.info("Session start: loading config");
    let config: McpConfig;
    try {
      config = deps.mergeConfigs(await deps.loadConfig());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      deps.logger.error(`Config load failed: ${msg}`);
      return;
    }
    deps.setConfig(config);
    const hash = deps.computeHash(config);
    deps.loadCache();
    const { eager } = classifyServers(config);
    const total = Object.keys(config.mcpServers).length;
    const promises = eager.map((s) => connectAndDiscover(gen, s, deps));
    await Promise.allSettled(promises);
    if (deps.getGeneration() !== gen) return;
    const allMeta = new Map<string, ToolMetadata[]>();
    const directSpecs = deps.resolveDirectTools(allMeta, config);
    const deduped = deps.deduplicateTools(directSpecs);
    deps.registerDirectTools(pi, deduped, deps);
    deps.startIdleTimer(config);
    deps.startKeepalive(config);
    deps.saveCache(hash, allMeta).catch(() => {});
    deps.updateFooter();
    deps.logger.info(`Session started: ${eager.length}/${total} servers connected`);
  };
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/lifecycle-init.test.ts tests/lifecycle-init-errors.test.ts
```

Expected: PASS (12 tests total — 7 happy path + 5 error paths)

- [ ] **Step 3: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/lifecycle-init.ts tests/lifecycle-init.test.ts tests/lifecycle-init-errors.test.ts
git commit -m "mcp: lifecycle-init (session_start orchestration with generation tracking)"
```

---

### Task 6: Full test suite + architecture verification

- [ ] **Step 1: Run full test suite for lifecycle modules**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/lifecycle-idle.test.ts tests/lifecycle-keepalive.test.ts tests/lifecycle-shutdown.test.ts tests/lifecycle-init.test.ts tests/lifecycle-init-errors.test.ts
```

Expected: ALL tests pass (28 tests: 6 + 5 + 5 + 7 + 5)

- [ ] **Step 2: Run Go architecture tests**

```bash
cd /Users/me/Desktop/pi && go test ./00_ARCHITECTURE/tests/ -v -count=1
```

Expected: ALL tests pass. Every `.ts` file is under 99 lines, no `as any/unknown/never`, no `ExtensionAPI` outside index.ts.

- [ ] **Step 3: Commit**

```bash
cd 01_EXTENSIONS/mcp && git add -A && git commit -m "mcp: Plan 5 Lifecycle complete (4 modules)"
```
