# MCP Extension Plan 7: Proxy Tool

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `mcp` proxy tool -- the single tool registered with Pi that multiplexes all MCP server interactions through action-based routing. Handles call, list, describe, search, status, and connect actions.

**Architecture:** 5 modules forming a thin dispatch layer. `proxy-router.ts` creates the TypeBox-parameterized `ToolDef` and routes to action-specific handlers. Each handler reads state and delegates to foundation modules (Plan 1), server modules (Plan 3), consent (Plan 4), and tool-metadata (Plan 6). All files <= 99 lines. Dependency injection throughout.

**Tech Stack:** TypeScript, Vitest, @sinclair/typebox

**Prerequisites:** Plan 1 (types, state, search, schema-format, content-transform, errors, constants), Plan 3 (server-connect, server-pool), Plan 4 (consent), Plan 6 (tool-metadata).

**Dependencies from other plans (imported interfaces):**
- `state.ts` -- `getConnections`, `getAllMetadata`, `getMetadata`, `setMetadata`, `getConfig`
- `types-proxy.ts` -- `ProxyParams`, `ProxyAction`, `ProxyToolResult`
- `types-server.ts` -- `ServerConnection`, `McpClient`, `McpContent`
- `types-tool.ts` -- `ToolMetadata`, `ToolDef`, `ToolResult`
- `types-config.ts` -- `McpConfig`
- `search.ts` -- `matchTool`
- `schema-format.ts` -- `formatSchema`
- `content-transform.ts` -- `transformContent`
- `errors.ts` -- `McpError`, `mcpError`
- `constants.ts` -- (no direct dependency from proxy modules)
- `server-connect.ts` (Plan 3) -- `connectServer`
- `server-pool.ts` (Plan 3) -- `getOrConnect`
- `consent.ts` (Plan 4) -- `checkConsent`
- `tool-metadata.ts` (Plan 6) -- `getToolsForServer`, `findToolAcrossServers`

---

### Task 1: proxy-description.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/proxy-description.ts`
- Create: `01_EXTENSIONS/mcp/tests/proxy-description.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import { buildDescription } from "../src/proxy-description.js";

describe("buildDescription", () => {
	const makeState = (
		servers: Array<{ name: string; status: string }>,
		metadata: Map<string, Array<{ name: string }>>,
	) => ({
		getServers: () => servers,
		getMetadataMap: () => metadata,
	});

	it("returns base description with no servers", () => {
		const state = makeState([], new Map());
		const desc = buildDescription(state);
		expect(desc).toContain("MCP proxy");
		expect(desc).toContain("No servers configured");
	});

	it("lists connected servers with tool counts", () => {
		const meta = new Map<string, Array<{ name: string }>>();
		meta.set("github", [{ name: "search" }, { name: "pr" }]);
		const state = makeState(
			[{ name: "github", status: "connected" }],
			meta,
		);
		const desc = buildDescription(state);
		expect(desc).toContain("github");
		expect(desc).toContain("2 tools");
	});

	it("shows status for disconnected servers", () => {
		const state = makeState(
			[{ name: "slack", status: "closed" }],
			new Map(),
		);
		const desc = buildDescription(state);
		expect(desc).toContain("slack");
		expect(desc).toContain("closed");
	});

	it("shows multiple servers", () => {
		const meta = new Map<string, Array<{ name: string }>>();
		meta.set("a", [{ name: "t1" }]);
		meta.set("b", [{ name: "t2" }, { name: "t3" }]);
		const state = makeState(
			[{ name: "a", status: "connected" }, { name: "b", status: "connected" }],
			meta,
		);
		const desc = buildDescription(state);
		expect(desc).toContain("a");
		expect(desc).toContain("1 tool");
		expect(desc).toContain("b");
		expect(desc).toContain("2 tools");
	});

	it("shows cached tool count for lazy servers", () => {
		const meta = new Map<string, Array<{ name: string }>>();
		meta.set("lazy-srv", [{ name: "t1" }, { name: "t2" }, { name: "t3" }]);
		const state = makeState(
			[{ name: "lazy-srv", status: "closed" }],
			meta,
		);
		const desc = buildDescription(state);
		expect(desc).toContain("3 tools");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/proxy-description.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Write proxy-description.ts**

```typescript
interface ServerInfo {
	name: string;
	status: string;
}

interface ToolEntry {
	name: string;
}

interface DescriptionState {
	getServers(): ServerInfo[];
	getMetadataMap(): Map<string, ToolEntry[]>;
}

const BASE = "MCP proxy tool. Actions: call, list, describe, search, status, connect.";

export function buildDescription(state: DescriptionState): string {
	const servers = state.getServers();
	if (servers.length === 0) return `${BASE}\nNo servers configured.`;
	const lines = servers.map((s) => formatServer(s, state.getMetadataMap()));
	return `${BASE}\nServers:\n${lines.join("\n")}`;
}

function formatServer(
	server: ServerInfo,
	metadata: Map<string, ToolEntry[]>,
): string {
	const tools = metadata.get(server.name);
	const count = tools ? tools.length : 0;
	const toolStr = count > 0 ? `${count} tool${count === 1 ? "" : "s"}` : "no tools";
	if (server.status === "connected") return `  - ${server.name}: ${toolStr}`;
	return `  - ${server.name}: ${toolStr} (${server.status})`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/proxy-description.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/proxy-description.ts tests/proxy-description.test.ts
git commit -m "mcp: proxy-description (dynamic tool description generation)"
```

---

### Task 2: proxy-search.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/proxy-search.ts`
- Create: `01_EXTENSIONS/mcp/tests/proxy-search.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { proxySearch } from "../src/proxy-search.js";
import type { ToolMetadata } from "../src/types-tool.js";

describe("proxySearch", () => {
	const meta: Map<string, ToolMetadata[]> = new Map([
		["github", [
			{ name: "search_repos", originalName: "search_repos", serverName: "github", description: "Search repos" },
			{ name: "create_pr", originalName: "create_pr", serverName: "github", description: "Create PR" },
		]],
		["slack", [
			{ name: "send_message", originalName: "send_message", serverName: "slack", description: "Send msg" },
			{ name: "search_msgs", originalName: "search_msgs", serverName: "slack", description: "Search messages" },
		]],
	]);

	const matcher = (toolName: string, query: string): boolean =>
		toolName.toLowerCase().includes(query.toLowerCase().replace(/[-_]/g, ""));

	it("finds tools matching query across all servers", () => {
		const result = proxySearch("search", meta, matcher);
		expect(result.content[0].text).toContain("search_repos");
		expect(result.content[0].text).toContain("search_msgs");
	});

	it("returns no results message when nothing matches", () => {
		const result = proxySearch("zzz_nonexistent", meta, matcher);
		expect(result.content[0].text).toContain("No tools found");
	});

	it("returns empty result for empty query", () => {
		const noMatch = (_t: string, _q: string) => false;
		const result = proxySearch("", meta, noMatch);
		expect(result.content[0].text).toContain("No tools found");
	});

	it("groups results by server", () => {
		const result = proxySearch("search", meta, matcher);
		const text = result.content[0].text ?? "";
		expect(text).toContain("github");
		expect(text).toContain("slack");
	});

	it("includes tool descriptions in output", () => {
		const result = proxySearch("create", meta, matcher);
		const text = result.content[0].text ?? "";
		expect(text).toContain("Create PR");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/proxy-search.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Write proxy-search.ts**

```typescript
import type { ToolMetadata } from "./types-tool.js";
import type { ProxyToolResult } from "./types-proxy.js";

type MatchFn = (toolName: string, query: string) => boolean;

interface SearchHit {
	serverName: string;
	name: string;
	description: string;
}

export function proxySearch(
	query: string,
	metadata: Map<string, ToolMetadata[]>,
	match: MatchFn,
): ProxyToolResult {
	const hits: SearchHit[] = [];
	for (const [server, tools] of metadata) {
		for (const tool of tools) {
			if (match(tool.name, query)) {
				hits.push({ serverName: server, name: tool.name, description: tool.description });
			}
		}
	}
	if (hits.length === 0) {
		return { content: [{ type: "text", text: `No tools found matching "${query}".` }] };
	}
	return { content: [{ type: "text", text: formatHits(hits) }] };
}

function formatHits(hits: SearchHit[]): string {
	const byServer = new Map<string, SearchHit[]>();
	for (const h of hits) {
		const list = byServer.get(h.serverName) ?? [];
		list.push(h);
		byServer.set(h.serverName, list);
	}
	const sections: string[] = [];
	for (const [server, tools] of byServer) {
		const lines = tools.map((t) => `  - ${t.name}: ${t.description}`);
		sections.push(`[${server}]\n${lines.join("\n")}`);
	}
	return sections.join("\n\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/proxy-search.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/proxy-search.ts tests/proxy-search.test.ts
git commit -m "mcp: proxy-search (cross-server tool search)"
```

---

### Task 3: proxy-query.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/proxy-query.ts`
- Create: `01_EXTENSIONS/mcp/tests/proxy-query.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { proxyList, proxyDescribe, proxyStatus } from "../src/proxy-query.js";
import type { ToolMetadata } from "../src/types-tool.js";

describe("proxyList", () => {
	const tools: ToolMetadata[] = [
		{ name: "search", originalName: "search", serverName: "gh", description: "Search" },
		{ name: "pr", originalName: "pr", serverName: "gh", description: "PR ops" },
	];
	const getTools = vi.fn((_server: string) => tools);

	it("lists tools for a server", () => {
		const result = proxyList("gh", getTools);
		expect(result.content[0].text).toContain("search");
		expect(result.content[0].text).toContain("pr");
	});

	it("returns error when server has no tools", () => {
		const empty = vi.fn((_s: string) => undefined);
		const result = proxyList("none", empty);
		expect(result.content[0].text).toContain("No tools");
	});

	it("lists all servers when no server specified", () => {
		const result = proxyList(undefined, getTools);
		expect(result.content[0].text).toContain("server");
	});
});

describe("proxyDescribe", () => {
	const find = vi.fn((name: string) => {
		if (name === "search") {
			return {
				name: "search", originalName: "search", serverName: "gh",
				description: "Search repos",
				inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
			};
		}
		return undefined;
	});
	const format = (schema: unknown) => (schema ? "q: string [required]" : "(no parameters)");

	it("describes a tool with schema", () => {
		const result = proxyDescribe("search", find, format);
		expect(result.content[0].text).toContain("search");
		expect(result.content[0].text).toContain("q: string");
	});

	it("returns error when tool not found", () => {
		const result = proxyDescribe("missing", find, format);
		expect(result.content[0].text).toContain("not found");
	});

	it("requires tool name", () => {
		const result = proxyDescribe(undefined, find, format);
		expect(result.content[0].text).toContain("required");
	});
});

describe("proxyStatus", () => {
	it("shows all server statuses", () => {
		const servers = [
			{ name: "gh", status: "connected" },
			{ name: "slack", status: "closed" },
		];
		const result = proxyStatus(servers);
		expect(result.content[0].text).toContain("gh");
		expect(result.content[0].text).toContain("connected");
		expect(result.content[0].text).toContain("slack");
		expect(result.content[0].text).toContain("closed");
	});

	it("shows message when no servers", () => {
		const result = proxyStatus([]);
		expect(result.content[0].text).toContain("No servers");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/proxy-query.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Write proxy-query.ts**

```typescript
import type { ToolMetadata } from "./types-tool.js";
import type { ProxyToolResult } from "./types-proxy.js";

type GetToolsFn = (server: string) => ToolMetadata[] | undefined;
type FindToolFn = (name: string) => ToolMetadata | undefined;
type FormatFn = (schema: unknown) => string;

interface ServerStatus {
	name: string;
	status: string;
}

export function proxyList(
	server: string | undefined,
	getTools: GetToolsFn,
): ProxyToolResult {
	if (!server) {
		return text("Provide a server name. Use action: \"status\" to see servers.");
	}
	const tools = getTools(server);
	if (!tools || tools.length === 0) return text(`No tools found for server "${server}".`);
	const lines = tools.map((t) => `  - ${t.name}: ${t.description}`);
	return text(`Tools on [${server}]:\n${lines.join("\n")}`);
}

export function proxyDescribe(
	toolName: string | undefined,
	find: FindToolFn,
	format: FormatFn,
): ProxyToolResult {
	if (!toolName) return text("Tool name is required for describe action.");
	const tool = find(toolName);
	if (!tool) return text(`Tool "${toolName}" not found. Try action: "search".`);
	const schema = format(tool.inputSchema);
	return text(`[${tool.serverName}] ${tool.name}: ${tool.description}\n\nParameters:\n${schema}`);
}

export function proxyStatus(servers: ServerStatus[]): ProxyToolResult {
	if (servers.length === 0) return text("No servers configured.");
	const lines = servers.map((s) => `  - ${s.name}: ${s.status}`);
	return text(`Server status:\n${lines.join("\n")}`);
}

function text(msg: string): ProxyToolResult {
	return { content: [{ type: "text", text: msg }] };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/proxy-query.test.ts
```

Expected: PASS (8 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/proxy-query.ts tests/proxy-query.test.ts
git commit -m "mcp: proxy-query (list, describe, status actions)"
```

---

### Task 4: proxy-call.ts (part 1 -- happy path)

**Files:**
- Create: `01_EXTENSIONS/mcp/src/proxy-call.ts`
- Create: `01_EXTENSIONS/mcp/tests/proxy-call.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { proxyCall } from "../src/proxy-call.js";
import type { McpContent } from "../src/types-server.js";

describe("proxyCall", () => {
	const mockContent: McpContent[] = [{ type: "text", text: "result" }];
	const deps = {
		findTool: vi.fn((name: string) =>
			name === "search"
				? { name: "search", originalName: "search", serverName: "gh", description: "d" }
				: undefined,
		),
		getOrConnect: vi.fn(async (_server: string) => ({
			name: "gh",
			client: { callTool: vi.fn(async () => ({ content: mockContent })) },
			status: "connected" as const,
			lastUsedAt: 0,
			inFlight: 0,
		})),
		checkConsent: vi.fn(async () => true),
		transform: vi.fn((c: McpContent) => ({ type: "text", text: c.text ?? "" })),
	};

	it("calls tool and returns transformed content", async () => {
		const result = await proxyCall("search", { q: "test" }, deps);
		expect(deps.findTool).toHaveBeenCalledWith("search");
		expect(deps.checkConsent).toHaveBeenCalledWith("gh");
		expect(result.content).toEqual([{ type: "text", text: "result" }]);
	});

	it("passes arguments to callTool", async () => {
		await proxyCall("search", { q: "hello" }, deps);
		const conn = await deps.getOrConnect("gh");
		expect(conn.client.callTool).toHaveBeenCalledWith({
			name: "search",
			arguments: { q: "hello" },
		});
	});

	it("updates lastUsedAt on successful call", async () => {
		const before = Date.now();
		const result = await proxyCall("search", {}, deps);
		expect(result.content).toBeDefined();
	});

	it("calls with undefined args when none provided", async () => {
		const result = await proxyCall("search", undefined, deps);
		expect(result.content).toHaveLength(1);
	});

	it("handles multiple content blocks", async () => {
		const multi: McpContent[] = [
			{ type: "text", text: "a" },
			{ type: "text", text: "b" },
		];
		const multiDeps = {
			...deps,
			getOrConnect: vi.fn(async () => ({
				name: "gh",
				client: { callTool: vi.fn(async () => ({ content: multi })) },
				status: "connected" as const,
				lastUsedAt: 0,
				inFlight: 0,
			})),
		};
		const result = await proxyCall("search", {}, multiDeps);
		expect(result.content).toHaveLength(2);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/proxy-call.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Write proxy-call.ts**

```typescript
import type { ProxyToolResult } from "./types-proxy.js";
import type { McpContent } from "./types-server.js";
import type { ToolMetadata } from "./types-tool.js";

interface CallClient {
	callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<{ content: McpContent[] }>;
}

interface CallConnection {
	name: string;
	client: CallClient;
	status: string;
	lastUsedAt: number;
	inFlight: number;
}

interface ContentBlock {
	type: string;
	text?: string;
	data?: string;
	mimeType?: string;
}

export interface CallDeps {
	findTool: (name: string) => ToolMetadata | undefined;
	getOrConnect: (server: string) => Promise<CallConnection>;
	checkConsent: (server: string) => Promise<boolean>;
	transform: (content: McpContent) => ContentBlock;
}

export async function proxyCall(
	toolName: string,
	args: Record<string, unknown> | undefined,
	deps: CallDeps,
): Promise<ProxyToolResult> {
	const meta = deps.findTool(toolName);
	if (!meta) {
		return { content: [{ type: "text", text: `Tool "${toolName}" not found. Try action: "search".` }] };
	}
	const allowed = await deps.checkConsent(meta.serverName);
	if (!allowed) {
		return { content: [{ type: "text", text: `Execution denied for server "${meta.serverName}".` }] };
	}
	const conn = await deps.getOrConnect(meta.serverName);
	conn.inFlight++;
	try {
		const result = await conn.client.callTool({
			name: meta.originalName,
			arguments: args,
		});
		conn.lastUsedAt = Date.now();
		return { content: result.content.map(deps.transform) };
	} finally {
		conn.inFlight--;
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/proxy-call.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/proxy-call.ts tests/proxy-call.test.ts
git commit -m "mcp: proxy-call (tool execution with consent and transform)"
```

---

### Task 5: proxy-call.ts (part 2 -- error paths)

**Files:**
- Create: `01_EXTENSIONS/mcp/tests/proxy-call-errors.test.ts`

- [ ] **Step 1: Write the error test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { proxyCall } from "../src/proxy-call.js";
import type { CallDeps } from "../src/proxy-call.js";
import type { McpContent } from "../src/types-server.js";

describe("proxyCall errors", () => {
	const baseDeps: CallDeps = {
		findTool: vi.fn((name: string) =>
			name === "tool1"
				? { name: "tool1", originalName: "tool1", serverName: "s1", description: "d" }
				: undefined,
		),
		getOrConnect: vi.fn(async () => ({
			name: "s1",
			client: { callTool: vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] })) },
			status: "connected" as const,
			lastUsedAt: 0,
			inFlight: 0,
		})),
		checkConsent: vi.fn(async () => true),
		transform: vi.fn((c: McpContent) => ({ type: "text", text: c.text ?? "" })),
	};

	it("returns error when tool not found", async () => {
		const result = await proxyCall("missing", {}, baseDeps);
		expect(result.content[0].text).toContain("not found");
	});

	it("returns error when consent denied", async () => {
		const deps = { ...baseDeps, checkConsent: vi.fn(async () => false) };
		const result = await proxyCall("tool1", {}, deps);
		expect(result.content[0].text).toContain("denied");
	});

	it("propagates connection error", async () => {
		const deps = {
			...baseDeps,
			getOrConnect: vi.fn(async () => { throw new Error("connection failed"); }),
		};
		await expect(proxyCall("tool1", {}, deps)).rejects.toThrow("connection failed");
	});

	it("propagates callTool error", async () => {
		const failClient = { callTool: vi.fn(async () => { throw new Error("call failed"); }) };
		const deps = {
			...baseDeps,
			getOrConnect: vi.fn(async () => ({
				name: "s1", client: failClient,
				status: "connected" as const, lastUsedAt: 0, inFlight: 0,
			})),
		};
		await expect(proxyCall("tool1", {}, deps)).rejects.toThrow("call failed");
	});

	it("decrements inFlight even on error", async () => {
		const conn = {
			name: "s1",
			client: { callTool: vi.fn(async () => { throw new Error("boom"); }) },
			status: "connected" as const,
			lastUsedAt: 0,
			inFlight: 0,
		};
		const deps = {
			...baseDeps,
			getOrConnect: vi.fn(async () => conn),
		};
		await expect(proxyCall("tool1", {}, deps)).rejects.toThrow("boom");
		expect(conn.inFlight).toBe(0);
	});

	it("handles empty content array from server", async () => {
		const deps = {
			...baseDeps,
			getOrConnect: vi.fn(async () => ({
				name: "s1",
				client: { callTool: vi.fn(async () => ({ content: [] })) },
				status: "connected" as const, lastUsedAt: 0, inFlight: 0,
			})),
		};
		const result = await proxyCall("tool1", {}, deps);
		expect(result.content).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/proxy-call-errors.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 3: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add tests/proxy-call-errors.test.ts
git commit -m "mcp: proxy-call error tests (consent denied, connection/call failures)"
```

---

### Task 6: proxy-router.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/proxy-router.ts`
- Create: `01_EXTENSIONS/mcp/tests/proxy-router.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { createProxyTool, routeAction } from "../src/proxy-router.js";
import type { ProxyParams } from "../src/types-proxy.js";
import type { ToolMetadata } from "../src/types-tool.js";
import type { McpContent } from "../src/types-server.js";

describe("routeAction", () => {
	const mockMeta = new Map<string, ToolMetadata[]>([
		["gh", [{ name: "search", originalName: "search", serverName: "gh", description: "Search" }]],
	]);
	const deps = {
		search: vi.fn(() => ({ content: [{ type: "text", text: "found" }] })),
		list: vi.fn(() => ({ content: [{ type: "text", text: "listed" }] })),
		describe: vi.fn(() => ({ content: [{ type: "text", text: "described" }] })),
		status: vi.fn(() => ({ content: [{ type: "text", text: "status" }] })),
		call: vi.fn(async () => ({ content: [{ type: "text", text: "called" }] })),
		connect: vi.fn(async () => ({ content: [{ type: "text", text: "connected" }] })),
	};

	it("routes search action", async () => {
		const params: ProxyParams = { action: "search", query: "test" };
		const result = await routeAction(params, deps);
		expect(deps.search).toHaveBeenCalledWith("test");
		expect(result.content[0].text).toBe("found");
	});

	it("routes list action", async () => {
		const params: ProxyParams = { action: "list", server: "gh" };
		const result = await routeAction(params, deps);
		expect(deps.list).toHaveBeenCalledWith("gh");
		expect(result.content[0].text).toBe("listed");
	});

	it("routes describe action", async () => {
		const params: ProxyParams = { action: "describe", tool: "search" };
		const result = await routeAction(params, deps);
		expect(deps.describe).toHaveBeenCalledWith("search");
		expect(result.content[0].text).toBe("described");
	});

	it("routes status action", async () => {
		const result = await routeAction({ action: "status" }, deps);
		expect(deps.status).toHaveBeenCalled();
	});

	it("routes call action", async () => {
		const params: ProxyParams = { action: "call", tool: "search", args: { q: "hi" } };
		const result = await routeAction(params, deps);
		expect(deps.call).toHaveBeenCalledWith("search", { q: "hi" });
		expect(result.content[0].text).toBe("called");
	});

	it("routes connect action", async () => {
		const result = await routeAction({ action: "connect", server: "gh" }, deps);
		expect(deps.connect).toHaveBeenCalledWith("gh");
	});

	it("returns error for missing tool on call", async () => {
		const result = await routeAction({ action: "call" }, deps);
		expect(result.content[0].text).toContain("required");
	});
});

describe("createProxyTool", () => {
	it("returns tool definition with correct name", () => {
		const pi = { sendMessage: vi.fn() };
		const buildDesc = () => "MCP proxy";
		const makeDeps = () => ({
			search: vi.fn(() => ({ content: [] })),
			list: vi.fn(() => ({ content: [] })),
			describe: vi.fn(() => ({ content: [] })),
			status: vi.fn(() => ({ content: [] })),
			call: vi.fn(async () => ({ content: [] })),
			connect: vi.fn(async () => ({ content: [] })),
		});
		const tool = createProxyTool(pi, buildDesc, makeDeps);
		expect(tool.name).toBe("mcp");
		expect(tool.label).toBe("MCP");
		expect(tool.parameters).toBeDefined();
	});

	it("has TypeBox parameters with action field", () => {
		const pi = { sendMessage: vi.fn() };
		const tool = createProxyTool(pi, () => "desc", () => ({
			search: vi.fn(() => ({ content: [] })),
			list: vi.fn(() => ({ content: [] })),
			describe: vi.fn(() => ({ content: [] })),
			status: vi.fn(() => ({ content: [] })),
			call: vi.fn(async () => ({ content: [] })),
			connect: vi.fn(async () => ({ content: [] })),
		}));
		const schema = tool.parameters;
		expect(schema).toHaveProperty("properties");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/proxy-router.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Write proxy-router.ts**

```typescript
import { Type } from "@sinclair/typebox";
import type { ProxyParams, ProxyToolResult } from "./types-proxy.js";
import type { ToolDef } from "./types-tool.js";

export interface ProxyPi {
	sendMessage(msg: { customType: string; content: string; display: boolean }): void;
}

export interface ActionDeps {
	search: (query: string | undefined) => ProxyToolResult;
	list: (server: string | undefined) => ProxyToolResult;
	describe: (tool: string | undefined) => ProxyToolResult;
	status: () => ProxyToolResult;
	call: (tool: string, args?: Record<string, unknown>) => Promise<ProxyToolResult>;
	connect: (server: string | undefined) => Promise<ProxyToolResult>;
}

const ProxySchema = Type.Object({
	action: Type.Union([
		Type.Literal("call"), Type.Literal("list"), Type.Literal("describe"),
		Type.Literal("search"), Type.Literal("status"), Type.Literal("connect"),
	]),
	tool: Type.Optional(Type.String({ description: "Tool name (for call/describe)" })),
	args: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Tool arguments (for call)" })),
	server: Type.Optional(Type.String({ description: "Target server (for list/connect/call)" })),
	query: Type.Optional(Type.String({ description: "Search query (for search)" })),
});

export function routeAction(params: ProxyParams, deps: ActionDeps): Promise<ProxyToolResult> {
	switch (params.action) {
		case "search": return Promise.resolve(deps.search(params.query));
		case "list": return Promise.resolve(deps.list(params.server));
		case "describe": return Promise.resolve(deps.describe(params.tool));
		case "status": return Promise.resolve(deps.status());
		case "connect": return deps.connect(params.server);
		case "call": {
			if (!params.tool) {
				return Promise.resolve(text("Tool name is required for call action."));
			}
			return deps.call(params.tool, params.args);
		}
	}
}

export function createProxyTool(
	_pi: ProxyPi,
	buildDesc: () => string,
	makeDeps: () => ActionDeps,
): ToolDef {
	return {
		name: "mcp",
		label: "MCP",
		description: buildDesc(),
		parameters: ProxySchema,
		execute: async (_toolCallId, params) => {
			const p = params as ProxyParams;
			return routeAction(p, makeDeps());
		},
	};
}

function text(msg: string): ProxyToolResult {
	return { content: [{ type: "text", text: msg }] };
}
```

Note: `params as ProxyParams` is allowed -- only `as any/unknown/never` is forbidden.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/proxy-router.test.ts
```

Expected: PASS (9 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/proxy-router.ts tests/proxy-router.test.ts
git commit -m "mcp: proxy-router (TypeBox tool definition + action dispatch)"
```

---

### Task 7: Full test suite + architecture verification

- [ ] **Step 1: Run full test suite for proxy modules**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/proxy-description.test.ts tests/proxy-search.test.ts tests/proxy-query.test.ts tests/proxy-call.test.ts tests/proxy-call-errors.test.ts tests/proxy-router.test.ts
```

Expected: ALL tests pass (33+ tests across 6 files)

- [ ] **Step 2: Run build**

```bash
cd 01_EXTENSIONS/mcp && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Run Go architecture tests**

```bash
cd /Users/me/Desktop/pi && go test ./00_ARCHITECTURE/tests/ -v -count=1
```

Expected: ALL tests pass. Every `.ts` file is under 99 lines, no `as any/unknown/never`, no `ExtensionAPI` outside index.ts.

- [ ] **Step 4: Commit**

```bash
cd 01_EXTENSIONS/mcp && git add -A && git commit -m "mcp: Plan 7 Proxy Tool complete (5 modules, 7 test files)"
```
