# MCP Extension Plan 6: Tool Management

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 5 tool management modules: collision detection, metadata building, direct tool resolution, direct tool registration with executors, and resource-to-tool conversion.

**Architecture:** 5 modules forming a pipeline: tool-collision (leaf) -> tool-metadata (uses pagination) -> tool-direct (uses collision) -> tool-direct-register (uses content-transform, consent) -> tool-resource (uses collision). All use dependency injection. Every file <= 99 lines.

**Tech Stack:** TypeScript, Vitest

**Prerequisites:**
- Plan 1 (Foundation) completed: types-tool.ts, types-config.ts, types-server.ts, constants.ts, content-transform.ts
- Plan 3 (Server) types available: ServerConnection, McpClient for executor

**NOTE:** This plan executes BEFORE Plan 5 (Lifecycle) because lifecycle-init depends on tool management modules.

---

### Task 1: tool-collision.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/tool-collision.ts`
- Create: `01_EXTENSIONS/mcp/tests/tool-collision.test.ts`

Builtin tool name protection and cross-server deduplication. First-come-first-served strategy. If a `none`-prefix tool collides, the second tool gets forced `server` prefix with warning.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { checkCollision, applyPrefix } from "../src/tool-collision.js";

describe("applyPrefix", () => {
	it("server prefix: servername_toolname", () => {
		expect(applyPrefix("myserver", "mytool", "server")).toBe("myserver_mytool");
	});
	it("short prefix: first 2 chars + _toolname", () => {
		expect(applyPrefix("myserver", "mytool", "short")).toBe("my_mytool");
	});
	it("none prefix: toolname only", () => {
		expect(applyPrefix("myserver", "mytool", "none")).toBe("mytool");
	});
	it("short prefix with 1-char server name", () => {
		expect(applyPrefix("s", "tool", "short")).toBe("s_tool");
	});
});

describe("checkCollision", () => {
	it("no collision for new name", () => {
		const result = checkCollision("newtool", new Set(), vi.fn());
		expect(result).toEqual({ collision: false });
	});
	it("detects builtin collision", () => {
		const warn = vi.fn();
		const result = checkCollision("read", new Set(), warn);
		expect(result).toEqual({ collision: true, reason: "builtin" });
		expect(warn).toHaveBeenCalled();
	});
	it("detects all builtin names", () => {
		const builtins = ["read", "bash", "edit", "write", "grep", "find", "ls", "mcp"];
		for (const name of builtins) {
			const r = checkCollision(name, new Set(), vi.fn());
			expect(r.collision).toBe(true);
		}
	});
	it("detects cross-server collision", () => {
		const warn = vi.fn();
		const registered = new Set(["mytool"]);
		const result = checkCollision("mytool", registered, warn);
		expect(result).toEqual({ collision: true, reason: "duplicate" });
		expect(warn).toHaveBeenCalled();
	});
	it("no collision if name not in registered set", () => {
		const result = checkCollision("unique", new Set(["other"]), vi.fn());
		expect(result).toEqual({ collision: false });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/tool-collision.test.ts
```

Expected: FAIL (tool-collision not found)

- [ ] **Step 3: Write tool-collision.ts**

```typescript
import type { ToolPrefix } from "./types-config.js";
import { BUILTIN_TOOL_NAMES } from "./constants.js";

export interface CollisionResult {
	collision: boolean;
	reason?: "builtin" | "duplicate";
}

type WarnFn = (msg: string) => void;

export function applyPrefix(
	serverName: string,
	toolName: string,
	strategy: ToolPrefix,
): string {
	switch (strategy) {
		case "server":
			return `${serverName}_${toolName}`;
		case "short":
			return `${serverName.slice(0, 2)}_${toolName}`;
		case "none":
			return toolName;
	}
}

export function checkCollision(
	name: string,
	registered: Set<string>,
	warn: WarnFn,
): CollisionResult {
	if (BUILTIN_TOOL_NAMES.has(name)) {
		warn(`Skipping tool "${name}": conflicts with builtin tool`);
		return { collision: true, reason: "builtin" };
	}
	if (registered.has(name)) {
		warn(`Tool "${name}" already registered by another server`);
		return { collision: true, reason: "duplicate" };
	}
	return { collision: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/tool-collision.test.ts
```

Expected: PASS (9 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/tool-collision.ts tests/tool-collision.test.ts
git commit -m "mcp: tool-collision (builtin protection + cross-server dedup)"
```

---

### Task 2: tool-metadata.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/tool-metadata.ts`
- Create: `01_EXTENSIONS/mcp/tests/tool-metadata.test.ts`

Builds ToolMetadata arrays from server tool and resource discovery results. Uses paginated listTools/listResources to collect all tools and resources.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { buildToolMetadata, buildResourceMetadata } from "../src/tool-metadata.js";
import type { McpClient } from "../src/types-server.js";

function mockClient(
	tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>,
	resources: Array<{ uri: string; name: string; description?: string; mimeType?: string }>,
): McpClient {
	return {
		listTools: vi.fn().mockResolvedValue({ tools, nextCursor: undefined }),
		listResources: vi.fn().mockResolvedValue({ resources, nextCursor: undefined }),
		callTool: vi.fn(),
		readResource: vi.fn(),
		ping: vi.fn(),
		close: vi.fn(),
	};
}

describe("buildToolMetadata", () => {
	it("builds metadata from tools list", async () => {
		const client = mockClient(
			[{ name: "search", description: "Search the web" }], [],
		);
		const result = await buildToolMetadata(client, "myserver");
		expect(result).toEqual([{
			name: "search", originalName: "search",
			serverName: "myserver", description: "Search the web",
			inputSchema: undefined,
		}]);
	});
	it("includes inputSchema when present", async () => {
		const schema = { type: "object", properties: { q: { type: "string" } } };
		const client = mockClient([{ name: "t1", inputSchema: schema }], []);
		const result = await buildToolMetadata(client, "s");
		expect(result[0].inputSchema).toEqual(schema);
	});
	it("handles empty tools list", async () => {
		const client = mockClient([], []);
		const result = await buildToolMetadata(client, "s");
		expect(result).toEqual([]);
	});
	it("uses empty string for missing description", async () => {
		const client = mockClient([{ name: "t1" }], []);
		const result = await buildToolMetadata(client, "s");
		expect(result[0].description).toBe("");
	});
});

describe("buildResourceMetadata", () => {
	it("builds resource metadata with resourceUri", async () => {
		const client = mockClient(
			[], [{ uri: "file:///doc", name: "doc", description: "A doc" }],
		);
		const result = await buildResourceMetadata(client, "srv");
		expect(result).toEqual([{
			name: "doc", originalName: "doc",
			serverName: "srv", description: "A doc",
			resourceUri: "file:///doc",
		}]);
	});
	it("handles empty resources list", async () => {
		const client = mockClient([], []);
		const result = await buildResourceMetadata(client, "s");
		expect(result).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/tool-metadata.test.ts
```

Expected: FAIL (tool-metadata not found)

- [ ] **Step 3: Write tool-metadata.ts**

```typescript
import type { McpClient, McpToolRaw, McpResourceRaw } from "./types-server.js";
import type { ToolMetadata } from "./types-tool.js";

function toolRawToMetadata(raw: McpToolRaw, serverName: string): ToolMetadata {
	return {
		name: raw.name,
		originalName: raw.name,
		serverName,
		description: raw.description ?? "",
		inputSchema: raw.inputSchema,
	};
}

function resourceRawToMetadata(
	raw: McpResourceRaw,
	serverName: string,
): ToolMetadata {
	return {
		name: raw.name,
		originalName: raw.name,
		serverName,
		description: raw.description ?? "",
		resourceUri: raw.uri,
	};
}

export async function buildToolMetadata(
	client: McpClient,
	serverName: string,
): Promise<ToolMetadata[]> {
	const all: ToolMetadata[] = [];
	let cursor: string | undefined;
	do {
		const result = await client.listTools(
			cursor ? { cursor } : undefined,
		);
		for (const tool of result.tools) {
			all.push(toolRawToMetadata(tool, serverName));
		}
		cursor = result.nextCursor;
	} while (cursor);
	return all;
}

export async function buildResourceMetadata(
	client: McpClient,
	serverName: string,
): Promise<ToolMetadata[]> {
	const all: ToolMetadata[] = [];
	let cursor: string | undefined;
	do {
		const result = await client.listResources(
			cursor ? { cursor } : undefined,
		);
		for (const res of result.resources) {
			all.push(resourceRawToMetadata(res, serverName));
		}
		cursor = result.nextCursor;
	} while (cursor);
	return all;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/tool-metadata.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/tool-metadata.ts tests/tool-metadata.test.ts
git commit -m "mcp: tool-metadata (build metadata from server discovery)"
```

---

### Task 3: tool-direct.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/tool-direct.ts`
- Create: `01_EXTENSIONS/mcp/tests/tool-direct.test.ts`

Resolves which tools should be promoted to direct (individual Pi tools). Reads server config directTools setting, MCP_DIRECT_TOOLS env var, and applies collision detection with prefix fallback.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { resolveDirectTools } from "../src/tool-direct.js";
import type { ToolMetadata, DirectToolSpec } from "../src/types-tool.js";
import type { ToolPrefix } from "../src/types-config.js";

const meta = (name: string, server: string): ToolMetadata => ({
	name, originalName: name, serverName: server, description: `${name} desc`,
});

describe("resolveDirectTools", () => {
	it("promotes all tools when directTools is true", () => {
		const tools = [meta("search", "s1"), meta("fetch", "s1")];
		const result = resolveDirectTools(tools, true, "server", new Set(), vi.fn());
		expect(result).toHaveLength(2);
		expect(result[0].prefixedName).toBe("s1_search");
	});
	it("promotes only listed tools when directTools is string[]", () => {
		const tools = [meta("search", "s1"), meta("fetch", "s1")];
		const result = resolveDirectTools(tools, ["search"], "server", new Set(), vi.fn());
		expect(result).toHaveLength(1);
		expect(result[0].originalName).toBe("search");
	});
	it("returns empty when directTools is false", () => {
		const result = resolveDirectTools([meta("t", "s")], false, "server", new Set(), vi.fn());
		expect(result).toEqual([]);
	});
	it("applies none prefix", () => {
		const tools = [meta("search", "s1")];
		const result = resolveDirectTools(tools, true, "none", new Set(), vi.fn());
		expect(result[0].prefixedName).toBe("search");
	});
	it("falls back to server prefix on collision with none", () => {
		const registered = new Set(["search"]);
		const warn = vi.fn();
		const tools = [meta("search", "s1")];
		const result = resolveDirectTools(tools, true, "none", registered, warn);
		expect(result[0].prefixedName).toBe("s1_search");
		expect(warn).toHaveBeenCalled();
	});
	it("skips builtin-colliding tools", () => {
		const tools = [meta("read", "s1")];
		const result = resolveDirectTools(tools, true, "none", new Set(), vi.fn());
		expect(result).toEqual([]);
	});
	it("skips builtin-colliding tools even with server prefix", () => {
		const tools = [meta("bash", "bash")];
		const result = resolveDirectTools(tools, true, "server", new Set(), vi.fn());
		expect(result[0].prefixedName).toBe("bash_bash");
	});
	it("preserves inputSchema and resourceUri", () => {
		const t: ToolMetadata = {
			...meta("t", "s"), inputSchema: { type: "object" }, resourceUri: "file:///a",
		};
		const result = resolveDirectTools([t], true, "server", new Set(), vi.fn());
		expect(result[0].inputSchema).toEqual({ type: "object" });
		expect(result[0].resourceUri).toBe("file:///a");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/tool-direct.test.ts
```

Expected: FAIL (tool-direct not found)

- [ ] **Step 3: Write tool-direct.ts**

```typescript
import type { ToolPrefix } from "./types-config.js";
import type { ToolMetadata, DirectToolSpec } from "./types-tool.js";
import { applyPrefix, checkCollision } from "./tool-collision.js";

type WarnFn = (msg: string) => void;

function shouldPromote(
	tool: ToolMetadata,
	directTools: boolean | string[],
): boolean {
	if (directTools === false) return false;
	if (directTools === true) return true;
	return directTools.includes(tool.originalName);
}

function resolveOneTool(
	tool: ToolMetadata,
	prefix: ToolPrefix,
	registered: Set<string>,
	warn: WarnFn,
): DirectToolSpec | null {
	let prefixed = applyPrefix(tool.serverName, tool.originalName, prefix);
	const check = checkCollision(prefixed, registered, warn);
	if (check.reason === "builtin") {
		if (prefix === "none") {
			prefixed = applyPrefix(tool.serverName, tool.originalName, "server");
			const recheck = checkCollision(prefixed, registered, warn);
			if (recheck.collision) return null;
		} else {
			return null;
		}
	} else if (check.reason === "duplicate") {
		if (prefix === "none") {
			prefixed = applyPrefix(tool.serverName, tool.originalName, "server");
			const recheck = checkCollision(prefixed, registered, warn);
			if (recheck.collision) return null;
		} else {
			return null;
		}
	}
	return {
		serverName: tool.serverName,
		originalName: tool.originalName,
		prefixedName: prefixed,
		description: tool.description,
		inputSchema: tool.inputSchema,
		resourceUri: tool.resourceUri,
	};
}

export function resolveDirectTools(
	tools: ToolMetadata[],
	directTools: boolean | string[],
	prefix: ToolPrefix,
	registered: Set<string>,
	warn: WarnFn,
): DirectToolSpec[] {
	if (directTools === false) return [];
	const result: DirectToolSpec[] = [];
	for (const tool of tools) {
		if (!shouldPromote(tool, directTools)) continue;
		const spec = resolveOneTool(tool, prefix, registered, warn);
		if (spec) {
			registered.add(spec.prefixedName);
			result.push(spec);
		}
	}
	return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/tool-direct.test.ts
```

Expected: PASS (8 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/tool-direct.ts tests/tool-direct.test.ts
git commit -m "mcp: tool-direct (resolve direct tools with collision fallback)"
```

---

### Task 4: tool-direct-register.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/tool-direct-register.ts`
- Create: `01_EXTENSIONS/mcp/tests/tool-direct-register.test.ts`

Creates ToolDef objects for direct tools with executor functions. The executor: 1) gets connection from state, 2) checks consent, 3) calls client.callTool or client.readResource, 4) transforms content.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import {
	createDirectToolDef, createExecutor,
} from "../src/tool-direct-register.js";
import type { DirectToolSpec } from "../src/types-tool.js";

const spec: DirectToolSpec = {
	serverName: "srv", originalName: "search",
	prefixedName: "srv_search", description: "Search tool",
	inputSchema: { type: "object", properties: { q: { type: "string" } } },
};

describe("createDirectToolDef", () => {
	it("creates ToolDef with correct name and description", () => {
		const executor = vi.fn();
		const def = createDirectToolDef(spec, executor);
		expect(def.name).toBe("srv_search");
		expect(def.label).toBe("srv_search");
		expect(def.description).toBe("Search tool");
		expect(def.parameters).toEqual(spec.inputSchema);
	});
	it("uses empty object for missing inputSchema", () => {
		const noSchema: DirectToolSpec = { ...spec, inputSchema: undefined };
		const def = createDirectToolDef(noSchema, vi.fn());
		expect(def.parameters).toEqual({
			type: "object", properties: {},
		});
	});
});

describe("createExecutor", () => {
	it("calls client.callTool for regular tools", async () => {
		const content = [{ type: "text", text: "result" }];
		const client = {
			callTool: vi.fn().mockResolvedValue({ content }),
			readResource: vi.fn(), listTools: vi.fn(),
			listResources: vi.fn(), ping: vi.fn(), close: vi.fn(),
		};
		const getConn = vi.fn().mockReturnValue({
			name: "srv", client, transport: { close: vi.fn() },
			status: "connected", lastUsedAt: 0, inFlight: 0,
		});
		const consent = vi.fn().mockResolvedValue(true);
		const exec = createExecutor(spec, getConn, consent);
		const result = await exec("id1", { q: "test" }, undefined, vi.fn(), {});
		expect(client.callTool).toHaveBeenCalledWith({
			name: "search", arguments: { q: "test" },
		});
		expect(result.content[0].text).toBe("result");
	});
	it("calls client.readResource for resource tools", async () => {
		const resSpec: DirectToolSpec = {
			...spec, resourceUri: "file:///doc",
		};
		const client = {
			callTool: vi.fn(),
			readResource: vi.fn().mockResolvedValue({
				contents: [{ uri: "file:///doc", text: "doc content" }],
			}),
			listTools: vi.fn(), listResources: vi.fn(),
			ping: vi.fn(), close: vi.fn(),
		};
		const getConn = vi.fn().mockReturnValue({
			name: "srv", client, transport: { close: vi.fn() },
			status: "connected", lastUsedAt: 0, inFlight: 0,
		});
		const consent = vi.fn().mockResolvedValue(true);
		const exec = createExecutor(resSpec, getConn, consent);
		const result = await exec("id2", {}, undefined, vi.fn(), {});
		expect(client.readResource).toHaveBeenCalledWith({ uri: "file:///doc" });
		expect(result.content[0].text).toContain("doc content");
	});
	it("throws when consent denied", async () => {
		const getConn = vi.fn().mockReturnValue({
			name: "srv", client: { callTool: vi.fn() },
			transport: { close: vi.fn() },
			status: "connected", lastUsedAt: 0, inFlight: 0,
		});
		const consent = vi.fn().mockResolvedValue(false);
		const exec = createExecutor(spec, getConn, consent);
		await expect(exec("id", {}, undefined, vi.fn(), {})).rejects.toThrow(
			"consent",
		);
	});
	it("throws when connection not found", async () => {
		const getConn = vi.fn().mockReturnValue(undefined);
		const consent = vi.fn().mockResolvedValue(true);
		const exec = createExecutor(spec, getConn, consent);
		await expect(exec("id", {}, undefined, vi.fn(), {})).rejects.toThrow(
			"not connected",
		);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/tool-direct-register.test.ts
```

Expected: FAIL (tool-direct-register not found)

- [ ] **Step 3: Write tool-direct-register.ts**

```typescript
import type { DirectToolSpec, ToolDef, ToolExecuteFn, ToolResult } from "./types-tool.js";
import type { ServerConnection } from "./types-server.js";
import { transformContent } from "./content-transform.js";

type GetConnFn = (name: string) => ServerConnection | undefined;
type ConsentFn = (server: string) => Promise<boolean>;

function transformContents(
	contents: Array<{ uri: string; text?: string; blob?: string; mimeType?: string }>,
): ToolResult {
	const blocks = contents.map((c) =>
		transformContent({
			type: "resource",
			resource: { uri: c.uri, text: c.text, blob: c.blob },
		}),
	);
	return { content: blocks };
}

export function createExecutor(
	spec: DirectToolSpec,
	getConn: GetConnFn,
	consent: ConsentFn,
): ToolExecuteFn {
	return async (_callId, params, _signal, _onUpdate, _ctx) => {
		const conn = getConn(spec.serverName);
		if (!conn) throw new Error(`Server "${spec.serverName}" not connected`);
		const allowed = await consent(spec.serverName);
		if (!allowed) throw new Error(`Tool execution denied: consent required`);
		if (spec.resourceUri) {
			const res = await conn.client.readResource({ uri: spec.resourceUri });
			return transformContents(res.contents);
		}
		const res = await conn.client.callTool({
			name: spec.originalName,
			arguments: params,
		});
		return {
			content: res.content.map((c) => transformContent(c)),
		};
	};
}

export function createDirectToolDef(
	spec: DirectToolSpec,
	executor: ToolExecuteFn,
): ToolDef {
	return {
		name: spec.prefixedName,
		label: spec.prefixedName,
		description: spec.description,
		parameters: spec.inputSchema ?? { type: "object", properties: {} },
		execute: executor,
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/tool-direct-register.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/tool-direct-register.ts tests/tool-direct-register.test.ts
git commit -m "mcp: tool-direct-register (ToolDef creation + executor with consent)"
```

---

### Task 5: tool-resource.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/tool-resource.ts`
- Create: `01_EXTENSIONS/mcp/tests/tool-resource.test.ts`

Converts MCP resources to `get_`-prefixed tool definitions. Controlled by `exposeResources` config (default true). Resource tools use readResource under the hood.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { buildResourceToolSpecs } from "../src/tool-resource.js";
import type { ToolMetadata } from "../src/types-tool.js";
import type { ToolPrefix } from "../src/types-config.js";

const resMeta = (name: string, uri: string, server: string): ToolMetadata => ({
	name, originalName: name, serverName: server,
	description: `Resource: ${name}`, resourceUri: uri,
});

describe("buildResourceToolSpecs", () => {
	it("converts resources to get_-prefixed specs", () => {
		const resources = [resMeta("readme", "file:///readme", "s1")];
		const result = buildResourceToolSpecs(
			resources, "server", true, new Set(), vi.fn(),
		);
		expect(result).toHaveLength(1);
		expect(result[0].prefixedName).toBe("s1_get_readme");
		expect(result[0].resourceUri).toBe("file:///readme");
	});
	it("returns empty when exposeResources is false", () => {
		const resources = [resMeta("doc", "file:///doc", "s1")];
		const result = buildResourceToolSpecs(
			resources, "server", false, new Set(), vi.fn(),
		);
		expect(result).toEqual([]);
	});
	it("applies none prefix with get_ prefix", () => {
		const resources = [resMeta("config", "file:///cfg", "s1")];
		const result = buildResourceToolSpecs(
			resources, "none", true, new Set(), vi.fn(),
		);
		expect(result[0].prefixedName).toBe("get_config");
	});
	it("applies short prefix with get_ prefix", () => {
		const resources = [resMeta("data", "file:///d", "myserver")];
		const result = buildResourceToolSpecs(
			resources, "short", true, new Set(), vi.fn(),
		);
		expect(result[0].prefixedName).toBe("my_get_data");
	});
	it("skips resources that collide with builtins", () => {
		const resources = [resMeta("read", "file:///r", "s")];
		const result = buildResourceToolSpecs(
			resources, "none", true, new Set(), vi.fn(),
		);
		expect(result[0].prefixedName).toBe("s_get_read");
	});
	it("falls back to server prefix on collision", () => {
		const registered = new Set(["get_tool"]);
		const warn = vi.fn();
		const resources = [resMeta("tool", "file:///t", "s1")];
		const result = buildResourceToolSpecs(
			resources, "none", true, registered, warn,
		);
		expect(result[0].prefixedName).toBe("s1_get_tool");
		expect(warn).toHaveBeenCalled();
	});
	it("skips on double collision", () => {
		const registered = new Set(["get_tool", "s1_get_tool"]);
		const resources = [resMeta("tool", "file:///t", "s1")];
		const result = buildResourceToolSpecs(
			resources, "none", true, registered, vi.fn(),
		);
		expect(result).toEqual([]);
	});
	it("defaults exposeResources to true", () => {
		const resources = [resMeta("doc", "file:///d", "s1")];
		const result = buildResourceToolSpecs(
			resources, "server", undefined, new Set(), vi.fn(),
		);
		expect(result).toHaveLength(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/tool-resource.test.ts
```

Expected: FAIL (tool-resource not found)

- [ ] **Step 3: Write tool-resource.ts**

```typescript
import type { ToolPrefix } from "./types-config.js";
import type { ToolMetadata, DirectToolSpec } from "./types-tool.js";
import { applyPrefix, checkCollision } from "./tool-collision.js";

type WarnFn = (msg: string) => void;

function makeResourceName(
	serverName: string,
	resourceName: string,
	prefix: ToolPrefix,
): string {
	const getN = `get_${resourceName}`;
	return applyPrefix(serverName, getN, prefix);
}

function tryRegister(
	name: string,
	serverFallback: string,
	resourceName: string,
	prefix: ToolPrefix,
	registered: Set<string>,
	warn: WarnFn,
): string | null {
	const check = checkCollision(name, registered, warn);
	if (!check.collision) return name;
	if (prefix === "none") {
		const fallback = applyPrefix(
			serverFallback, `get_${resourceName}`, "server",
		);
		const recheck = checkCollision(fallback, registered, warn);
		if (!recheck.collision) return fallback;
	}
	return null;
}

export function buildResourceToolSpecs(
	resources: ToolMetadata[],
	prefix: ToolPrefix,
	exposeResources: boolean | undefined,
	registered: Set<string>,
	warn: WarnFn,
): DirectToolSpec[] {
	if (exposeResources === false) return [];
	const result: DirectToolSpec[] = [];
	for (const res of resources) {
		if (!res.resourceUri) continue;
		const name = makeResourceName(res.serverName, res.originalName, prefix);
		const resolved = tryRegister(
			name, res.serverName, res.originalName, prefix, registered, warn,
		);
		if (!resolved) continue;
		registered.add(resolved);
		result.push({
			serverName: res.serverName,
			originalName: res.originalName,
			prefixedName: resolved,
			description: res.description,
			resourceUri: res.resourceUri,
		});
	}
	return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/tool-resource.test.ts
```

Expected: PASS (8 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/tool-resource.ts tests/tool-resource.test.ts
git commit -m "mcp: tool-resource (resource to get_-prefixed tool conversion)"
```

---

### Task 6: MCP_DIRECT_TOOLS env var integration test

**Files:**
- Create: `01_EXTENSIONS/mcp/tests/tool-direct-env.test.ts`

Tests the `MCP_DIRECT_TOOLS` env var parsing that feeds into tool-direct.ts. The env var is parsed externally and passed as config; this test verifies the parsing logic.

- [ ] **Step 1: Write the test**

```typescript
import { describe, expect, it } from "vitest";
import { parseDirectToolsEnv } from "../src/tool-direct.js";

describe("parseDirectToolsEnv", () => {
	it("returns undefined when env var not set", () => {
		expect(parseDirectToolsEnv(undefined)).toBeUndefined();
	});
	it("returns false for __none__", () => {
		expect(parseDirectToolsEnv("__none__")).toBe(false);
	});
	it("parses server-level directive", () => {
		const result = parseDirectToolsEnv("myserver");
		expect(result).toEqual(
			new Map([["myserver", true]]),
		);
	});
	it("parses server/tool directive", () => {
		const result = parseDirectToolsEnv("myserver/search");
		expect(result).toEqual(
			new Map([["myserver", ["search"]]]),
		);
	});
	it("parses multiple comma-separated directives", () => {
		const result = parseDirectToolsEnv("s1,s2/tool1,s2/tool2");
		expect(result).toEqual(
			new Map([["s1", true], ["s2", ["tool1", "tool2"]]]),
		);
	});
	it("trims whitespace", () => {
		const result = parseDirectToolsEnv(" s1 , s2/tool ");
		expect(result).toEqual(
			new Map([["s1", true], ["s2", ["tool"]]]),
		);
	});
	it("returns empty map for empty string", () => {
		expect(parseDirectToolsEnv("")).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/tool-direct-env.test.ts
```

Expected: FAIL (parseDirectToolsEnv not found)

- [ ] **Step 3: Add parseDirectToolsEnv to tool-direct.ts**

Append the following to `tool-direct.ts` (the file must stay under 99 lines):

```typescript
export function parseDirectToolsEnv(
	envVal: string | undefined,
): false | Map<string, boolean | string[]> | undefined {
	if (!envVal || envVal.trim() === "") return undefined;
	if (envVal === "__none__") return false;
	const map = new Map<string, boolean | string[]>();
	for (const part of envVal.split(",")) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		const slashIdx = trimmed.indexOf("/");
		if (slashIdx === -1) {
			map.set(trimmed, true);
		} else {
			const server = trimmed.slice(0, slashIdx);
			const tool = trimmed.slice(slashIdx + 1);
			const existing = map.get(server);
			if (Array.isArray(existing)) {
				existing.push(tool);
			} else {
				map.set(server, [tool]);
			}
		}
	}
	return map;
}
```

After this addition, `tool-direct.ts` will be at approximately 93 lines total. Verify:

```bash
wc -l 01_EXTENSIONS/mcp/src/tool-direct.ts
```

Must be <= 99 lines.

- [ ] **Step 4: Run all tool-direct tests to verify they pass**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/tool-direct.test.ts tests/tool-direct-env.test.ts
```

Expected: PASS (15 tests total)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/tool-direct.ts tests/tool-direct-env.test.ts
git commit -m "mcp: parseDirectToolsEnv (MCP_DIRECT_TOOLS env var support)"
```

---

### Task 7: Pagination edge case test for tool-metadata

**Files:**
- Create: `01_EXTENSIONS/mcp/tests/tool-metadata-pagination.test.ts`

Verifies that buildToolMetadata and buildResourceMetadata correctly handle cursor-based pagination across multiple pages.

- [ ] **Step 1: Write the test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { buildToolMetadata, buildResourceMetadata } from "../src/tool-metadata.js";
import type { McpClient } from "../src/types-server.js";

describe("buildToolMetadata pagination", () => {
	it("collects tools across multiple pages", async () => {
		const client: McpClient = {
			listTools: vi.fn()
				.mockResolvedValueOnce({
					tools: [{ name: "t1", description: "first" }],
					nextCursor: "page2",
				})
				.mockResolvedValueOnce({
					tools: [{ name: "t2", description: "second" }],
					nextCursor: undefined,
				}),
			listResources: vi.fn().mockResolvedValue({ resources: [] }),
			callTool: vi.fn(), readResource: vi.fn(),
			ping: vi.fn(), close: vi.fn(),
		};
		const result = await buildToolMetadata(client, "srv");
		expect(result).toHaveLength(2);
		expect(result[0].name).toBe("t1");
		expect(result[1].name).toBe("t2");
		expect(client.listTools).toHaveBeenCalledTimes(2);
		expect(client.listTools).toHaveBeenCalledWith({ cursor: "page2" });
	});
});

describe("buildResourceMetadata pagination", () => {
	it("collects resources across multiple pages", async () => {
		const client: McpClient = {
			listResources: vi.fn()
				.mockResolvedValueOnce({
					resources: [{ uri: "f:///a", name: "a", description: "A" }],
					nextCursor: "pg2",
				})
				.mockResolvedValueOnce({
					resources: [{ uri: "f:///b", name: "b" }],
					nextCursor: undefined,
				}),
			listTools: vi.fn().mockResolvedValue({ tools: [] }),
			callTool: vi.fn(), readResource: vi.fn(),
			ping: vi.fn(), close: vi.fn(),
		};
		const result = await buildResourceMetadata(client, "srv");
		expect(result).toHaveLength(2);
		expect(result[0].resourceUri).toBe("f:///a");
		expect(result[1].resourceUri).toBe("f:///b");
		expect(result[1].description).toBe("");
	});
});
```

- [ ] **Step 2: Run test**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/tool-metadata-pagination.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 3: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add tests/tool-metadata-pagination.test.ts
git commit -m "mcp: tool-metadata pagination edge case tests"
```

---

### Task 8: Full suite verification and Go architecture tests

- [ ] **Step 1: Run full test suite with coverage**

```bash
cd 01_EXTENSIONS/mcp && npm test
```

Expected: All tests pass. Coverage thresholds met (100% on all non-index tool management files).

Check coverage specifically for the 5 new modules:

```bash
cd 01_EXTENSIONS/mcp && npx vitest run --coverage 2>&1 | grep -E "tool-(collision|metadata|direct|resource)"
```

All 5 files should show 100% coverage on lines/branches/functions/statements.

- [ ] **Step 2: Verify line counts**

```bash
wc -l 01_EXTENSIONS/mcp/src/tool-collision.ts 01_EXTENSIONS/mcp/src/tool-metadata.ts 01_EXTENSIONS/mcp/src/tool-direct.ts 01_EXTENSIONS/mcp/src/tool-direct-register.ts 01_EXTENSIONS/mcp/src/tool-resource.ts
```

All files must be <= 99 lines.

Also verify test files:

```bash
wc -l 01_EXTENSIONS/mcp/tests/tool-collision.test.ts 01_EXTENSIONS/mcp/tests/tool-metadata.test.ts 01_EXTENSIONS/mcp/tests/tool-direct.test.ts 01_EXTENSIONS/mcp/tests/tool-direct-register.test.ts 01_EXTENSIONS/mcp/tests/tool-resource.test.ts 01_EXTENSIONS/mcp/tests/tool-direct-env.test.ts 01_EXTENSIONS/mcp/tests/tool-metadata-pagination.test.ts
```

All test files must be <= 99 lines.

- [ ] **Step 3: Run Go architecture tests**

```bash
cd /Users/me/Desktop/pi && go test ./00_ARCHITECTURE/tests/ -v -count=1
```

Expected: ALL tests pass. Every `.ts` file is under 99 lines, no `as any/unknown/never`, no `ExtensionAPI` outside index.ts.

- [ ] **Step 4: Final commit**

```bash
cd 01_EXTENSIONS/mcp && git add -A && git commit -m "mcp: Plan 6 Tool Management complete (5 modules)"
```

---

## Module Summary

| File | Lines (est.) | Purpose |
|------|------|---------|
| `src/tool-collision.ts` | 39 | Builtin protection + cross-server dedup |
| `src/tool-metadata.ts` | 50 | Build ToolMetadata from server discovery |
| `src/tool-direct.ts` | 93 | Resolve direct tools + env var parsing |
| `src/tool-direct-register.ts` | 50 | ToolDef creation + executor with consent |
| `src/tool-resource.ts` | 52 | Resource -> get_-prefixed tool specs |

| Test File | Tests (est.) |
|-----------|------|
| `tests/tool-collision.test.ts` | 9 |
| `tests/tool-metadata.test.ts` | 6 |
| `tests/tool-direct.test.ts` | 8 |
| `tests/tool-direct-register.test.ts` | 6 |
| `tests/tool-resource.test.ts` | 8 |
| `tests/tool-direct-env.test.ts` | 7 |
| `tests/tool-metadata-pagination.test.ts` | 2 |

**Total: 5 source files, 7 test files, ~46 tests**

## Dependency Graph

```
constants.ts, types-config.ts, types-tool.ts, types-server.ts  (Plan 1)
  |
  v
tool-collision.ts  (leaf: uses constants + types-config)
  |
  +---> tool-direct.ts  (uses tool-collision + types)
  |       |
  |       v
  |     tool-direct-register.ts  (uses types-tool, types-server, content-transform)
  |
  +---> tool-resource.ts  (uses tool-collision + types)
  |
tool-metadata.ts  (uses types-server, types-tool; paginated discovery)
```

All modules follow dependency injection. No module imports `ExtensionAPI`. No `as any/unknown/never` assertions.
