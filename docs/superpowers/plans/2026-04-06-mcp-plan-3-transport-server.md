# MCP Extension Plan 3: Transport + Server

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build all transport, server connection, pagination, and NPX resolution modules. These provide the infrastructure for connecting to MCP servers over stdio and HTTP, discovering tools/resources, and managing the connection pool.

**Architecture:** 9 modules (10 minus failure-tracker which is in Plan 1) with dependency injection for all I/O. Transport modules define narrow interfaces for MCP SDK transports. Server modules use TransportFactory + McpClient factory for testability. Every file <= 99 lines.

**Tech Stack:** TypeScript, Vitest, @modelcontextprotocol/sdk

**Prerequisite:** Plan 1 (Foundation) completed -- depends on types-server.ts, types-config.ts, constants.ts, errors.ts, env.ts, parallel.ts.

**Dependencies from Plan 1:**
- `McpTransport`, `McpClient`, `ServerConnection`, `ConnectionStatus` from types-server.ts
- `ServerEntry` from types-config.ts
- `McpError`, `mcpError` from errors.ts
- `interpolateEnv` from env.ts
- `parallelLimit` from parallel.ts
- `ToolMetadata` from types-tool.ts

---

### Task 1: transport-stdio.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/transport-stdio.ts`
- Create: `01_EXTENSIONS/mcp/tests/transport-stdio.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { createStdioTransport } from "../src/transport-stdio.js";

describe("createStdioTransport", () => {
	it("spawns process with interpolated args", () => {
		const mockTransport = { close: vi.fn() };
		const factory = vi.fn().mockReturnValue(mockTransport);
		const env = { HOME: "/home/user" };
		const result = createStdioTransport(
			{ command: "node", args: ["${HOME}/server.js"], env: { KEY: "val" } },
			env, factory,
		);
		expect(factory).toHaveBeenCalledWith("node", ["/home/user/server.js"], {
			env: { KEY: "val" },
		});
		expect(result).toBe(mockTransport);
	});

	it("handles missing args", () => {
		const mockTransport = { close: vi.fn() };
		const factory = vi.fn().mockReturnValue(mockTransport);
		createStdioTransport({ command: "echo" }, {}, factory);
		expect(factory).toHaveBeenCalledWith("echo", [], { env: undefined });
	});

	it("interpolates env values", () => {
		const mockTransport = { close: vi.fn() };
		const factory = vi.fn().mockReturnValue(mockTransport);
		createStdioTransport(
			{ command: "cmd", env: { TOKEN: "${SECRET}" } },
			{ SECRET: "abc" }, factory,
		);
		expect(factory).toHaveBeenCalledWith("cmd", [], { env: { TOKEN: "abc" } });
	});

	it("passes cwd when provided", () => {
		const mockTransport = { close: vi.fn() };
		const factory = vi.fn().mockReturnValue(mockTransport);
		createStdioTransport(
			{ command: "cmd", cwd: "/work" }, {}, factory,
		);
		expect(factory).toHaveBeenCalledWith("cmd", [], {
			env: undefined, cwd: "/work",
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/transport-stdio.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Write transport-stdio.ts**

```typescript
import type { McpTransport } from "./types-server.js";
import type { ServerEntry } from "./types-config.js";
import { interpolateEnv } from "./env.js";

export interface StdioOpts {
	env?: Record<string, string>;
	cwd?: string;
}

export type StdioTransportFactory = (
	cmd: string,
	args: string[],
	opts: StdioOpts,
) => McpTransport;

function interpolateRecord(
	rec: Record<string, string> | undefined,
	vars: Record<string, string | undefined>,
): Record<string, string> | undefined {
	if (!rec) return undefined;
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(rec)) {
		out[k] = interpolateEnv(v, vars);
	}
	return out;
}

export function createStdioTransport(
	entry: ServerEntry,
	processEnv: Record<string, string | undefined>,
	factory: StdioTransportFactory,
): McpTransport {
	const args = (entry.args ?? []).map((a) => interpolateEnv(a, processEnv));
	const env = interpolateRecord(entry.env, processEnv);
	const opts: StdioOpts = { env };
	if (entry.cwd) opts.cwd = entry.cwd;
	return factory(entry.command ?? "", args, opts);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/transport-stdio.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/transport-stdio.ts tests/transport-stdio.test.ts
git commit -m "mcp: transport-stdio (Stdio transport + env interpolation)"
```

---

### Task 2: transport-http-streamable.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/transport-http-streamable.ts`
- Create: `01_EXTENSIONS/mcp/tests/transport-http-streamable.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { createStreamableHttpTransport } from "../src/transport-http-streamable.js";

describe("createStreamableHttpTransport", () => {
	it("creates transport with url and headers", async () => {
		const mockTransport = { close: vi.fn() };
		const factory = vi.fn().mockResolvedValue(mockTransport);
		const result = await createStreamableHttpTransport(
			"http://localhost:3000/mcp", { "X-Key": "val" }, factory,
		);
		expect(factory).toHaveBeenCalledWith(
			"http://localhost:3000/mcp", { "X-Key": "val" },
		);
		expect(result).toBe(mockTransport);
	});

	it("creates transport without headers", async () => {
		const mockTransport = { close: vi.fn() };
		const factory = vi.fn().mockResolvedValue(mockTransport);
		await createStreamableHttpTransport("http://host/mcp", undefined, factory);
		expect(factory).toHaveBeenCalledWith("http://host/mcp", undefined);
	});

	it("propagates factory errors", async () => {
		const factory = vi.fn().mockRejectedValue(new Error("connect failed"));
		await expect(
			createStreamableHttpTransport("http://bad", undefined, factory),
		).rejects.toThrow("connect failed");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/transport-http-streamable.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Write transport-http-streamable.ts**

```typescript
import type { McpTransport } from "./types-server.js";

export type StreamableHttpFactory = (
	url: string,
	headers?: Record<string, string>,
) => Promise<McpTransport>;

export async function createStreamableHttpTransport(
	url: string,
	headers: Record<string, string> | undefined,
	factory: StreamableHttpFactory,
): Promise<McpTransport> {
	return factory(url, headers);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/transport-http-streamable.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/transport-http-streamable.ts tests/transport-http-streamable.test.ts
git commit -m "mcp: transport-http-streamable (StreamableHTTP transport)"
```

---

### Task 3: transport-http-sse.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/transport-http-sse.ts`
- Create: `01_EXTENSIONS/mcp/tests/transport-http-sse.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { createSseTransport } from "../src/transport-http-sse.js";

describe("createSseTransport", () => {
	it("creates transport with url and headers", async () => {
		const mockTransport = { close: vi.fn() };
		const factory = vi.fn().mockResolvedValue(mockTransport);
		const result = await createSseTransport(
			"http://localhost:3000/sse", { Authorization: "Bearer tok" }, factory,
		);
		expect(factory).toHaveBeenCalledWith(
			"http://localhost:3000/sse", { Authorization: "Bearer tok" },
		);
		expect(result).toBe(mockTransport);
	});

	it("creates transport without headers", async () => {
		const mockTransport = { close: vi.fn() };
		const factory = vi.fn().mockResolvedValue(mockTransport);
		await createSseTransport("http://host/sse", undefined, factory);
		expect(factory).toHaveBeenCalledWith("http://host/sse", undefined);
	});

	it("propagates factory errors", async () => {
		const factory = vi.fn().mockRejectedValue(new Error("sse failed"));
		await expect(
			createSseTransport("http://bad", undefined, factory),
		).rejects.toThrow("sse failed");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/transport-http-sse.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Write transport-http-sse.ts**

```typescript
import type { McpTransport } from "./types-server.js";

export type SseTransportFactory = (
	url: string,
	headers?: Record<string, string>,
) => Promise<McpTransport>;

export async function createSseTransport(
	url: string,
	headers: Record<string, string> | undefined,
	factory: SseTransportFactory,
): Promise<McpTransport> {
	return factory(url, headers);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/transport-http-sse.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/transport-http-sse.ts tests/transport-http-sse.test.ts
git commit -m "mcp: transport-http-sse (SSE transport)"
```

---

### Task 4: transport-http.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/transport-http.ts`
- Create: `01_EXTENSIONS/mcp/tests/transport-http.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { createHttpTransport } from "../src/transport-http.js";
import type { TransportFactory } from "../src/transport-http.js";

describe("createHttpTransport", () => {
	it("returns streamable transport on success", async () => {
		const transport = { close: vi.fn() };
		const factory: TransportFactory = {
			createStreamableHttp: vi.fn().mockResolvedValue(transport),
			createSse: vi.fn(),
		};
		const result = await createHttpTransport("http://host/mcp", undefined, factory);
		expect(result).toBe(transport);
		expect(factory.createStreamableHttp).toHaveBeenCalledWith("http://host/mcp", undefined);
		expect(factory.createSse).not.toHaveBeenCalled();
	});

	it("falls back to SSE when streamable fails", async () => {
		const sseTransport = { close: vi.fn() };
		const factory: TransportFactory = {
			createStreamableHttp: vi.fn().mockRejectedValue(new Error("unsupported")),
			createSse: vi.fn().mockResolvedValue(sseTransport),
		};
		const result = await createHttpTransport("http://host/mcp", { key: "v" }, factory);
		expect(result).toBe(sseTransport);
		expect(factory.createSse).toHaveBeenCalledWith("http://host/mcp", { key: "v" });
	});

	it("throws when both transports fail", async () => {
		const factory: TransportFactory = {
			createStreamableHttp: vi.fn().mockRejectedValue(new Error("fail1")),
			createSse: vi.fn().mockRejectedValue(new Error("fail2")),
		};
		await expect(
			createHttpTransport("http://host/mcp", undefined, factory),
		).rejects.toThrow("fail2");
	});

	it("passes headers to both attempts", async () => {
		const transport = { close: vi.fn() };
		const factory: TransportFactory = {
			createStreamableHttp: vi.fn().mockRejectedValue(new Error("no")),
			createSse: vi.fn().mockResolvedValue(transport),
		};
		const headers = { Authorization: "Bearer tok" };
		await createHttpTransport("http://host", headers, factory);
		expect(factory.createStreamableHttp).toHaveBeenCalledWith("http://host", headers);
		expect(factory.createSse).toHaveBeenCalledWith("http://host", headers);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/transport-http.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Write transport-http.ts**

```typescript
import type { McpTransport } from "./types-server.js";

export interface TransportFactory {
	createStreamableHttp(
		url: string,
		headers?: Record<string, string>,
	): Promise<McpTransport>;
	createSse(
		url: string,
		headers?: Record<string, string>,
	): Promise<McpTransport>;
}

export async function createHttpTransport(
	url: string,
	headers: Record<string, string> | undefined,
	factory: TransportFactory,
): Promise<McpTransport> {
	try {
		return await factory.createStreamableHttp(url, headers);
	} catch {
		return factory.createSse(url, headers);
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/transport-http.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/transport-http.ts tests/transport-http.test.ts
git commit -m "mcp: transport-http (StreamableHTTP -> SSE fallback router)"
```

---

### Task 5: npx-resolver.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/npx-resolver.ts`
- Create: `01_EXTENSIONS/mcp/tests/npx-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { resolveNpxCommand } from "../src/npx-resolver.js";
import type { ExecSync, NpxCacheOps } from "../src/npx-resolver.js";

describe("resolveNpxCommand", () => {
	const NOW = 1_000_000;

	function makeCache(entries: Record<string, { path: string; at: number }>): NpxCacheOps {
		const store = new Map(Object.entries(entries));
		return {
			get: (k: string) => store.get(k),
			set: vi.fn((k: string, v: { path: string; at: number }) => { store.set(k, v); }),
		};
	}

	it("returns original command when not npx/npm", () => {
		const exec: ExecSync = vi.fn();
		const result = resolveNpxCommand("node", ["server.js"], exec, makeCache({}), NOW);
		expect(result).toEqual({ command: "node", args: ["server.js"] });
		expect(exec).not.toHaveBeenCalled();
	});

	it("resolves npx package to binary path", () => {
		const exec: ExecSync = vi.fn().mockReturnValue("/usr/local/bin/server\n");
		const cache = makeCache({});
		const result = resolveNpxCommand("npx", ["@org/server"], exec, cache, NOW);
		expect(result.command).toBe("/usr/local/bin/server");
		expect(result.args).toEqual([]);
		expect(exec).toHaveBeenCalled();
	});

	it("uses cache for recent resolution", () => {
		const exec: ExecSync = vi.fn();
		const cache = makeCache({
			"@org/server": { path: "/cached/bin", at: NOW - 1000 },
		});
		const result = resolveNpxCommand("npx", ["@org/server"], exec, cache, NOW);
		expect(result.command).toBe("/cached/bin");
		expect(exec).not.toHaveBeenCalled();
	});

	it("bypasses stale cache (>24h)", () => {
		const exec: ExecSync = vi.fn().mockReturnValue("/new/bin\n");
		const staleAt = NOW - 25 * 60 * 60 * 1000;
		const cache = makeCache({
			"pkg": { path: "/old/bin", at: staleAt },
		});
		const result = resolveNpxCommand("npx", ["pkg"], exec, cache, NOW);
		expect(result.command).toBe("/new/bin");
	});

	it("handles npm exec --", () => {
		const exec: ExecSync = vi.fn().mockReturnValue("/bin/tool\n");
		const result = resolveNpxCommand("npm", ["exec", "--", "tool"], exec, makeCache({}), NOW);
		expect(result.command).toBe("/bin/tool");
	});

	it("passes extra args through after package", () => {
		const exec: ExecSync = vi.fn().mockReturnValue("/bin/srv\n");
		const result = resolveNpxCommand(
			"npx", ["@org/server", "--port", "3000"], exec, makeCache({}), NOW,
		);
		expect(result.command).toBe("/bin/srv");
		expect(result.args).toEqual(["--port", "3000"]);
	});

	it("falls back to original on exec failure", () => {
		const exec: ExecSync = vi.fn().mockImplementation(() => { throw new Error("not found"); });
		const result = resolveNpxCommand("npx", ["pkg"], exec, makeCache({}), NOW);
		expect(result).toEqual({ command: "npx", args: ["pkg"] });
	});

	it("handles npx -y flag", () => {
		const exec: ExecSync = vi.fn().mockReturnValue("/bin/pkg\n");
		const result = resolveNpxCommand("npx", ["-y", "pkg"], exec, makeCache({}), NOW);
		expect(result.command).toBe("/bin/pkg");
		expect(result.args).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/npx-resolver.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Write npx-resolver.ts**

```typescript
import { NPX_CACHE_TTL_MS } from "./constants.js";

export type ExecSync = (cmd: string, opts?: { timeout?: number }) => string;

export interface NpxCacheOps {
	get(key: string): { path: string; at: number } | undefined;
	set(key: string, value: { path: string; at: number }): void;
}

interface ResolvedCommand {
	command: string;
	args: string[];
}

const NPX_FLAGS = new Set(["-y", "--yes", "-p", "--package"]);

function parseNpxArgs(args: string[]): { pkg: string; rest: string[] } | null {
	let i = 0;
	while (i < args.length && NPX_FLAGS.has(args[i])) {
		i++;
		if (args[i - 1] === "-p" || args[i - 1] === "--package") i++;
	}
	if (args[0] === "exec") { i = 1; if (args[i] === "--") i++; }
	if (i >= args.length) return null;
	return { pkg: args[i], rest: args.slice(i + 1) };
}

function lookupBinary(pkg: string, exec: ExecSync): string | null {
	try {
		return exec(`which ${pkg.split("/").pop()}`, { timeout: 5000 }).trim() || null;
	} catch {
		return null;
	}
}

export function resolveNpxCommand(
	command: string,
	args: string[],
	exec: ExecSync,
	cache: NpxCacheOps,
	now: number,
): ResolvedCommand {
	if (command !== "npx" && command !== "npm") return { command, args };
	const parsed = parseNpxArgs(command === "npm" ? args : args);
	if (!parsed) return { command, args };
	const cached = cache.get(parsed.pkg);
	if (cached && now - cached.at < NPX_CACHE_TTL_MS) {
		return { command: cached.path, args: parsed.rest };
	}
	const resolved = lookupBinary(parsed.pkg, exec);
	if (!resolved) return { command, args };
	cache.set(parsed.pkg, { path: resolved, at: now });
	return { command: resolved, args: parsed.rest };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/npx-resolver.test.ts
```

Expected: PASS (8 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/npx-resolver.ts tests/npx-resolver.test.ts
git commit -m "mcp: npx-resolver (npx/npm exec -> binary path, 24h cache)"
```

---

### Task 6: pagination.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/pagination.ts`
- Create: `01_EXTENSIONS/mcp/tests/pagination.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { paginateAll } from "../src/pagination.js";

describe("paginateAll", () => {
	it("collects single page without cursor", async () => {
		const fetcher = vi.fn().mockResolvedValue({ items: [1, 2], nextCursor: undefined });
		const result = await paginateAll(fetcher);
		expect(result).toEqual([1, 2]);
		expect(fetcher).toHaveBeenCalledWith(undefined);
	});

	it("follows cursors across multiple pages", async () => {
		const fetcher = vi.fn()
			.mockResolvedValueOnce({ items: ["a"], nextCursor: "cur1" })
			.mockResolvedValueOnce({ items: ["b"], nextCursor: "cur2" })
			.mockResolvedValueOnce({ items: ["c"], nextCursor: undefined });
		const result = await paginateAll(fetcher);
		expect(result).toEqual(["a", "b", "c"]);
		expect(fetcher).toHaveBeenCalledTimes(3);
		expect(fetcher).toHaveBeenNthCalledWith(2, "cur1");
		expect(fetcher).toHaveBeenNthCalledWith(3, "cur2");
	});

	it("returns empty array for empty page", async () => {
		const fetcher = vi.fn().mockResolvedValue({ items: [], nextCursor: undefined });
		expect(await paginateAll(fetcher)).toEqual([]);
	});

	it("stops at max pages to prevent infinite loops", async () => {
		const fetcher = vi.fn().mockResolvedValue({ items: [1], nextCursor: "loop" });
		const result = await paginateAll(fetcher, 3);
		expect(result).toEqual([1, 1, 1]);
		expect(fetcher).toHaveBeenCalledTimes(3);
	});

	it("propagates fetcher errors", async () => {
		const fetcher = vi.fn().mockRejectedValue(new Error("fetch failed"));
		await expect(paginateAll(fetcher)).rejects.toThrow("fetch failed");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/pagination.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Write pagination.ts**

```typescript
const DEFAULT_MAX_PAGES = 100;

export interface PaginatedResult<T> {
	items: T[];
	nextCursor?: string;
}

export type PageFetcher<T> = (cursor: string | undefined) => Promise<PaginatedResult<T>>;

export async function paginateAll<T>(
	fetcher: PageFetcher<T>,
	maxPages: number = DEFAULT_MAX_PAGES,
): Promise<T[]> {
	const all: T[] = [];
	let cursor: string | undefined;
	let pages = 0;

	do {
		const result = await fetcher(cursor);
		all.push(...result.items);
		cursor = result.nextCursor;
		pages++;
	} while (cursor && pages < maxPages);

	return all;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/pagination.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/pagination.ts tests/pagination.test.ts
git commit -m "mcp: pagination (cursor-based tool/resource pagination)"
```

---

### Task 7: server-pool.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/server-pool.ts`
- Create: `01_EXTENSIONS/mcp/tests/server-pool.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, beforeEach, vi } from "vitest";
import { ServerPool } from "../src/server-pool.js";
import type { ServerConnection } from "../src/types-server.js";

function mockConn(name: string): ServerConnection {
	return {
		name,
		client: {
			callTool: vi.fn(), listTools: vi.fn(), listResources: vi.fn(),
			readResource: vi.fn(), ping: vi.fn(), close: vi.fn(),
		},
		transport: { close: vi.fn() },
		status: "connected",
		lastUsedAt: Date.now(),
		inFlight: 0,
	};
}

describe("ServerPool", () => {
	let pool: ServerPool;
	beforeEach(() => { pool = new ServerPool(); });

	it("get returns undefined for missing server", () => {
		expect(pool.get("none")).toBeUndefined();
	});

	it("add and get round-trip", () => {
		const conn = mockConn("s1");
		pool.add("s1", conn);
		expect(pool.get("s1")).toBe(conn);
	});

	it("remove deletes connection", () => {
		pool.add("s1", mockConn("s1"));
		pool.remove("s1");
		expect(pool.get("s1")).toBeUndefined();
	});

	it("all returns all connections", () => {
		pool.add("s1", mockConn("s1"));
		pool.add("s2", mockConn("s2"));
		expect(pool.all().size).toBe(2);
	});

	it("dedup: concurrent connects share one promise", async () => {
		let resolveCount = 0;
		const connector = vi.fn().mockImplementation(async () => {
			resolveCount++;
			return mockConn("s1");
		});
		const [a, b] = await Promise.all([
			pool.getOrConnect("s1", connector),
			pool.getOrConnect("s1", connector),
		]);
		expect(a).toBe(b);
		expect(resolveCount).toBe(1);
	});

	it("dedup: clears pending on failure", async () => {
		const fail = vi.fn().mockRejectedValue(new Error("fail"));
		await expect(pool.getOrConnect("s1", fail)).rejects.toThrow("fail");
		const ok = vi.fn().mockResolvedValue(mockConn("s1"));
		const conn = await pool.getOrConnect("s1", ok);
		expect(conn.name).toBe("s1");
	});

	it("getOrConnect returns existing connection", async () => {
		const conn = mockConn("s1");
		pool.add("s1", conn);
		const connector = vi.fn();
		const result = await pool.getOrConnect("s1", connector);
		expect(result).toBe(conn);
		expect(connector).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/server-pool.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Write server-pool.ts**

```typescript
import type { ServerConnection } from "./types-server.js";

export class ServerPool {
	private readonly connections = new Map<string, ServerConnection>();
	private readonly pending = new Map<string, Promise<ServerConnection>>();

	get(name: string): ServerConnection | undefined {
		return this.connections.get(name);
	}

	add(name: string, conn: ServerConnection): void {
		this.connections.set(name, conn);
	}

	remove(name: string): void {
		this.connections.delete(name);
	}

	all(): Map<string, ServerConnection> {
		return this.connections;
	}

	async getOrConnect(
		name: string,
		connector: () => Promise<ServerConnection>,
	): Promise<ServerConnection> {
		const existing = this.connections.get(name);
		if (existing) return existing;

		const inflight = this.pending.get(name);
		if (inflight) return inflight;

		const promise = connector().then(
			(conn) => { this.connections.set(name, conn); this.pending.delete(name); return conn; },
			(err) => { this.pending.delete(name); throw err; },
		);
		this.pending.set(name, promise);
		return promise;
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/server-pool.test.ts
```

Expected: PASS (7 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/server-pool.ts tests/server-pool.test.ts
git commit -m "mcp: server-pool (Map-based pool, dedup concurrent connects)"
```

---

### Task 8: server-connect.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/server-connect.ts`
- Create: `01_EXTENSIONS/mcp/tests/server-connect.test.ts`
- Create: `01_EXTENSIONS/mcp/tests/server-connect-discovery.test.ts`

This is the most complex module -- it selects transport type based on ServerEntry, creates the transport, connects the client, and discovers tools/resources via pagination. Split into two test files.

Design note: `ConnectDeps.createHttpTransport` takes only `(url, headers)` -- the caller is responsible for wiring the StreamableHTTP-to-SSE fallback via `transport-http.ts` before injecting. This keeps server-connect.ts decoupled from transport internals.

- [ ] **Step 1: Write the failing test (server-connect.test.ts)**

```typescript
import { describe, expect, it, vi } from "vitest";
import { connectServer } from "../src/server-connect.js";
import type { ConnectDeps } from "../src/server-connect.js";
import type { McpTransport } from "../src/types-server.js";

function makeDeps(overrides?: Partial<ConnectDeps>): ConnectDeps {
	const transport: McpTransport = { close: vi.fn() };
	return {
		createStdioTransport: vi.fn().mockReturnValue(transport),
		createHttpTransport: vi.fn().mockResolvedValue(transport),
		createClient: vi.fn().mockReturnValue({
			callTool: vi.fn(),
			listTools: vi.fn().mockResolvedValue({ tools: [] }),
			listResources: vi.fn().mockResolvedValue({ resources: [] }),
			readResource: vi.fn(), ping: vi.fn(), close: vi.fn(),
			connect: vi.fn().mockResolvedValue(undefined),
		}),
		processEnv: {},
		...overrides,
	};
}

describe("connectServer", () => {
	it("uses stdio transport for command-based entry", async () => {
		const deps = makeDeps();
		const conn = await connectServer("s1", { command: "echo" }, deps);
		expect(conn.name).toBe("s1");
		expect(conn.status).toBe("connected");
		expect(deps.createStdioTransport).toHaveBeenCalled();
		expect(deps.createHttpTransport).not.toHaveBeenCalled();
	});

	it("uses http transport for url-based entry", async () => {
		const deps = makeDeps();
		const conn = await connectServer("s1", { url: "http://localhost" }, deps);
		expect(conn.name).toBe("s1");
		expect(deps.createHttpTransport).toHaveBeenCalledWith("http://localhost", undefined);
		expect(deps.createStdioTransport).not.toHaveBeenCalled();
	});

	it("passes headers for http transport", async () => {
		const deps = makeDeps();
		const headers = { "X-Key": "val" };
		await connectServer("s1", { url: "http://h", headers }, deps);
		expect(deps.createHttpTransport).toHaveBeenCalledWith("http://h", headers);
	});

	it("throws on entry without command or url", async () => {
		const deps = makeDeps();
		await expect(connectServer("s1", {}, deps)).rejects.toThrow("no command or url");
	});

	it("calls client.connect with transport", async () => {
		const transport: McpTransport = { close: vi.fn() };
		const connectFn = vi.fn().mockResolvedValue(undefined);
		const deps = makeDeps({
			createStdioTransport: vi.fn().mockReturnValue(transport),
			createClient: vi.fn().mockReturnValue({
				callTool: vi.fn(),
				listTools: vi.fn().mockResolvedValue({ tools: [] }),
				listResources: vi.fn().mockResolvedValue({ resources: [] }),
				readResource: vi.fn(), ping: vi.fn(), close: vi.fn(),
				connect: connectFn,
			}),
		});
		await connectServer("s1", { command: "echo" }, deps);
		expect(connectFn).toHaveBeenCalledWith(transport);
	});
});
```

- [ ] **Step 2: Write the failing test (server-connect-discovery.test.ts)**

```typescript
import { describe, expect, it, vi } from "vitest";
import { connectServer } from "../src/server-connect.js";
import type { ConnectDeps } from "../src/server-connect.js";
import type { McpTransport, McpToolRaw, McpResourceRaw } from "../src/types-server.js";

function makeDeps(
	tools: McpToolRaw[],
	resources: McpResourceRaw[],
	toolCursor?: string,
): ConnectDeps {
	const transport: McpTransport = { close: vi.fn() };
	let toolCall = 0;
	return {
		createStdioTransport: vi.fn().mockReturnValue(transport),
		createHttpTransport: vi.fn().mockResolvedValue(transport),
		createClient: vi.fn().mockReturnValue({
			callTool: vi.fn(),
			listTools: vi.fn().mockImplementation(() => {
				toolCall++;
				if (toolCall === 1 && toolCursor) {
					return Promise.resolve({
						tools: tools.slice(0, 1), nextCursor: toolCursor,
					});
				}
				return Promise.resolve({
					tools: toolCall === 1 ? tools : tools.slice(1),
				});
			}),
			listResources: vi.fn().mockResolvedValue({ resources }),
			readResource: vi.fn(), ping: vi.fn(), close: vi.fn(),
			connect: vi.fn().mockResolvedValue(undefined),
		}),
		processEnv: {},
	};
}

describe("connectServer discovery", () => {
	it("discovers tools", async () => {
		const tools: McpToolRaw[] = [{ name: "echo", description: "Echo tool" }];
		const deps = makeDeps(tools, []);
		const conn = await connectServer("s1", { command: "echo" }, deps);
		expect(conn.tools).toEqual(tools);
	});

	it("discovers resources", async () => {
		const resources: McpResourceRaw[] = [{ uri: "file:///a", name: "doc" }];
		const deps = makeDeps([], resources);
		const conn = await connectServer("s1", { command: "echo" }, deps);
		expect(conn.resources).toEqual(resources);
	});

	it("paginates tools across multiple pages", async () => {
		const tools: McpToolRaw[] = [
			{ name: "t1", description: "Tool 1" },
			{ name: "t2", description: "Tool 2" },
		];
		const deps = makeDeps(tools, [], "cursor1");
		const conn = await connectServer("s1", { command: "echo" }, deps);
		expect(conn.tools).toHaveLength(2);
	});

	it("returns empty arrays when no tools/resources", async () => {
		const deps = makeDeps([], []);
		const conn = await connectServer("s1", { command: "echo" }, deps);
		expect(conn.tools).toEqual([]);
		expect(conn.resources).toEqual([]);
	});
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/server-connect.test.ts tests/server-connect-discovery.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 4: Write server-connect.ts**

```typescript
import type { McpTransport, McpClient, ServerConnection, McpToolRaw, McpResourceRaw } from "./types-server.js";
import type { ServerEntry } from "./types-config.js";
import { mcpError } from "./errors.js";
import { paginateAll } from "./pagination.js";

export interface ConnectableClient extends McpClient {
	connect(transport: McpTransport): Promise<void>;
}

export interface ConnectDeps {
	createStdioTransport(
		entry: ServerEntry,
		env: Record<string, string | undefined>,
	): McpTransport;
	createHttpTransport(
		url: string,
		headers: Record<string, string> | undefined,
	): Promise<McpTransport>;
	createClient(): ConnectableClient;
	processEnv: Record<string, string | undefined>;
}

export interface ConnectResult extends ServerConnection {
	tools: McpToolRaw[];
	resources: McpResourceRaw[];
}

async function discoverTools(client: McpClient): Promise<McpToolRaw[]> {
	return paginateAll(async (cursor) => {
		const r = await client.listTools(cursor ? { cursor } : undefined);
		return { items: r.tools, nextCursor: r.nextCursor };
	});
}

async function discoverResources(client: McpClient): Promise<McpResourceRaw[]> {
	return paginateAll(async (cursor) => {
		const r = await client.listResources(cursor ? { cursor } : undefined);
		return { items: r.resources, nextCursor: r.nextCursor };
	});
}

export async function connectServer(
	name: string,
	entry: ServerEntry,
	deps: ConnectDeps,
): Promise<ConnectResult> {
	const transport = entry.command
		? deps.createStdioTransport(entry, deps.processEnv)
		: entry.url
			? await deps.createHttpTransport(entry.url, entry.headers)
			: null;
	if (!transport) {
		throw mcpError("no_transport", `Server "${name}" has no command or url`);
	}
	const client = deps.createClient();
	await client.connect(transport);
	const [tools, resources] = await Promise.all([
		discoverTools(client), discoverResources(client),
	]);
	return {
		name, client, transport, status: "connected",
		lastUsedAt: Date.now(), inFlight: 0, tools, resources,
	};
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/server-connect.test.ts tests/server-connect-discovery.test.ts
```

Expected: PASS (9 tests total)

- [ ] **Step 6: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/server-connect.ts tests/server-connect.test.ts tests/server-connect-discovery.test.ts
git commit -m "mcp: server-connect (transport selection, client connect, tool/resource discovery)"
```

---

### Task 9: server-close.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/server-close.ts`
- Create: `01_EXTENSIONS/mcp/tests/server-close.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { closeServer, closeAll } from "../src/server-close.js";
import type { ServerConnection } from "../src/types-server.js";
import { ServerPool } from "../src/server-pool.js";

function mockConn(name: string): ServerConnection {
	return {
		name,
		client: {
			callTool: vi.fn(), listTools: vi.fn(), listResources: vi.fn(),
			readResource: vi.fn(), ping: vi.fn(),
			close: vi.fn().mockResolvedValue(undefined),
		},
		transport: { close: vi.fn().mockResolvedValue(undefined) },
		status: "connected",
		lastUsedAt: Date.now(),
		inFlight: 0,
	};
}

describe("closeServer", () => {
	it("closes client and transport", async () => {
		const pool = new ServerPool();
		const conn = mockConn("s1");
		pool.add("s1", conn);
		await closeServer("s1", pool);
		expect(conn.client.close).toHaveBeenCalled();
		expect(conn.transport.close).toHaveBeenCalled();
	});

	it("removes from pool before async cleanup", async () => {
		const pool = new ServerPool();
		const conn = mockConn("s1");
		let removedBeforeClose = false;
		conn.client.close = vi.fn().mockImplementation(async () => {
			removedBeforeClose = pool.get("s1") === undefined;
		});
		pool.add("s1", conn);
		await closeServer("s1", pool);
		expect(removedBeforeClose).toBe(true);
	});

	it("no-op for missing server", async () => {
		const pool = new ServerPool();
		await expect(closeServer("none", pool)).resolves.toBeUndefined();
	});

	it("still closes transport if client.close fails", async () => {
		const pool = new ServerPool();
		const conn = mockConn("s1");
		conn.client.close = vi.fn().mockRejectedValue(new Error("client fail"));
		pool.add("s1", conn);
		await closeServer("s1", pool);
		expect(conn.transport.close).toHaveBeenCalled();
	});
});

describe("closeAll", () => {
	it("closes all connections in pool", async () => {
		const pool = new ServerPool();
		const c1 = mockConn("s1");
		const c2 = mockConn("s2");
		pool.add("s1", c1);
		pool.add("s2", c2);
		await closeAll(pool);
		expect(c1.client.close).toHaveBeenCalled();
		expect(c2.client.close).toHaveBeenCalled();
		expect(pool.all().size).toBe(0);
	});

	it("handles empty pool", async () => {
		const pool = new ServerPool();
		await expect(closeAll(pool)).resolves.toBeUndefined();
	});

	it("continues closing others if one fails", async () => {
		const pool = new ServerPool();
		const c1 = mockConn("s1");
		c1.client.close = vi.fn().mockRejectedValue(new Error("fail"));
		const c2 = mockConn("s2");
		pool.add("s1", c1);
		pool.add("s2", c2);
		await closeAll(pool);
		expect(c2.client.close).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/server-close.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Write server-close.ts**

```typescript
import type { ServerPool } from "./server-pool.js";

export async function closeServer(name: string, pool: ServerPool): Promise<void> {
	const conn = pool.get(name);
	if (!conn) return;
	pool.remove(name);
	try {
		await conn.client.close();
	} catch {
		// continue to transport cleanup
	}
	try {
		await conn.transport.close();
	} catch {
		// swallow transport close error
	}
}

export async function closeAll(pool: ServerPool): Promise<void> {
	const names = [...pool.all().keys()];
	await Promise.allSettled(names.map((name) => closeServer(name, pool)));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/server-close.test.ts
```

Expected: PASS (7 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/server-close.ts tests/server-close.test.ts
git commit -m "mcp: server-close (graceful disconnect, remove-before-cleanup)"
```

---

### Task 10: Full suite + Go architecture tests

- [ ] **Step 1: Run full test suite with coverage**

```bash
cd 01_EXTENSIONS/mcp && npm test
```

Expected: All tests pass. Coverage thresholds met (100% on all non-index files).

- [ ] **Step 2: Verify all files are under 99 lines**

```bash
cd 01_EXTENSIONS/mcp && for f in src/transport-stdio.ts src/transport-http-streamable.ts src/transport-http-sse.ts src/transport-http.ts src/npx-resolver.ts src/pagination.ts src/server-pool.ts src/server-connect.ts src/server-close.ts; do echo "$f: $(wc -l < $f) lines"; done
```

Expected: All files <= 99 lines.

- [ ] **Step 3: Run Go architecture tests**

```bash
cd /Users/me/Desktop/pi && go test ./00_ARCHITECTURE/tests/ -v -count=1
```

Expected: ALL tests pass. Every `.ts` file under 99 lines, no `as any/unknown/never`, no `ExtensionAPI` outside index.ts.

- [ ] **Step 4: Commit**

```bash
cd 01_EXTENSIONS/mcp && git add -A && git commit -m "mcp: Plan 3 Transport + Server complete (9 modules)"
```
