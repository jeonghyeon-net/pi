# MCP Extension Plan 8: Command

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/mcp` command system: subcommand routing, status/tools display, server connect/disconnect/reconnect, OAuth auth instructions, and tool search output.

**Architecture:** 5 modules with narrow interface pattern (CmdPi, CommandContext). All use dependency injection. Every file <= 99 lines. Single `/mcp` command with argument-based subcommand routing.

**Tech Stack:** TypeScript, Vitest

**Dependencies:**
- Plan 1: `state.ts` (getConnections, getConfig, getAllMetadata, getMetadata), `types-config.ts` (McpConfig, ServerEntry), `types-server.ts` (ServerConnection, ConnectionStatus), `types-tool.ts` (ToolMetadata), `errors.ts` (McpError, mcpError), `constants.ts` (OAUTH_TOKEN_DIR), `search.ts` (matchTool), `schema-format.ts` (formatSchema)
- Plan 3: `server-connect.ts` (connectServer), `server-close.ts` (closeServer, closeAllServers)
- Plan 4: `auth.ts` (getTokenInfo)
- Plan 6: `tool-metadata.ts` (buildMetadata)
- Plan 1: `failure-tracker.ts` (getFailure, FailureRecord)

---

### Task 1: cmd-info.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/cmd-info.ts`
- Create: `01_EXTENSIONS/mcp/tests/cmd-info.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { formatStatus, formatTools } from "../src/cmd-info.js";
import type { ToolMetadata } from "../src/types-tool.js";

function makeConn(name: string, status: "connected" | "closed" | "failed") {
	return { name, status, client: { callTool: vi.fn(), listTools: vi.fn(), listResources: vi.fn(), readResource: vi.fn(), ping: vi.fn(), close: vi.fn() }, transport: { close: vi.fn() }, lastUsedAt: Date.now(), inFlight: 0 };
}

describe("formatStatus", () => {
	it("shows connected server with checkmark", () => {
		const conns = new Map([["s1", makeConn("s1", "connected")]]);
		const cfg = { mcpServers: { s1: { command: "echo" } } };
		const result = formatStatus(conns, cfg, new Map(), () => undefined);
		expect(result).toContain("s1");
		expect(result).toContain("\u2713");
	});
	it("shows failed server with cross and time", () => {
		const conns = new Map([["s1", makeConn("s1", "failed")]]);
		const cfg = { mcpServers: { s1: { command: "echo" } } };
		const fail = { at: Date.now() - 60000, count: 2 };
		const result = formatStatus(conns, cfg, new Map(), (n) => n === "s1" ? fail : undefined);
		expect(result).toContain("\u2717");
		expect(result).toContain("1m ago");
	});
	it("shows unconfigured server with circle", () => {
		const conns = new Map<string, unknown>();
		const cfg = { mcpServers: { s1: { command: "echo" } } };
		const result = formatStatus(conns, cfg, new Map(), () => undefined);
		expect(result).toContain("\u25CB");
	});
	it("shows tool count per server", () => {
		const conns = new Map([["s1", makeConn("s1", "connected")]]);
		const cfg = { mcpServers: { s1: { command: "echo" } } };
		const meta = new Map<string, ToolMetadata[]>([["s1", [
			{ name: "t1", originalName: "t1", serverName: "s1", description: "d" },
		]]]);
		const result = formatStatus(conns, cfg, meta, () => undefined);
		expect(result).toContain("1 tool");
	});
	it("returns message when no servers configured", () => {
		const result = formatStatus(new Map(), { mcpServers: {} }, new Map(), () => undefined);
		expect(result).toContain("No servers");
	});
});

describe("formatTools", () => {
	it("lists tools for a specific server", () => {
		const meta = new Map<string, ToolMetadata[]>([["s1", [
			{ name: "s1_echo", originalName: "echo", serverName: "s1", description: "Echo text" },
		]]]);
		const result = formatTools(meta, "s1");
		expect(result).toContain("echo");
		expect(result).toContain("Echo text");
	});
	it("lists tools across all servers when no filter", () => {
		const meta = new Map<string, ToolMetadata[]>([
			["s1", [{ name: "s1_a", originalName: "a", serverName: "s1", description: "d1" }]],
			["s2", [{ name: "s2_b", originalName: "b", serverName: "s2", description: "d2" }]],
		]);
		const result = formatTools(meta, undefined);
		expect(result).toContain("s1");
		expect(result).toContain("s2");
	});
	it("returns message when server has no tools", () => {
		const result = formatTools(new Map(), "s1");
		expect(result).toContain("No tools");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/cmd-info.test.ts
```

Expected: FAIL (cmd-info not found)

- [ ] **Step 3: Write cmd-info.ts**

```typescript
import type { ToolMetadata } from "./types-tool.js";
import type { FailureRecord } from "./failure-tracker.js";

type FailureLookup = (server: string) => FailureRecord | undefined;

export function formatStatus(
	conns: Map<string, unknown>,
	cfg: { mcpServers: Record<string, unknown> },
	meta: Map<string, ToolMetadata[]>,
	getFailureFn: FailureLookup,
): string {
	const names = Object.keys(cfg.mcpServers);
	if (names.length === 0) return "No servers configured.";
	return names.map((n) => statusLine(n, conns, meta, getFailureFn)).join("\n");
}

function statusLine(
	name: string,
	conns: Map<string, unknown>,
	meta: Map<string, ToolMetadata[]>,
	getFailureFn: FailureLookup,
): string {
	const conn = conns.get(name) as { status?: string } | undefined;
	const tools = meta.get(name) ?? [];
	const count = tools.length;
	const toolStr = count === 1 ? "1 tool" : `${count} tools`;
	if (!conn) return `  \u25CB ${name} (not connected) ${toolStr}`;
	if (conn.status === "connected") return `  \u2713 ${name} ${toolStr}`;
	const fail = getFailureFn(name);
	const ago = fail ? ` (${formatAgo(fail.at)})` : "";
	return `  \u2717 ${name} failed${ago} ${toolStr}`;
}

function formatAgo(ts: number): string {
	const diff = Math.floor((Date.now() - ts) / 1000);
	if (diff < 60) return `${diff}s ago`;
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
	return `${Math.floor(diff / 3600)}h ago`;
}

export function formatTools(
	meta: Map<string, ToolMetadata[]>,
	server: string | undefined,
): string {
	if (server) {
		const tools = meta.get(server);
		if (!tools || tools.length === 0) return `No tools found for "${server}".`;
		return toolList(server, tools);
	}
	const entries = [...meta.entries()];
	if (entries.length === 0) return "No tools available.";
	return entries.map(([s, t]) => toolList(s, t)).join("\n\n");
}

function toolList(server: string, tools: ToolMetadata[]): string {
	const header = `[${server}]`;
	const lines = tools.map((t) => `  ${t.originalName} - ${t.description}`);
	return [header, ...lines].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/cmd-info.test.ts
```

Expected: PASS (7 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/cmd-info.ts tests/cmd-info.test.ts
git commit -m "mcp: cmd-info (status + tools output formatting)"
```

---

### Task 2: cmd-server.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/cmd-server.ts`
- Create: `01_EXTENSIONS/mcp/tests/cmd-server.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { handleConnect, handleDisconnect, handleReconnect } from "../src/cmd-server.js";

describe("handleConnect", () => {
	it("calls connectFn and notifies on success", async () => {
		const connectFn = vi.fn().mockResolvedValue(undefined);
		const notify = vi.fn();
		await handleConnect("s1", { mcpServers: { s1: { command: "echo" } } }, connectFn, notify);
		expect(connectFn).toHaveBeenCalledWith("s1", { command: "echo" });
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("Connected"), "info");
	});
	it("notifies error when server not in config", async () => {
		const connectFn = vi.fn();
		const notify = vi.fn();
		await handleConnect("bad", { mcpServers: {} }, connectFn, notify);
		expect(connectFn).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("not found"), "error");
	});
	it("notifies error on connect failure", async () => {
		const connectFn = vi.fn().mockRejectedValue(new Error("timeout"));
		const notify = vi.fn();
		await handleConnect("s1", { mcpServers: { s1: { command: "echo" } } }, connectFn, notify);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("timeout"), "error");
	});
});

describe("handleDisconnect", () => {
	it("calls closeFn and notifies", async () => {
		const closeFn = vi.fn().mockResolvedValue(undefined);
		const notify = vi.fn();
		await handleDisconnect("s1", closeFn, notify);
		expect(closeFn).toHaveBeenCalledWith("s1");
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("Disconnected"), "info");
	});
	it("notifies error on close failure", async () => {
		const closeFn = vi.fn().mockRejectedValue(new Error("stuck"));
		const notify = vi.fn();
		await handleDisconnect("s1", closeFn, notify);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("stuck"), "error");
	});
});

describe("handleReconnect", () => {
	it("reconnects specific server", async () => {
		const closeFn = vi.fn().mockResolvedValue(undefined);
		const connectFn = vi.fn().mockResolvedValue(undefined);
		const notify = vi.fn();
		const cfg = { mcpServers: { s1: { command: "echo" } } };
		await handleReconnect("s1", cfg, closeFn, connectFn, notify);
		expect(closeFn).toHaveBeenCalledWith("s1");
		expect(connectFn).toHaveBeenCalledWith("s1", { command: "echo" });
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("Reconnected"), "info");
	});
	it("reconnects all servers when no name given", async () => {
		const closeFn = vi.fn().mockResolvedValue(undefined);
		const connectFn = vi.fn().mockResolvedValue(undefined);
		const notify = vi.fn();
		const cfg = { mcpServers: { s1: { command: "a" }, s2: { url: "b" } } };
		await handleReconnect(undefined, cfg, closeFn, connectFn, notify);
		expect(closeFn).toHaveBeenCalledTimes(2);
		expect(connectFn).toHaveBeenCalledTimes(2);
	});
	it("notifies error when server not found", async () => {
		const notify = vi.fn();
		await handleReconnect("bad", { mcpServers: {} }, vi.fn(), vi.fn(), notify);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("not found"), "error");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/cmd-server.test.ts
```

Expected: FAIL (cmd-server not found)

- [ ] **Step 3: Write cmd-server.ts**

```typescript
import type { ServerEntry } from "./types-config.js";

type ConnectFn = (name: string, entry: ServerEntry) => Promise<void>;
type CloseFn = (name: string) => Promise<void>;
type NotifyFn = (msg: string, type?: "info" | "warning" | "error") => void;
type Config = { mcpServers: Record<string, ServerEntry> };

export async function handleConnect(
	name: string, cfg: Config, connectFn: ConnectFn, notify: NotifyFn,
): Promise<void> {
	const entry = cfg.mcpServers[name];
	if (!entry) { notify(`Server "${name}" not found in config.`, "error"); return; }
	try {
		await connectFn(name, entry);
		notify(`Connected to "${name}".`, "info");
	} catch (err) {
		notify(`Failed to connect "${name}": ${errorMsg(err)}`, "error");
	}
}

export async function handleDisconnect(
	name: string, closeFn: CloseFn, notify: NotifyFn,
): Promise<void> {
	try {
		await closeFn(name);
		notify(`Disconnected from "${name}".`, "info");
	} catch (err) {
		notify(`Failed to disconnect "${name}": ${errorMsg(err)}`, "error");
	}
}

export async function handleReconnect(
	name: string | undefined, cfg: Config,
	closeFn: CloseFn, connectFn: ConnectFn, notify: NotifyFn,
): Promise<void> {
	const targets = name ? [name] : Object.keys(cfg.mcpServers);
	if (name && !cfg.mcpServers[name]) {
		notify(`Server "${name}" not found in config.`, "error");
		return;
	}
	for (const n of targets) {
		try {
			await closeFn(n);
			await connectFn(n, cfg.mcpServers[n]);
			notify(`Reconnected to "${n}".`, "info");
		} catch (err) {
			notify(`Failed to reconnect "${n}": ${errorMsg(err)}`, "error");
		}
	}
}

function errorMsg(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/cmd-server.test.ts
```

Expected: PASS (8 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/cmd-server.ts tests/cmd-server.test.ts
git commit -m "mcp: cmd-server (connect, disconnect, reconnect handlers)"
```

---

### Task 3: cmd-auth.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/cmd-auth.ts`
- Create: `01_EXTENSIONS/mcp/tests/cmd-auth.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { handleAuth } from "../src/cmd-auth.js";

describe("handleAuth", () => {
	it("shows OAuth instructions when server has oauth auth", () => {
		const notify = vi.fn();
		const cfg = { mcpServers: { s1: { url: "http://x", auth: "oauth" as const } } };
		handleAuth("s1", cfg, "/fake/oauth", notify);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("OAuth"), "info");
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("/fake/oauth/s1/tokens.json"), "info");
	});
	it("shows error when server not found", () => {
		const notify = vi.fn();
		handleAuth("bad", { mcpServers: {} }, "/fake/oauth", notify);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("not found"), "error");
	});
	it("shows error when server has no oauth auth", () => {
		const notify = vi.fn();
		const cfg = { mcpServers: { s1: { command: "echo" } } };
		handleAuth("s1", cfg, "/fake/oauth", notify);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("not configured for OAuth"), "error");
	});
	it("shows bearer instructions when server has bearer auth", () => {
		const notify = vi.fn();
		const cfg = { mcpServers: { s1: { url: "http://x", auth: "bearer" as const, bearerTokenEnv: "MY_TOKEN" } } };
		handleAuth("s1", cfg, "/fake/oauth", notify);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("bearer"), "info");
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("MY_TOKEN"), "info");
	});
	it("shows bearer with direct token hint", () => {
		const notify = vi.fn();
		const cfg = { mcpServers: { s1: { url: "http://x", auth: "bearer" as const, bearerToken: "tok" } } };
		handleAuth("s1", cfg, "/fake/oauth", notify);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("bearerToken"), "info");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/cmd-auth.test.ts
```

Expected: FAIL (cmd-auth not found)

- [ ] **Step 3: Write cmd-auth.ts**

```typescript
import type { ServerEntry } from "./types-config.js";

type NotifyFn = (msg: string, type?: "info" | "warning" | "error") => void;
type Config = { mcpServers: Record<string, ServerEntry> };

export function handleAuth(
	name: string, cfg: Config, oauthDir: string, notify: NotifyFn,
): void {
	const entry = cfg.mcpServers[name];
	if (!entry) {
		notify(`Server "${name}" not found in config.`, "error");
		return;
	}
	if (entry.auth === "oauth") {
		showOAuthInstructions(name, oauthDir, notify);
		return;
	}
	if (entry.auth === "bearer") {
		showBearerInstructions(name, entry, notify);
		return;
	}
	notify(`Server "${name}" is not configured for OAuth or bearer auth.`, "error");
}

function showOAuthInstructions(
	name: string, oauthDir: string, notify: NotifyFn,
): void {
	const tokenPath = `${oauthDir}/${name}/tokens.json`;
	const msg = [
		`OAuth setup for "${name}":`,
		"",
		"1. Complete the OAuth flow for this server",
		`2. Place token file at: ${tokenPath}`,
		"",
		"Token file format: { \"access_token\": \"...\", \"token_type\": \"bearer\" }",
		"Optional: \"expiresAt\" (epoch ms) for expiry checking",
	].join("\n");
	notify(msg, "info");
}

function showBearerInstructions(
	name: string, entry: ServerEntry, notify: NotifyFn,
): void {
	const source = entry.bearerTokenEnv
		? `Set env var: ${entry.bearerTokenEnv}`
		: "Token set via bearerToken field in config";
	const msg = [
		`Auth for "${name}" uses bearer token.`,
		"",
		source,
	].join("\n");
	notify(msg, "info");
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/cmd-auth.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/cmd-auth.ts tests/cmd-auth.test.ts
git commit -m "mcp: cmd-auth (OAuth + bearer auth instructions)"
```

---

### Task 4: cmd-search.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/cmd-search.ts`
- Create: `01_EXTENSIONS/mcp/tests/cmd-search.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { formatSearchResults } from "../src/cmd-search.js";
import type { ToolMetadata } from "../src/types-tool.js";

const matchAll = () => true;
const matchNone = () => false;

describe("formatSearchResults", () => {
	it("returns matching tools across servers", () => {
		const meta = new Map<string, ToolMetadata[]>([
			["s1", [
				{ name: "s1_web_search", originalName: "web_search", serverName: "s1", description: "Search" },
				{ name: "s1_file_read", originalName: "file_read", serverName: "s1", description: "Read" },
			]],
			["s2", [
				{ name: "s2_search_docs", originalName: "search_docs", serverName: "s2", description: "Docs" },
			]],
		]);
		const matcher = (name: string) => name.includes("search");
		const result = formatSearchResults(meta, "search", matcher);
		expect(result).toContain("web_search");
		expect(result).toContain("search_docs");
		expect(result).not.toContain("file_read");
	});
	it("returns no-results message when nothing matches", () => {
		const meta = new Map<string, ToolMetadata[]>([
			["s1", [{ name: "t1", originalName: "t1", serverName: "s1", description: "d" }]],
		]);
		const result = formatSearchResults(meta, "xyz", matchNone);
		expect(result).toContain("No tools matching");
	});
	it("returns no-results when metadata is empty", () => {
		const result = formatSearchResults(new Map(), "q", matchAll);
		expect(result).toContain("No tools matching");
	});
	it("includes server name in results", () => {
		const meta = new Map<string, ToolMetadata[]>([
			["myserver", [{ name: "ms_t", originalName: "t", serverName: "myserver", description: "d" }]],
		]);
		const result = formatSearchResults(meta, "t", matchAll);
		expect(result).toContain("myserver");
	});
	it("shows query in header", () => {
		const meta = new Map<string, ToolMetadata[]>([
			["s1", [{ name: "t", originalName: "t", serverName: "s1", description: "d" }]],
		]);
		const result = formatSearchResults(meta, "myquery", matchAll);
		expect(result).toContain("myquery");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/cmd-search.test.ts
```

Expected: FAIL (cmd-search not found)

- [ ] **Step 3: Write cmd-search.ts**

```typescript
import type { ToolMetadata } from "./types-tool.js";

type MatchFn = (toolName: string) => boolean;

interface SearchHit {
	tool: ToolMetadata;
	server: string;
}

export function formatSearchResults(
	meta: Map<string, ToolMetadata[]>,
	query: string,
	matchFn: MatchFn,
): string {
	const hits = collectHits(meta, matchFn);
	if (hits.length === 0) return `No tools matching "${query}".`;
	const header = `Search results for "${query}" (${hits.length} found):`;
	const grouped = groupByServer(hits);
	const sections = grouped.map(([server, tools]) => formatGroup(server, tools));
	return [header, "", ...sections].join("\n");
}

function collectHits(
	meta: Map<string, ToolMetadata[]>,
	matchFn: MatchFn,
): SearchHit[] {
	const hits: SearchHit[] = [];
	for (const [server, tools] of meta) {
		for (const tool of tools) {
			if (matchFn(tool.originalName)) hits.push({ tool, server });
		}
	}
	return hits;
}

function groupByServer(hits: SearchHit[]): [string, ToolMetadata[]][] {
	const map = new Map<string, ToolMetadata[]>();
	for (const h of hits) {
		const list = map.get(h.server) ?? [];
		list.push(h.tool);
		map.set(h.server, list);
	}
	return [...map.entries()];
}

function formatGroup(server: string, tools: ToolMetadata[]): string {
	const lines = tools.map((t) => `  ${t.originalName} - ${t.description}`);
	return [`[${server}]`, ...lines].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/cmd-search.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/cmd-search.ts tests/cmd-search.test.ts
git commit -m "mcp: cmd-search (search output formatting)"
```

---

### Task 5: cmd-router.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/cmd-router.ts`
- Create: `01_EXTENSIONS/mcp/tests/cmd-router.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { createMcpCommand, parseSubcommand } from "../src/cmd-router.js";

describe("parseSubcommand", () => {
	it("parses 'status'", () => {
		expect(parseSubcommand("status")).toEqual({ cmd: "status", arg: undefined });
	});
	it("parses 'tools'", () => {
		expect(parseSubcommand("tools")).toEqual({ cmd: "tools", arg: undefined });
	});
	it("parses 'tools myserver'", () => {
		expect(parseSubcommand("tools myserver")).toEqual({ cmd: "tools", arg: "myserver" });
	});
	it("parses 'connect myserver'", () => {
		expect(parseSubcommand("connect myserver")).toEqual({ cmd: "connect", arg: "myserver" });
	});
	it("parses 'disconnect myserver'", () => {
		expect(parseSubcommand("disconnect myserver")).toEqual({ cmd: "disconnect", arg: "myserver" });
	});
	it("parses 'reconnect'", () => {
		expect(parseSubcommand("reconnect")).toEqual({ cmd: "reconnect", arg: undefined });
	});
	it("parses 'reconnect myserver'", () => {
		expect(parseSubcommand("reconnect myserver")).toEqual({ cmd: "reconnect", arg: "myserver" });
	});
	it("parses 'auth myserver'", () => {
		expect(parseSubcommand("auth myserver")).toEqual({ cmd: "auth", arg: "myserver" });
	});
	it("parses 'search web'", () => {
		expect(parseSubcommand("search web")).toEqual({ cmd: "search", arg: "web" });
	});
	it("trims whitespace", () => {
		expect(parseSubcommand("  status  ")).toEqual({ cmd: "status", arg: undefined });
	});
	it("returns help for empty string", () => {
		expect(parseSubcommand("")).toEqual({ cmd: "help", arg: undefined });
	});
	it("returns help for unknown subcommand", () => {
		expect(parseSubcommand("foobar")).toEqual({ cmd: "help", arg: undefined });
	});
});

describe("createMcpCommand", () => {
	it("returns CommandDef with description", () => {
		const pi = { sendMessage: vi.fn() };
		const def = createMcpCommand(pi);
		expect(def.description).toContain("MCP");
	});
	it("handler is async function", () => {
		const pi = { sendMessage: vi.fn() };
		const def = createMcpCommand(pi);
		expect(typeof def.handler).toBe("function");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/cmd-router.test.ts
```

Expected: FAIL (cmd-router not found)

- [ ] **Step 3: Write cmd-router.ts**

```typescript
import { formatStatus, formatTools } from "./cmd-info.js";
import { handleConnect, handleDisconnect, handleReconnect } from "./cmd-server.js";
import { handleAuth } from "./cmd-auth.js";
import { formatSearchResults } from "./cmd-search.js";
import { matchTool } from "./search.js";
import { getConnections, getConfig, getAllMetadata } from "./state.js";
import { getFailure } from "./failure-tracker.js";
import { OAUTH_TOKEN_DIR } from "./constants.js";
import type { ServerEntry } from "./types-config.js";

export interface CmdPi {
	sendMessage(msg: { customType: string; content: string; display: boolean }): void;
}

interface CommandContext { ui: { notify(msg: string, type?: "info" | "warning" | "error"): void } }

interface CommandDef {
	description: string;
	handler: (args: string, ctx: CommandContext) => Promise<void>;
}

type ConnectFn = (name: string, entry: ServerEntry) => Promise<void>;
type CloseFn = (name: string) => Promise<void>;

const VALID_CMDS = new Set(["status", "tools", "connect", "disconnect", "reconnect", "auth", "search"]);

export interface ParsedSub { cmd: string; arg: string | undefined }

export function parseSubcommand(raw: string): ParsedSub {
	const trimmed = raw.trim();
	if (!trimmed) return { cmd: "help", arg: undefined };
	const spaceIdx = trimmed.indexOf(" ");
	const cmd = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
	const arg = spaceIdx === -1 ? undefined : trimmed.slice(spaceIdx + 1).trim() || undefined;
	if (!VALID_CMDS.has(cmd)) return { cmd: "help", arg: undefined };
	return { cmd, arg };
}

export function createMcpCommand(
	_pi: CmdPi, connectFn?: ConnectFn, closeFn?: CloseFn,
): CommandDef {
	return {
		description: "MCP server management",
		handler: async (args: string, ctx: CommandContext) => {
			const { cmd, arg } = parseSubcommand(args);
			const notify = ctx.ui.notify.bind(ctx.ui);
			const cfg = getConfig() ?? { mcpServers: {} };
			const doConnect = connectFn ?? noopConnect;
			const doClose = closeFn ?? noopClose;
			await routeCommand(cmd, arg, cfg, notify, doConnect, doClose);
		},
	};
}

async function routeCommand(
	cmd: string, arg: string | undefined,
	cfg: { mcpServers: Record<string, ServerEntry> },
	notify: (msg: string, type?: "info" | "warning" | "error") => void,
	connectFn: ConnectFn, closeFn: CloseFn,
): Promise<void> {
	if (cmd === "status") notify(formatStatus(getConnections(), cfg, getAllMetadata(), getFailure), "info");
	else if (cmd === "tools") notify(formatTools(getAllMetadata(), arg), "info");
	else if (cmd === "connect") arg ? await handleConnect(arg, cfg, connectFn, notify) : notify("Usage: /mcp connect <server>", "error");
	else if (cmd === "disconnect") arg ? await handleDisconnect(arg, closeFn, notify) : notify("Usage: /mcp disconnect <server>", "error");
	else if (cmd === "reconnect") await handleReconnect(arg, cfg, closeFn, connectFn, notify);
	else if (cmd === "auth") arg ? handleAuth(arg, cfg, OAUTH_TOKEN_DIR, notify) : notify("Usage: /mcp auth <server>", "error");
	else if (cmd === "search") arg ? notify(formatSearchResults(getAllMetadata(), arg, (n) => matchTool(n, arg)), "info") : notify("Usage: /mcp search <query>", "error");
	else showHelp(notify);
}

function showHelp(notify: (msg: string, type?: "info" | "warning" | "error") => void): void {
	notify([
		"Usage: /mcp <subcommand>",
		"  status              - Server connection status",
		"  tools [server]      - List available tools",
		"  connect <server>    - Connect to a server",
		"  disconnect <server> - Disconnect from a server",
		"  reconnect [server]  - Reconnect (all or specific)",
		"  auth <server>       - Auth setup instructions",
		"  search <query>      - Search tools across servers",
	].join("\n"), "info");
}

async function noopConnect(): Promise<void> {}
async function noopClose(): Promise<void> {}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/cmd-router.test.ts
```

Expected: PASS (14 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/cmd-router.ts tests/cmd-router.test.ts
git commit -m "mcp: cmd-router (subcommand routing + command definition)"
```

---

### Task 6: Full test suite + Go architecture tests

- [ ] **Step 1: Run all Plan 8 tests with coverage**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/cmd-info.test.ts tests/cmd-server.test.ts tests/cmd-auth.test.ts tests/cmd-search.test.ts tests/cmd-router.test.ts --coverage
```

Expected: All tests pass. Coverage 100% on all 5 cmd-*.ts files.

- [ ] **Step 2: Run full extension test suite**

```bash
cd 01_EXTENSIONS/mcp && npm test
```

Expected: All tests pass. Coverage thresholds met.

- [ ] **Step 3: Run Go architecture tests**

```bash
cd /Users/me/Desktop/pi && go test ./00_ARCHITECTURE/tests/ -v -count=1
```

Expected: ALL tests pass. Every `.ts` file under 99 lines, no `as any/unknown/never`, no `ExtensionAPI` outside `index.ts`.

- [ ] **Step 4: Commit**

```bash
cd 01_EXTENSIONS/mcp && git add -A && git commit -m "mcp: Plan 8 Command complete (5 modules)"
```
