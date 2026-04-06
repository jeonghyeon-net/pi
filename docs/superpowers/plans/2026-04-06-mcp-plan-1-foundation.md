# MCP Extension Plan 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build all leaf/utility modules that every other plan depends on: types, constants, errors, logger, utilities, state, search, schema formatting, and content transformation.

**Architecture:** 15 independent modules with no cross-dependencies (only types/constants). All use dependency injection. Every file <= 99 lines.

**Tech Stack:** TypeScript, Vitest, @sinclair/typebox

**Prerequisite:** Plan 0 (Scaffolding) completed.

---

### Task 1: types-config.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/types-config.ts`
- Create: `01_EXTENSIONS/mcp/tests/types-config.test.ts`

- [ ] **Step 1: Write types-config.ts**

```typescript
export type LifecycleMode = "lazy" | "eager" | "keep-alive";
export type ImportKind = "cursor" | "claude-code" | "claude-desktop" | "codex" | "windsurf" | "vscode";
export type ToolPrefix = "server" | "short" | "none";
export type ConsentMode = "never" | "once-per-server" | "always";

export interface ServerEntry {
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
	url?: string;
	headers?: Record<string, string>;
	auth?: "oauth" | "bearer";
	bearerToken?: string;
	bearerTokenEnv?: string;
	lifecycle?: LifecycleMode;
	idleTimeout?: number;
	directTools?: boolean | string[];
	exposeResources?: boolean;
	debug?: boolean;
}

export interface McpSettings {
	toolPrefix?: ToolPrefix;
	idleTimeout?: number;
	directTools?: boolean;
	consent?: ConsentMode;
}

export interface McpConfig {
	mcpServers: Record<string, ServerEntry>;
	imports?: ImportKind[];
	settings?: McpSettings;
}

export interface ServerProvenance {
	path: string;
	kind: "user" | "project" | "import";
	importKind?: ImportKind;
}
```

- [ ] **Step 2: Write types-config.test.ts**

Type-only modules need a minimal test verifying the types are exportable and structurally correct:

```typescript
import { describe, expect, it } from "vitest";
import type { McpConfig, ServerEntry, McpSettings, ServerProvenance, ImportKind, ConsentMode } from "../src/types-config.js";

describe("types-config", () => {
	it("McpConfig accepts valid structure", () => {
		const config: McpConfig = {
			mcpServers: { test: { command: "echo" } },
			imports: ["cursor"],
			settings: { toolPrefix: "server" },
		};
		expect(config.mcpServers.test.command).toBe("echo");
	});

	it("ServerEntry accepts all optional fields", () => {
		const entry: ServerEntry = {
			url: "http://localhost",
			auth: "bearer",
			bearerToken: "tok",
			lifecycle: "keep-alive",
			idleTimeout: 5,
			directTools: ["tool1"],
			exposeResources: true,
			debug: true,
		};
		expect(entry.url).toBe("http://localhost");
	});

	it("ServerProvenance tracks import source", () => {
		const p: ServerProvenance = { path: "/a", kind: "import", importKind: "vscode" };
		expect(p.kind).toBe("import");
	});
});
```

- [ ] **Step 3: Run tests**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/types-config.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 4: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/types-config.ts tests/types-config.test.ts
git commit -m "mcp: types-config (ServerEntry, McpConfig, McpSettings)"
```

---

### Task 2: types-server.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/types-server.ts`
- Create: `01_EXTENSIONS/mcp/tests/types-server.test.ts`

- [ ] **Step 1: Write types-server.ts**

```typescript
export type ConnectionStatus = "connected" | "closed" | "failed";

export interface McpClient {
	callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<CallToolResult>;
	listTools(params?: { cursor?: string }): Promise<ListToolsResult>;
	listResources(params?: { cursor?: string }): Promise<ListResourcesResult>;
	readResource(params: { uri: string }): Promise<ReadResourceResult>;
	ping(): Promise<void>;
	close(): Promise<void>;
}

export interface CallToolResult {
	content: McpContent[];
}

export interface ListToolsResult {
	tools: McpToolRaw[];
	nextCursor?: string;
}

export interface ListResourcesResult {
	resources: McpResourceRaw[];
	nextCursor?: string;
}

export interface ReadResourceResult {
	contents: Array<{ uri: string; text?: string; blob?: string; mimeType?: string }>;
}

export interface McpToolRaw {
	name: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
}

export interface McpResourceRaw {
	uri: string;
	name: string;
	description?: string;
	mimeType?: string;
}

export interface McpContent {
	type: string;
	text?: string;
	data?: string;
	mimeType?: string;
	resource?: { uri: string; text?: string; blob?: string };
	uri?: string;
	name?: string;
}

export interface McpTransport {
	close(): Promise<void>;
}

export interface ServerConnection {
	name: string;
	client: McpClient;
	transport: McpTransport;
	status: ConnectionStatus;
	lastUsedAt: number;
	inFlight: number;
}
```

- [ ] **Step 2: Write types-server.test.ts**

```typescript
import { describe, expect, it } from "vitest";
import type { ServerConnection, McpClient, McpContent, ConnectionStatus } from "../src/types-server.js";

describe("types-server", () => {
	it("ServerConnection has required fields", () => {
		const conn: ServerConnection = {
			name: "test",
			client: {} as McpClient,
			transport: { close: async () => {} },
			status: "connected",
			lastUsedAt: Date.now(),
			inFlight: 0,
		};
		expect(conn.status).toBe("connected");
	});

	it("McpContent handles text type", () => {
		const c: McpContent = { type: "text", text: "hello" };
		expect(c.type).toBe("text");
	});

	it("ConnectionStatus union", () => {
		const statuses: ConnectionStatus[] = ["connected", "closed", "failed"];
		expect(statuses).toHaveLength(3);
	});
});
```

Note: `{} as McpClient` would violate the `as` rule. Use a mock object instead:

```typescript
import { describe, expect, it, vi } from "vitest";
import type { ServerConnection, McpClient, McpContent, ConnectionStatus } from "../src/types-server.js";

describe("types-server", () => {
	const mockClient: McpClient = {
		callTool: vi.fn(), listTools: vi.fn(), listResources: vi.fn(),
		readResource: vi.fn(), ping: vi.fn(), close: vi.fn(),
	};

	it("ServerConnection has required fields", () => {
		const conn: ServerConnection = {
			name: "test", client: mockClient,
			transport: { close: async () => {} },
			status: "connected", lastUsedAt: Date.now(), inFlight: 0,
		};
		expect(conn.status).toBe("connected");
	});

	it("McpContent handles text type", () => {
		const c: McpContent = { type: "text", text: "hello" };
		expect(c.type).toBe("text");
	});

	it("ConnectionStatus union", () => {
		const statuses: ConnectionStatus[] = ["connected", "closed", "failed"];
		expect(statuses).toHaveLength(3);
	});
});
```

- [ ] **Step 3: Run tests, build, commit**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/types-server.test.ts && npm run build
git add src/types-server.ts tests/types-server.test.ts && git commit -m "mcp: types-server (McpClient, ServerConnection)"
```

---

### Task 3: types-tool.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/types-tool.ts`
- Create: `01_EXTENSIONS/mcp/tests/types-tool.test.ts`

- [ ] **Step 1: Write types-tool.ts**

```typescript
export interface ToolMetadata {
	name: string;
	originalName: string;
	serverName: string;
	description: string;
	inputSchema?: Record<string, unknown>;
	resourceUri?: string;
}

export interface DirectToolSpec {
	serverName: string;
	originalName: string;
	prefixedName: string;
	description: string;
	inputSchema?: Record<string, unknown>;
	resourceUri?: string;
}

export interface ToolDef {
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters: unknown;
	execute: ToolExecuteFn;
}

export type ToolExecuteFn = (
	toolCallId: string,
	params: Record<string, unknown>,
	signal: unknown,
	onUpdate: unknown,
	ctx: unknown,
) => Promise<ToolResult>;

export interface ToolResult {
	content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
	details?: Record<string, unknown>;
}
```

- [ ] **Step 2: Write types-tool.test.ts**

```typescript
import { describe, expect, it, vi } from "vitest";
import type { ToolMetadata, DirectToolSpec, ToolDef, ToolResult } from "../src/types-tool.js";

describe("types-tool", () => {
	it("ToolMetadata has required fields", () => {
		const m: ToolMetadata = {
			name: "server_tool", originalName: "tool",
			serverName: "server", description: "desc",
		};
		expect(m.name).toBe("server_tool");
	});

	it("DirectToolSpec extends ToolMetadata concept", () => {
		const d: DirectToolSpec = {
			serverName: "s", originalName: "t",
			prefixedName: "s_t", description: "d",
		};
		expect(d.prefixedName).toBe("s_t");
	});

	it("ToolDef with execute function", () => {
		const tool: ToolDef = {
			name: "test", label: "Test", description: "d",
			parameters: {}, execute: vi.fn().mockResolvedValue({ content: [] }),
		};
		expect(tool.name).toBe("test");
	});
});
```

- [ ] **Step 3: Run tests, build, commit**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/types-tool.test.ts && npm run build
git add src/types-tool.ts tests/types-tool.test.ts && git commit -m "mcp: types-tool (ToolMetadata, DirectToolSpec, ToolDef)"
```

---

### Task 4: types-proxy.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/types-proxy.ts`
- Create: `01_EXTENSIONS/mcp/tests/types-proxy.test.ts`

- [ ] **Step 1: Write types-proxy.ts**

```typescript
export type ProxyAction = "call" | "list" | "describe" | "search" | "status" | "connect";

export interface ProxyParams {
	action: ProxyAction;
	tool?: string;
	args?: Record<string, unknown>;
	server?: string;
	query?: string;
}

export interface ProxyToolResult {
	content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
	details?: Record<string, unknown>;
}

export interface ProxyErrorResult {
	code: string;
	message: string;
	hint?: string;
	server?: string;
	tool?: string;
}
```

- [ ] **Step 2: Write types-proxy.test.ts**

```typescript
import { describe, expect, it } from "vitest";
import type { ProxyParams, ProxyAction, ProxyToolResult, ProxyErrorResult } from "../src/types-proxy.js";

describe("types-proxy", () => {
	it("ProxyParams with call action", () => {
		const p: ProxyParams = { action: "call", tool: "echo", args: { msg: "hi" }, server: "s1" };
		expect(p.action).toBe("call");
	});

	it("all ProxyAction values", () => {
		const actions: ProxyAction[] = ["call", "list", "describe", "search", "status", "connect"];
		expect(actions).toHaveLength(6);
	});

	it("ProxyErrorResult with hint", () => {
		const e: ProxyErrorResult = { code: "not_found", message: "Tool not found", hint: "Run /mcp tools" };
		expect(e.code).toBe("not_found");
	});
});
```

- [ ] **Step 3: Run tests, build, commit**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/types-proxy.test.ts && npm run build
git add src/types-proxy.ts tests/types-proxy.test.ts && git commit -m "mcp: types-proxy (ProxyParams, ProxyAction)"
```

---

### Task 5: constants.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/constants.ts`
- Create: `01_EXTENSIONS/mcp/tests/constants.test.ts`

- [ ] **Step 1: Write constants.ts**

```typescript
export const METADATA_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const NPX_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
export const KEEPALIVE_INTERVAL_MS = 30 * 1000;
export const MAX_CONCURRENCY = 10;

export const BUILTIN_TOOL_NAMES = new Set([
	"read", "bash", "edit", "write", "grep", "find", "ls", "mcp",
]);

export const MCP_CONFIG_FLAG = {
	description: "Path to MCP config file",
	type: "string" as const,
};

export const DEFAULT_USER_CONFIG = "~/.pi/agent/mcp.json";
export const DEFAULT_PROJECT_CONFIG = ".pi/mcp.json";
export const CACHE_FILE_PATH = "~/.pi/agent/mcp-cache.json";
export const NPX_CACHE_FILE_PATH = "~/.pi/agent/mcp-npx-cache.json";
export const OAUTH_TOKEN_DIR = "~/.pi/agent/mcp-oauth";

export const STATUS_KEY = "mcp";
export const HASH_EXCLUDE_FIELDS = new Set(["lifecycle", "idleTimeout", "debug"]);
export const SERVER_NAME_SANITIZE_RE = /[\/\\.\x00-\x1f]/g;
```

- [ ] **Step 2: Write constants.test.ts**

```typescript
import { describe, expect, it } from "vitest";
import {
	METADATA_CACHE_TTL_MS, NPX_CACHE_TTL_MS, DEFAULT_IDLE_TIMEOUT_MS,
	BUILTIN_TOOL_NAMES, MCP_CONFIG_FLAG, HASH_EXCLUDE_FIELDS,
	SERVER_NAME_SANITIZE_RE, KEEPALIVE_INTERVAL_MS, MAX_CONCURRENCY,
} from "../src/constants.js";

describe("constants", () => {
	it("METADATA_CACHE_TTL_MS is 7 days", () => {
		expect(METADATA_CACHE_TTL_MS).toBe(604_800_000);
	});
	it("NPX_CACHE_TTL_MS is 24 hours", () => {
		expect(NPX_CACHE_TTL_MS).toBe(86_400_000);
	});
	it("DEFAULT_IDLE_TIMEOUT_MS is 10 minutes", () => {
		expect(DEFAULT_IDLE_TIMEOUT_MS).toBe(600_000);
	});
	it("KEEPALIVE_INTERVAL_MS is 30 seconds", () => {
		expect(KEEPALIVE_INTERVAL_MS).toBe(30_000);
	});
	it("BUILTIN_TOOL_NAMES contains 8 names", () => {
		expect(BUILTIN_TOOL_NAMES.size).toBe(8);
		expect(BUILTIN_TOOL_NAMES.has("mcp")).toBe(true);
	});
	it("MCP_CONFIG_FLAG has correct shape", () => {
		expect(MCP_CONFIG_FLAG.type).toBe("string");
	});
	it("HASH_EXCLUDE_FIELDS excludes lifecycle fields", () => {
		expect(HASH_EXCLUDE_FIELDS.has("lifecycle")).toBe(true);
		expect(HASH_EXCLUDE_FIELDS.has("command")).toBe(false);
	});
	it("SERVER_NAME_SANITIZE_RE matches path traversal", () => {
		expect("../bad".replace(SERVER_NAME_SANITIZE_RE, "")).toBe("bad");
	});
});
```

- [ ] **Step 3: Run tests, build, commit**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/constants.test.ts && npm run build
git add src/constants.ts tests/constants.test.ts && git commit -m "mcp: constants (TTLs, builtin names, paths)"
```

---

### Task 6: errors.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/errors.ts`
- Create: `01_EXTENSIONS/mcp/tests/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { McpError, mcpError } from "../src/errors.js";

describe("McpError", () => {
	it("creates error with code and message", () => {
		const err = new McpError("not_found", "Tool not found");
		expect(err.code).toBe("not_found");
		expect(err.message).toBe("Tool not found");
		expect(err).toBeInstanceOf(Error);
	});

	it("includes optional hint and context", () => {
		const err = new McpError("timeout", "Connection timed out", {
			hint: "Check server", server: "s1",
		});
		expect(err.hint).toBe("Check server");
		expect(err.context.server).toBe("s1");
	});

	it("toJSON serializes all fields", () => {
		const err = new McpError("fail", "msg", { hint: "h", tool: "t" });
		const json = err.toJSON();
		expect(json.code).toBe("fail");
		expect(json.hint).toBe("h");
		expect(json.context.tool).toBe("t");
	});

	it("mcpError factory creates McpError", () => {
		const err = mcpError("code", "msg");
		expect(err).toBeInstanceOf(McpError);
	});

	it("mcpError wraps unknown error", () => {
		const err = mcpError("wrap", "wrapped", { cause: new Error("orig") });
		expect(err.message).toBe("wrapped");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/errors.test.ts
```

Expected: FAIL (McpError not found)

- [ ] **Step 3: Write errors.ts**

```typescript
export interface McpErrorOpts {
	hint?: string;
	server?: string;
	tool?: string;
	uri?: string;
	cause?: Error;
}

export class McpError extends Error {
	readonly code: string;
	readonly hint: string | undefined;
	readonly context: Record<string, string | undefined>;

	constructor(code: string, message: string, opts?: McpErrorOpts) {
		super(message, opts?.cause ? { cause: opts.cause } : undefined);
		this.name = "McpError";
		this.code = code;
		this.hint = opts?.hint;
		this.context = {
			server: opts?.server,
			tool: opts?.tool,
			uri: opts?.uri,
		};
	}

	toJSON() {
		return {
			code: this.code,
			message: this.message,
			hint: this.hint,
			context: this.context,
		};
	}
}

export function mcpError(code: string, message: string, opts?: McpErrorOpts): McpError {
	return new McpError(code, message, opts);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/errors.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/errors.ts tests/errors.test.ts && git commit -m "mcp: errors (McpError class, factory)"
```

---

### Task 7: truncate.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/truncate.ts`
- Create: `01_EXTENSIONS/mcp/tests/truncate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { truncateAtWord } from "../src/truncate.js";

describe("truncateAtWord", () => {
	it("returns text unchanged if within limit", () => {
		expect(truncateAtWord("short", 10)).toBe("short");
	});
	it("truncates at word boundary", () => {
		expect(truncateAtWord("hello world foo", 12)).toBe("hello world...");
	});
	it("truncates mid-word if no good break point", () => {
		expect(truncateAtWord("abcdefghij", 5)).toBe("abcde...");
	});
	it("handles empty string", () => {
		expect(truncateAtWord("", 10)).toBe("");
	});
	it("uses word boundary if past 60% of target", () => {
		expect(truncateAtWord("ab cdefghij", 8)).toBe("ab...");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/truncate.test.ts
```

- [ ] **Step 3: Write truncate.ts**

```typescript
export function truncateAtWord(text: string, target: number): string {
	if (text.length <= target) return text;
	const lastSpace = text.lastIndexOf(" ", target);
	if (lastSpace > target * 0.6) return `${text.slice(0, lastSpace)}...`;
	return `${text.slice(0, target)}...`;
}
```

- [ ] **Step 4: Run test to verify it passes, build, commit**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/truncate.test.ts && npm run build
git add src/truncate.ts tests/truncate.test.ts && git commit -m "mcp: truncateAtWord utility"
```

---

### Task 8: parallel.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/parallel.ts`
- Create: `01_EXTENSIONS/mcp/tests/parallel.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { parallelLimit } from "../src/parallel.js";

describe("parallelLimit", () => {
	it("executes all items", async () => {
		const results = await parallelLimit([1, 2, 3], async (n) => n * 2, 2);
		expect(results).toEqual([2, 4, 6]);
	});
	it("respects concurrency limit", async () => {
		let concurrent = 0;
		let maxConcurrent = 0;
		await parallelLimit([1, 2, 3, 4], async () => {
			concurrent++;
			maxConcurrent = Math.max(maxConcurrent, concurrent);
			await new Promise((r) => setTimeout(r, 10));
			concurrent--;
		}, 2);
		expect(maxConcurrent).toBeLessThanOrEqual(2);
	});
	it("handles empty array", async () => {
		const results = await parallelLimit([], async (n: number) => n, 5);
		expect(results).toEqual([]);
	});
	it("propagates errors", async () => {
		await expect(
			parallelLimit([1], async () => { throw new Error("boom"); }, 1),
		).rejects.toThrow("boom");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/parallel.test.ts
```

- [ ] **Step 3: Write parallel.ts**

```typescript
export async function parallelLimit<T, R>(
	items: T[],
	fn: (item: T) => Promise<R>,
	limit: number,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let nextIndex = 0;

	async function worker(): Promise<void> {
		while (nextIndex < items.length) {
			const i = nextIndex++;
			results[i] = await fn(items[i]);
		}
	}

	const workers: Promise<void>[] = [];
	for (let w = 0; w < Math.min(limit, items.length); w++) {
		workers.push(worker());
	}
	await Promise.all(workers);
	return results;
}
```

- [ ] **Step 4: Run test to verify it passes, build, commit**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/parallel.test.ts && npm run build
git add src/parallel.ts tests/parallel.test.ts && git commit -m "mcp: parallelLimit concurrency utility"
```

---

### Task 9: env.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/env.ts`
- Create: `01_EXTENSIONS/mcp/tests/env.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { interpolateEnv } from "../src/env.js";

describe("interpolateEnv", () => {
	const vars: Record<string, string> = { HOME: "/home/user", TOKEN: "abc123" };
	it("replaces ${VAR} with value", () => {
		expect(interpolateEnv("dir: ${HOME}/data", vars)).toBe("dir: /home/user/data");
	});
	it("leaves missing vars as-is", () => {
		expect(interpolateEnv("${MISSING}", vars)).toBe("${MISSING}");
	});
	it("handles multiple vars", () => {
		expect(interpolateEnv("${HOME}:${TOKEN}", vars)).toBe("/home/user:abc123");
	});
	it("no-op on string without vars", () => {
		expect(interpolateEnv("plain", vars)).toBe("plain");
	});
	it("single-pass only (no recursive expansion)", () => {
		const v = { A: "${B}", B: "val" };
		expect(interpolateEnv("${A}", v)).toBe("${B}");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write env.ts**

```typescript
const ENV_RE = /\$\{([^}]+)\}/g;

export function interpolateEnv(text: string, vars: Record<string, string | undefined>): string {
	return text.replace(ENV_RE, (match, name: string) => {
		const val = vars[name];
		return val !== undefined ? val : match;
	});
}
```

- [ ] **Step 4: Run test to verify it passes, build, commit**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/env.test.ts && npm run build
git add src/env.ts tests/env.test.ts && git commit -m "mcp: env interpolation (single-pass \${VAR})"
```

---

### Task 10: logger.ts + logger-format.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/logger-format.ts`
- Create: `01_EXTENSIONS/mcp/src/logger.ts`
- Create: `01_EXTENSIONS/mcp/tests/logger-format.test.ts`
- Create: `01_EXTENSIONS/mcp/tests/logger.test.ts`

- [ ] **Step 1: Write logger-format.ts**

```typescript
export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
	return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

export function formatEntry(
	level: LogLevel,
	message: string,
	context?: Record<string, string | undefined>,
): string {
	const prefix = `[mcp:${level}]`;
	const ctxStr = context
		? Object.entries(context)
				.filter(([, v]) => v !== undefined)
				.map(([k, v]) => `${k}=${v}`)
				.join(" ")
		: "";
	return ctxStr ? `${prefix} ${message} (${ctxStr})` : `${prefix} ${message}`;
}
```

- [ ] **Step 2: Write logger-format.test.ts**

```typescript
import { describe, expect, it } from "vitest";
import { shouldLog, formatEntry } from "../src/logger-format.js";

describe("shouldLog", () => {
	it("debug logs at debug level", () => expect(shouldLog("debug", "debug")).toBe(true));
	it("debug skipped at info level", () => expect(shouldLog("debug", "info")).toBe(false));
	it("error logs at any level", () => expect(shouldLog("error", "debug")).toBe(true));
	it("warn skipped at error level", () => expect(shouldLog("warn", "error")).toBe(false));
});

describe("formatEntry", () => {
	it("formats without context", () => {
		expect(formatEntry("info", "connected")).toBe("[mcp:info] connected");
	});
	it("formats with context", () => {
		const result = formatEntry("warn", "timeout", { server: "s1" });
		expect(result).toBe("[mcp:warn] timeout (server=s1)");
	});
	it("filters undefined context values", () => {
		const result = formatEntry("debug", "test", { a: "1", b: undefined });
		expect(result).toBe("[mcp:debug] test (a=1)");
	});
});
```

- [ ] **Step 3: Write logger.ts**

```typescript
import type { LogLevel } from "./logger-format.js";
import { shouldLog, formatEntry } from "./logger-format.js";

export type { LogLevel };

export interface Logger {
	debug(msg: string): void;
	info(msg: string): void;
	warn(msg: string): void;
	error(msg: string): void;
	child(context: Record<string, string>): Logger;
}

export function createLogger(minLevel: LogLevel, context?: Record<string, string>): Logger {
	const log = (level: LogLevel, msg: string) => {
		if (!shouldLog(level, minLevel)) return;
		const line = formatEntry(level, msg, context);
		if (level === "error") console.error(line);
		else if (level === "warn") console.warn(line);
		else console.log(line);
	};
	return {
		debug: (msg) => log("debug", msg),
		info: (msg) => log("info", msg),
		warn: (msg) => log("warn", msg),
		error: (msg) => log("error", msg),
		child: (ctx) => createLogger(minLevel, { ...context, ...ctx }),
	};
}
```

- [ ] **Step 4: Write logger.test.ts**

```typescript
import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../src/logger.js";

describe("createLogger", () => {
	it("logs info at info level", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		createLogger("info").info("hello");
		expect(spy).toHaveBeenCalledWith("[mcp:info] hello");
		spy.mockRestore();
	});
	it("skips debug at info level", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		createLogger("info").debug("skip");
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});
	it("error uses console.error", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		createLogger("error").error("fail");
		expect(spy).toHaveBeenCalledWith("[mcp:error] fail");
		spy.mockRestore();
	});
	it("warn uses console.warn", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		createLogger("warn").warn("caution");
		expect(spy).toHaveBeenCalledWith("[mcp:warn] caution");
		spy.mockRestore();
	});
	it("child logger inherits and extends context", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const child = createLogger("debug", { server: "s1" }).child({ tool: "t1" });
		child.info("test");
		expect(spy).toHaveBeenCalledWith("[mcp:info] test (server=s1 tool=t1)");
		spy.mockRestore();
	});
});
```

- [ ] **Step 5: Run tests, build, commit**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/logger-format.test.ts tests/logger.test.ts && npm run build
git add src/logger-format.ts src/logger.ts tests/logger-format.test.ts tests/logger.test.ts
git commit -m "mcp: logger (4 levels, child logger, formatting)"
```

---

### Task 11: search.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/search.ts`
- Create: `01_EXTENSIONS/mcp/tests/search.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { matchTool } from "../src/search.js";

describe("matchTool", () => {
	it("substring match (case-insensitive)", () => {
		expect(matchTool("web_search", "search")).toBe(true);
	});
	it("normalized: dash and underscore equivalent", () => {
		expect(matchTool("web-search", "web_search")).toBe(true);
	});
	it("no match", () => {
		expect(matchTool("file_read", "write")).toBe(false);
	});
	it("regex match with /pattern/", () => {
		expect(matchTool("web_search", "/^web/")).toBe(true);
	});
	it("regex no match", () => {
		expect(matchTool("file_read", "/^web/")).toBe(false);
	});
	it("invalid regex falls back to substring", () => {
		expect(matchTool("abc[def", "/[invalid/")).toBe(false);
	});
	it("empty query matches nothing", () => {
		expect(matchTool("anything", "")).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write search.ts**

```typescript
function normalize(s: string): string {
	return s.toLowerCase().replace(/[-_]/g, "");
}

function tryRegex(pattern: string): RegExp | null {
	try {
		return new RegExp(pattern, "i");
	} catch {
		return null;
	}
}

export function matchTool(toolName: string, query: string): boolean {
	if (!query) return false;
	if (query.startsWith("/") && query.endsWith("/") && query.length > 2) {
		const re = tryRegex(query.slice(1, -1));
		if (re) return re.test(toolName);
		return false;
	}
	return normalize(toolName).includes(normalize(query));
}
```

- [ ] **Step 4: Run test to verify it passes, build, commit**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/search.test.ts && npm run build
git add src/search.ts tests/search.test.ts && git commit -m "mcp: search (substring, normalized, regex)"
```

---

### Task 12: schema-format.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/schema-format.ts`
- Create: `01_EXTENSIONS/mcp/tests/schema-format.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { formatSchema } from "../src/schema-format.js";

describe("formatSchema", () => {
	it("formats simple object schema", () => {
		const schema = {
			type: "object",
			properties: { name: { type: "string", description: "The name" } },
			required: ["name"],
		};
		const result = formatSchema(schema);
		expect(result).toContain("name");
		expect(result).toContain("string");
		expect(result).toContain("required");
	});
	it("handles schema with no properties", () => {
		expect(formatSchema({ type: "object" })).toBe("(no parameters)");
	});
	it("handles null/undefined schema", () => {
		expect(formatSchema(undefined)).toBe("(no parameters)");
	});
	it("shows optional fields", () => {
		const schema = {
			type: "object",
			properties: { age: { type: "number" } },
		};
		const result = formatSchema(schema);
		expect(result).toContain("optional");
	});
	it("shows enum values", () => {
		const schema = {
			type: "object",
			properties: { mode: { type: "string", enum: ["fast", "slow"] } },
		};
		expect(formatSchema(schema)).toContain("fast");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write schema-format.ts**

```typescript
import { truncateAtWord } from "./truncate.js";

interface SchemaObj {
	type?: string;
	properties?: Record<string, PropSchema>;
	required?: string[];
}

interface PropSchema {
	type?: string;
	description?: string;
	enum?: string[];
	default?: unknown;
}

export function formatSchema(schema: unknown): string {
	if (!schema) return "(no parameters)";
	const obj = schema as SchemaObj;
	if (!obj.properties || Object.keys(obj.properties).length === 0) return "(no parameters)";
	const required = new Set(obj.required ?? []);
	const lines: string[] = [];
	for (const [name, prop] of Object.entries(obj.properties)) {
		lines.push(formatProp(name, prop, required.has(name)));
	}
	return lines.join("\n");
}

function formatProp(name: string, prop: PropSchema, isRequired: boolean): string {
	const parts = [`  ${name}: ${prop.type ?? "unknown"}`];
	if (prop.enum) parts.push(`(${prop.enum.join(" | ")})`);
	parts.push(isRequired ? "[required]" : "[optional]");
	if (prop.description) parts.push(`- ${truncateAtWord(prop.description, 60)}`);
	return parts.join(" ");
}
```

Note: `schema as SchemaObj` uses `as` but NOT `as any/unknown/never`. The Go test regex `\bas\s+(any|unknown|never)\b` only matches those three keywords. `as SchemaObj` is allowed.

- [ ] **Step 4: Run test to verify it passes, build, commit**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/schema-format.test.ts && npm run build
git add src/schema-format.ts tests/schema-format.test.ts && git commit -m "mcp: schema-format (tool params to readable text)"
```

---

### Task 13: content-transform.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/content-transform.ts`
- Create: `01_EXTENSIONS/mcp/tests/content-transform.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { transformContent } from "../src/content-transform.js";

describe("transformContent", () => {
	it("transforms text content", () => {
		const result = transformContent({ type: "text", text: "hello" });
		expect(result).toEqual({ type: "text", text: "hello" });
	});
	it("transforms image content", () => {
		const result = transformContent({ type: "image", data: "base64data", mimeType: "image/png" });
		expect(result).toEqual({ type: "image", data: "base64data", mimeType: "image/png" });
	});
	it("transforms resource content", () => {
		const result = transformContent({
			type: "resource", resource: { uri: "file:///a", text: "content" },
		});
		expect(result.type).toBe("text");
		expect(result.text).toContain("file:///a");
	});
	it("transforms resource_link", () => {
		const result = transformContent({ type: "resource_link", uri: "file:///b", name: "doc" });
		expect(result.type).toBe("text");
		expect(result.text).toContain("doc");
	});
	it("transforms audio as description", () => {
		const result = transformContent({ type: "audio", data: "audiodata" });
		expect(result.type).toBe("text");
		expect(result.text).toContain("audio");
	});
	it("transforms unknown as JSON", () => {
		const result = transformContent({ type: "custom", text: "x" });
		expect(result.type).toBe("text");
		expect(result.text).toContain("custom");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write content-transform.ts**

```typescript
import type { McpContent } from "./types-server.js";

interface ContentBlock {
	type: string;
	text?: string;
	data?: string;
	mimeType?: string;
}

export function transformContent(content: McpContent): ContentBlock {
	switch (content.type) {
		case "text":
			return { type: "text", text: content.text ?? "" };
		case "image":
			return { type: "image", data: content.data, mimeType: content.mimeType };
		case "resource":
			return {
				type: "text",
				text: `[Resource: ${content.resource?.uri}]\n${content.resource?.text ?? content.resource?.blob ?? ""}`,
			};
		case "resource_link":
			return { type: "text", text: `[Resource Link: ${content.name ?? ""} (${content.uri ?? ""})]` };
		case "audio":
			return { type: "text", text: "[Audio content not supported in text mode]" };
		default:
			return { type: "text", text: JSON.stringify(content) };
	}
}
```

- [ ] **Step 4: Run test to verify it passes, build, commit**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/content-transform.test.ts && npm run build
git add src/content-transform.ts tests/content-transform.test.ts
git commit -m "mcp: content-transform (MCP content to Pi blocks)"
```

---

### Task 14: failure-tracker.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/failure-tracker.ts`
- Create: `01_EXTENSIONS/mcp/tests/failure-tracker.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import { recordFailure, getFailure, clearFailure, clearAllFailures } from "../src/failure-tracker.js";

describe("failure-tracker", () => {
	beforeEach(() => clearAllFailures());

	it("records a failure", () => {
		recordFailure("server1");
		const f = getFailure("server1");
		expect(f).toBeDefined();
		expect(f?.count).toBe(1);
	});
	it("increments count on repeated failure", () => {
		recordFailure("s1");
		recordFailure("s1");
		expect(getFailure("s1")?.count).toBe(2);
	});
	it("returns undefined for unknown server", () => {
		expect(getFailure("none")).toBeUndefined();
	});
	it("clears a specific failure", () => {
		recordFailure("s1");
		clearFailure("s1");
		expect(getFailure("s1")).toBeUndefined();
	});
	it("clears all failures", () => {
		recordFailure("s1");
		recordFailure("s2");
		clearAllFailures();
		expect(getFailure("s1")).toBeUndefined();
		expect(getFailure("s2")).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write failure-tracker.ts**

```typescript
export interface FailureRecord {
	at: number;
	count: number;
}

const failures = new Map<string, FailureRecord>();

export function recordFailure(server: string): void {
	const existing = failures.get(server);
	if (existing) {
		existing.at = Date.now();
		existing.count++;
	} else {
		failures.set(server, { at: Date.now(), count: 1 });
	}
}

export function getFailure(server: string): FailureRecord | undefined {
	return failures.get(server);
}

export function clearFailure(server: string): void {
	failures.delete(server);
}

export function clearAllFailures(): void {
	failures.clear();
}
```

- [ ] **Step 4: Run test to verify it passes, build, commit**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/failure-tracker.test.ts && npm run build
git add src/failure-tracker.ts tests/failure-tracker.test.ts
git commit -m "mcp: failure-tracker (record/query/clear server failures)"
```

---

### Task 15: state.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/state.ts`
- Create: `01_EXTENSIONS/mcp/tests/state.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, beforeEach, vi } from "vitest";
import {
	getGeneration, incrementGeneration, resetState,
	getConfig, setConfig, getConnections, setConnection,
	removeConnection, getMetadata, setMetadata,
	updateFooterStatus,
} from "../src/state.js";

describe("state", () => {
	beforeEach(() => resetState());

	it("generation starts at 0", () => {
		expect(getGeneration()).toBe(0);
	});
	it("incrementGeneration returns new value", () => {
		expect(incrementGeneration()).toBe(1);
		expect(incrementGeneration()).toBe(2);
	});
	it("config is null initially", () => {
		expect(getConfig()).toBeNull();
	});
	it("setConfig / getConfig round-trips", () => {
		const cfg = { mcpServers: {} };
		setConfig(cfg);
		expect(getConfig()).toBe(cfg);
	});
	it("connections map is empty initially", () => {
		expect(getConnections().size).toBe(0);
	});
	it("setConnection / removeConnection", () => {
		const conn = { name: "s1" };
		setConnection("s1", conn);
		expect(getConnections().get("s1")).toBe(conn);
		removeConnection("s1");
		expect(getConnections().has("s1")).toBe(false);
	});
	it("metadata map", () => {
		setMetadata("s1", [{ name: "t1", originalName: "t1", serverName: "s1", description: "" }]);
		expect(getMetadata("s1")).toHaveLength(1);
	});
	it("resetState clears everything", () => {
		incrementGeneration();
		setConfig({ mcpServers: {} });
		setConnection("s1", { name: "s1" });
		resetState();
		expect(getGeneration()).toBe(0);
		expect(getConfig()).toBeNull();
		expect(getConnections().size).toBe(0);
	});
	it("updateFooterStatus calls setStatus", () => {
		const ui = { setStatus: vi.fn(), theme: { fg: vi.fn((_: string, t: string) => t) } };
		setConnection("s1", { name: "s1" });
		updateFooterStatus(ui, 2);
		expect(ui.setStatus).toHaveBeenCalledWith("mcp", expect.stringContaining("1/2"));
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write state.ts**

```typescript
import type { McpConfig } from "./types-config.js";
import type { ToolMetadata } from "./types-tool.js";
import { STATUS_KEY } from "./constants.js";

let generation = 0;
let config: McpConfig | null = null;
const connections = new Map<string, unknown>();
const metadata = new Map<string, ToolMetadata[]>();

export function getGeneration(): number { return generation; }
export function incrementGeneration(): number { return ++generation; }

export function getConfig(): McpConfig | null { return config; }
export function setConfig(c: McpConfig): void { config = c; }

export function getConnections(): Map<string, unknown> { return connections; }
export function setConnection(name: string, conn: unknown): void { connections.set(name, conn); }
export function removeConnection(name: string): void { connections.delete(name); }

export function getMetadata(server: string): ToolMetadata[] | undefined { return metadata.get(server); }
export function setMetadata(server: string, tools: ToolMetadata[]): void { metadata.set(server, tools); }
export function getAllMetadata(): Map<string, ToolMetadata[]> { return metadata; }

interface FooterUi {
	setStatus(key: string, text: string | undefined): void;
	theme: { fg(color: string, text: string): string };
}

export function updateFooterStatus(ui: FooterUi, totalServers: number): void {
	const connected = connections.size;
	const text = ui.theme.fg("accent", `MCP: ${connected}/${totalServers} servers`);
	ui.setStatus(STATUS_KEY, text);
}

export function resetState(): void {
	generation = 0;
	config = null;
	connections.clear();
	metadata.clear();
}
```

- [ ] **Step 4: Run test to verify it passes, build, commit**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/state.test.ts && npm run build
git add src/state.ts tests/state.test.ts && git commit -m "mcp: state (central store with generation tracking)"
```

---

### Task 16: Remove placeholder test and verify

- [ ] **Step 1: Delete the scaffold placeholder test**

```bash
rm 01_EXTENSIONS/mcp/tests/stub.test.ts
```

- [ ] **Step 2: Run full test suite**

```bash
cd 01_EXTENSIONS/mcp && npm test
```

Expected: All tests pass. Coverage thresholds met (100% on all non-index files).

- [ ] **Step 3: Run Go architecture tests**

```bash
cd /Users/me/Desktop/pi && go test ./00_ARCHITECTURE/tests/ -v -count=1
```

Expected: ALL tests pass. Every `.ts` file is under 99 lines, no `as any/unknown/never`, no `ExtensionAPI` outside index.ts.

- [ ] **Step 4: Commit**

```bash
cd 01_EXTENSIONS/mcp && git add -A && git commit -m "mcp: Plan 1 Foundation complete (15 modules)"
```
