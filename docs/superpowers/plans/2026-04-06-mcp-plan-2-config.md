# MCP Extension Plan 2: Config

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 5 config modules that load, merge, hash, import, and write MCP server configuration. These modules feed into lifecycle-init (Plan 3+) and are consumed by every plan that needs config data.

**Architecture:** 5 source modules + 7 test files. All use dependency injection via `FsOps` interface pattern (no direct `fs` imports). Every file <= 99 lines.

**Tech Stack:** TypeScript, Vitest, node:crypto (for hashing)

**Prerequisite:** Plan 1 (Foundation) completed -- depends on `types-config.ts`, `constants.ts`, `errors.ts`.

**Plan 1 types used by this plan:**

```typescript
// From types-config.ts
type ImportKind = "cursor" | "claude-code" | "claude-desktop" | "codex" | "windsurf" | "vscode";
interface ServerEntry { command?: string; args?: string[]; env?: Record<string, string>; cwd?: string; url?: string; headers?: Record<string, string>; auth?: "oauth" | "bearer"; bearerToken?: string; bearerTokenEnv?: string; lifecycle?: LifecycleMode; idleTimeout?: number; directTools?: boolean | string[]; exposeResources?: boolean; debug?: boolean; }
interface McpConfig { mcpServers: Record<string, ServerEntry>; imports?: ImportKind[]; settings?: McpSettings; }
interface ServerProvenance { path: string; kind: "user" | "project" | "import"; importKind?: ImportKind; }

// From constants.ts
const HASH_EXCLUDE_FIELDS: Set<string>; // {"lifecycle", "idleTimeout", "debug"}
const DEFAULT_USER_CONFIG: string;      // "~/.pi/agent/mcp.json"
const DEFAULT_PROJECT_CONFIG: string;   // ".pi/mcp.json"

// From errors.ts
class McpError extends Error { code: string; hint?: string; context: Record<string, string | undefined>; }
function mcpError(code: string, message: string, opts?: McpErrorOpts): McpError;
```

---

### Task 1: config-hash.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/config-hash.ts`
- Create: `01_EXTENSIONS/mcp/tests/config-hash.test.ts`

- [ ] **Step 1: Write the failing test (config-hash.test.ts)**

```typescript
import { describe, expect, it } from "vitest";
import { computeConfigHash } from "../src/config-hash.js";

describe("computeConfigHash", () => {
	it("returns hex string for valid config", () => {
		const hash = computeConfigHash({
			mcpServers: { s1: { command: "echo" } },
		});
		expect(hash).toMatch(/^[a-f0-9]{64}$/);
	});

	it("excludes lifecycle field from hash", () => {
		const base = { mcpServers: { s1: { command: "echo" } } };
		const withLifecycle = {
			mcpServers: { s1: { command: "echo", lifecycle: "eager" as const } },
		};
		expect(computeConfigHash(base)).toBe(computeConfigHash(withLifecycle));
	});

	it("excludes idleTimeout field from hash", () => {
		const base = { mcpServers: { s1: { command: "echo" } } };
		const withTimeout = {
			mcpServers: { s1: { command: "echo", idleTimeout: 9999 } },
		};
		expect(computeConfigHash(base)).toBe(computeConfigHash(withTimeout));
	});

	it("excludes debug field from hash", () => {
		const base = { mcpServers: { s1: { command: "echo" } } };
		const withDebug = {
			mcpServers: { s1: { command: "echo", debug: true } },
		};
		expect(computeConfigHash(base)).toBe(computeConfigHash(withDebug));
	});

	it("different commands produce different hashes", () => {
		const a = { mcpServers: { s1: { command: "echo" } } };
		const b = { mcpServers: { s1: { command: "cat" } } };
		expect(computeConfigHash(a)).not.toBe(computeConfigHash(b));
	});

	it("empty mcpServers produces valid hash", () => {
		const hash = computeConfigHash({ mcpServers: {} });
		expect(hash).toMatch(/^[a-f0-9]{64}$/);
	});

	it("server order does not affect hash (sorted keys)", () => {
		const a = { mcpServers: { alpha: { command: "a" }, beta: { command: "b" } } };
		const b = { mcpServers: { beta: { command: "b" }, alpha: { command: "a" } } };
		expect(computeConfigHash(a)).toBe(computeConfigHash(b));
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/config-hash.test.ts
```

Expected: FAIL (computeConfigHash not found)

- [ ] **Step 3: Write config-hash.ts**

```typescript
import { createHash } from "node:crypto";
import type { McpConfig, ServerEntry } from "./types-config.js";
import { HASH_EXCLUDE_FIELDS } from "./constants.js";

function stripExcluded(entry: ServerEntry): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(entry)) {
		if (!HASH_EXCLUDE_FIELDS.has(key)) {
			result[key] = value;
		}
	}
	return result;
}

function stableStringify(config: McpConfig): string {
	const sorted: Record<string, Record<string, unknown>> = {};
	for (const name of Object.keys(config.mcpServers).sort()) {
		sorted[name] = stripExcluded(config.mcpServers[name]);
	}
	return JSON.stringify(sorted);
}

export function computeConfigHash(config: McpConfig): string {
	return createHash("sha256").update(stableStringify(config)).digest("hex");
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/config-hash.test.ts
```

Expected: PASS (7 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/config-hash.ts tests/config-hash.test.ts
git commit -m "mcp: config-hash (SHA-256, excludes lifecycle/debug fields)"
```

---

### Task 2: config-load.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/config-load.ts`
- Create: `01_EXTENSIONS/mcp/tests/config-load.test.ts`
- Create: `01_EXTENSIONS/mcp/tests/config-load-compat.test.ts`

- [ ] **Step 1: Write the failing test (config-load.test.ts)**

```typescript
import { describe, expect, it } from "vitest";
import { loadConfigFile } from "../src/config-load.js";

describe("loadConfigFile", () => {
	it("parses valid mcp.json with mcpServers", () => {
		const json = JSON.stringify({
			mcpServers: { s1: { command: "echo" } },
		});
		const fs = { readFile: () => json, exists: () => true };
		const config = loadConfigFile("/path/mcp.json", fs);
		expect(config.mcpServers.s1.command).toBe("echo");
	});

	it("returns empty config when file does not exist", () => {
		const fs = { readFile: () => "", exists: () => false };
		const config = loadConfigFile("/missing.json", fs);
		expect(Object.keys(config.mcpServers)).toHaveLength(0);
	});

	it("returns empty config for empty file", () => {
		const fs = { readFile: () => "", exists: () => true };
		const config = loadConfigFile("/empty.json", fs);
		expect(Object.keys(config.mcpServers)).toHaveLength(0);
	});

	it("throws McpError on invalid JSON", () => {
		const fs = { readFile: () => "{bad", exists: () => true };
		expect(() => loadConfigFile("/bad.json", fs)).toThrow("config_parse");
	});

	it("preserves imports array", () => {
		const json = JSON.stringify({
			mcpServers: {},
			imports: ["cursor", "vscode"],
		});
		const fs = { readFile: () => json, exists: () => true };
		const config = loadConfigFile("/path/mcp.json", fs);
		expect(config.imports).toEqual(["cursor", "vscode"]);
	});

	it("preserves settings", () => {
		const json = JSON.stringify({
			mcpServers: {},
			settings: { toolPrefix: "server" },
		});
		const fs = { readFile: () => json, exists: () => true };
		const config = loadConfigFile("/path/mcp.json", fs);
		expect(config.settings?.toolPrefix).toBe("server");
	});
});
```

- [ ] **Step 2: Write the failing compat test (config-load-compat.test.ts)**

```typescript
import { describe, expect, it } from "vitest";
import { loadConfigFile } from "../src/config-load.js";

describe("config-load field compatibility", () => {
	it("accepts mcp-servers as alias for mcpServers", () => {
		const json = JSON.stringify({
			"mcp-servers": { s1: { command: "echo" } },
		});
		const fs = { readFile: () => json, exists: () => true };
		const config = loadConfigFile("/path/mcp.json", fs);
		expect(config.mcpServers.s1.command).toBe("echo");
	});

	it("mcpServers takes precedence over mcp-servers", () => {
		const json = JSON.stringify({
			mcpServers: { a: { command: "first" } },
			"mcp-servers": { b: { command: "second" } },
		});
		const fs = { readFile: () => json, exists: () => true };
		const config = loadConfigFile("/path/mcp.json", fs);
		expect(config.mcpServers.a).toBeDefined();
		expect(config.mcpServers.b).toBeUndefined();
	});

	it("handles config with no server key at all", () => {
		const json = JSON.stringify({ settings: { consent: "never" } });
		const fs = { readFile: () => json, exists: () => true };
		const config = loadConfigFile("/path/mcp.json", fs);
		expect(Object.keys(config.mcpServers)).toHaveLength(0);
	});

	it("handles top-level object with only mcp-servers", () => {
		const json = JSON.stringify({
			"mcp-servers": { x: { url: "http://localhost" } },
		});
		const fs = { readFile: () => json, exists: () => true };
		const config = loadConfigFile("/path/mcp.json", fs);
		expect(config.mcpServers.x.url).toBe("http://localhost");
	});
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/config-load.test.ts tests/config-load-compat.test.ts
```

Expected: FAIL (loadConfigFile not found)

- [ ] **Step 4: Write config-load.ts**

```typescript
import type { McpConfig } from "./types-config.js";
import { mcpError } from "./errors.js";

export interface ConfigFsOps {
	readFile(path: string): string;
	exists(path: string): boolean;
}

const EMPTY_CONFIG: McpConfig = { mcpServers: {} };

interface RawConfig {
	mcpServers?: Record<string, unknown>;
	"mcp-servers"?: Record<string, unknown>;
	imports?: string[];
	settings?: Record<string, unknown>;
}

export function loadConfigFile(path: string, fs: ConfigFsOps): McpConfig {
	if (!fs.exists(path)) return { ...EMPTY_CONFIG };
	const raw = fs.readFile(path);
	if (!raw.trim()) return { ...EMPTY_CONFIG };
	let parsed: RawConfig;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw mcpError("config_parse", `Invalid JSON in ${path}`, {
			hint: "Check the config file for syntax errors",
		});
	}
	return normalizeConfig(parsed);
}

function normalizeConfig(raw: RawConfig): McpConfig {
	const servers = raw.mcpServers ?? raw["mcp-servers"] ?? {};
	return {
		mcpServers: servers as McpConfig["mcpServers"],
		imports: raw.imports as McpConfig["imports"],
		settings: raw.settings as McpConfig["settings"],
	};
}
```

Note: `as McpConfig["mcpServers"]` is allowed -- the Go test regex `\bas\s+(any|unknown|never)\b` only matches `as any`, `as unknown`, `as never`.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/config-load.test.ts tests/config-load-compat.test.ts
```

Expected: PASS (10 tests total)

- [ ] **Step 6: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/config-load.ts tests/config-load.test.ts tests/config-load-compat.test.ts
git commit -m "mcp: config-load (JSON parsing, mcp-servers compat)"
```

---

### Task 3: config-imports.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/config-imports.ts`
- Create: `01_EXTENSIONS/mcp/tests/config-imports.test.ts`
- Create: `01_EXTENSIONS/mcp/tests/config-imports-platforms.test.ts`

- [ ] **Step 1: Write the failing test (config-imports.test.ts)**

```typescript
import { describe, expect, it } from "vitest";
import { loadImportedConfigs, getImportPath } from "../src/config-imports.js";
import type { ConfigFsOps } from "../src/config-load.js";

describe("getImportPath", () => {
	it("returns darwin path for cursor", () => {
		const p = getImportPath("cursor", "darwin", "/Users/me");
		expect(p).toBe("/Users/me/.cursor/mcp.json");
	});

	it("returns darwin path for claude-code", () => {
		const p = getImportPath("claude-code", "darwin", "/Users/me");
		expect(p).toBe("/Users/me/.claude/mcp.json");
	});

	it("returns darwin path for claude-desktop", () => {
		const p = getImportPath("claude-desktop", "darwin", "/Users/me");
		expect(p).toContain("Claude");
	});

	it("returns linux path for codex", () => {
		const p = getImportPath("codex", "linux", "/home/me");
		expect(p).toBe("/home/me/.codex/mcp.json");
	});

	it("returns win32 path for windsurf", () => {
		const p = getImportPath("windsurf", "win32", "C:\\Users\\me");
		expect(p).toContain("Windsurf");
	});

	it("returns darwin path for vscode", () => {
		const p = getImportPath("vscode", "darwin", "/Users/me");
		expect(p).toContain("Code");
	});
});

describe("loadImportedConfigs", () => {
	it("loads servers from imported tool configs", () => {
		const json = JSON.stringify({ mcpServers: { s1: { command: "echo" } } });
		const fs: ConfigFsOps = { readFile: () => json, exists: () => true };
		const result = loadImportedConfigs(["cursor"], fs, "darwin", "/Users/me");
		expect(result.servers.s1).toBeDefined();
		expect(result.provenance.s1.kind).toBe("import");
		expect(result.provenance.s1.importKind).toBe("cursor");
	});

	it("first import wins for same server name", () => {
		const cursorJson = JSON.stringify({ mcpServers: { s1: { command: "first" } } });
		const vscodeJson = JSON.stringify({ mcpServers: { s1: { command: "second" } } });
		let callCount = 0;
		const fs: ConfigFsOps = {
			readFile: () => { callCount++; return callCount === 1 ? cursorJson : vscodeJson; },
			exists: () => true,
		};
		const result = loadImportedConfigs(["cursor", "vscode"], fs, "darwin", "/Users/me");
		expect(result.servers.s1.command).toBe("first");
	});

	it("skips missing config files", () => {
		const fs: ConfigFsOps = { readFile: () => "", exists: () => false };
		const result = loadImportedConfigs(["cursor"], fs, "darwin", "/Users/me");
		expect(Object.keys(result.servers)).toHaveLength(0);
	});

	it("returns empty for empty imports array", () => {
		const fs: ConfigFsOps = { readFile: () => "", exists: () => false };
		const result = loadImportedConfigs([], fs, "darwin", "/Users/me");
		expect(Object.keys(result.servers)).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Write the failing platform test (config-imports-platforms.test.ts)**

```typescript
import { describe, expect, it } from "vitest";
import { getImportPath } from "../src/config-imports.js";

describe("config-imports platform paths", () => {
	const home = "/Users/me";
	const linuxHome = "/home/me";
	const winHome = "C:\\Users\\me";

	it("cursor darwin", () => {
		expect(getImportPath("cursor", "darwin", home)).toBe(`${home}/.cursor/mcp.json`);
	});
	it("cursor linux", () => {
		expect(getImportPath("cursor", "linux", linuxHome)).toBe(`${linuxHome}/.cursor/mcp.json`);
	});
	it("cursor win32", () => {
		expect(getImportPath("cursor", "win32", winHome)).toBe(`${winHome}\\.cursor\\mcp.json`);
	});

	it("claude-code darwin", () => {
		expect(getImportPath("claude-code", "darwin", home)).toBe(`${home}/.claude/mcp.json`);
	});
	it("claude-code linux", () => {
		expect(getImportPath("claude-code", "linux", linuxHome)).toBe(`${linuxHome}/.claude/mcp.json`);
	});

	it("claude-desktop darwin", () => {
		const p = getImportPath("claude-desktop", "darwin", home);
		expect(p).toBe(`${home}/Library/Application Support/Claude/claude_desktop_config.json`);
	});
	it("claude-desktop linux", () => {
		const p = getImportPath("claude-desktop", "linux", linuxHome);
		expect(p).toBe(`${linuxHome}/.config/Claude/claude_desktop_config.json`);
	});
	it("claude-desktop win32", () => {
		const p = getImportPath("claude-desktop", "win32", winHome);
		expect(p).toBe(`${winHome}\\AppData\\Roaming\\Claude\\claude_desktop_config.json`);
	});

	it("codex darwin", () => {
		expect(getImportPath("codex", "darwin", home)).toBe(`${home}/.codex/mcp.json`);
	});
	it("codex linux", () => {
		expect(getImportPath("codex", "linux", linuxHome)).toBe(`${linuxHome}/.codex/mcp.json`);
	});

	it("windsurf darwin", () => {
		const p = getImportPath("windsurf", "darwin", home);
		expect(p).toBe(`${home}/Library/Application Support/Windsurf/mcp.json`);
	});
	it("windsurf linux", () => {
		const p = getImportPath("windsurf", "linux", linuxHome);
		expect(p).toBe(`${linuxHome}/.config/Windsurf/mcp.json`);
	});
	it("windsurf win32", () => {
		const p = getImportPath("windsurf", "win32", winHome);
		expect(p).toBe(`${winHome}\\AppData\\Roaming\\Windsurf\\mcp.json`);
	});

	it("vscode darwin", () => {
		const p = getImportPath("vscode", "darwin", home);
		expect(p).toBe(`${home}/Library/Application Support/Code/User/mcp.json`);
	});
	it("vscode linux", () => {
		const p = getImportPath("vscode", "linux", linuxHome);
		expect(p).toBe(`${linuxHome}/.config/Code/User/mcp.json`);
	});
	it("vscode win32", () => {
		const p = getImportPath("vscode", "win32", winHome);
		expect(p).toBe(`${winHome}\\AppData\\Roaming\\Code\\User\\mcp.json`);
	});
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/config-imports.test.ts tests/config-imports-platforms.test.ts
```

Expected: FAIL (getImportPath, loadImportedConfigs not found)

- [ ] **Step 4: Write config-imports.ts**

```typescript
import type { ImportKind, ServerEntry, ServerProvenance } from "./types-config.js";
import type { ConfigFsOps } from "./config-load.js";
import { loadConfigFile } from "./config-load.js";

type Platform = "darwin" | "linux" | "win32";

export interface ImportResult {
	servers: Record<string, ServerEntry>;
	provenance: Record<string, ServerProvenance>;
}

export function getImportPath(kind: ImportKind, platform: Platform, home: string): string {
	const sep = platform === "win32" ? "\\" : "/";
	const join = (...parts: string[]) => parts.join(sep);
	const appData = platform === "win32" ? join(home, "AppData", "Roaming") : "";
	const configDir = platform === "linux" ? join(home, ".config") : "";
	const libSupport = platform === "darwin" ? join(home, "Library", "Application Support") : "";

	const paths: Record<ImportKind, string> = {
		cursor: join(home, ".cursor", "mcp.json"),
		"claude-code": join(home, ".claude", "mcp.json"),
		"claude-desktop": platform === "darwin" ? join(libSupport, "Claude", "claude_desktop_config.json")
			: platform === "linux" ? join(configDir, "Claude", "claude_desktop_config.json")
			: join(appData, "Claude", "claude_desktop_config.json"),
		codex: join(home, ".codex", "mcp.json"),
		windsurf: platform === "darwin" ? join(libSupport, "Windsurf", "mcp.json")
			: platform === "linux" ? join(configDir, "Windsurf", "mcp.json")
			: join(appData, "Windsurf", "mcp.json"),
		vscode: platform === "darwin" ? join(libSupport, "Code", "User", "mcp.json")
			: platform === "linux" ? join(configDir, "Code", "User", "mcp.json")
			: join(appData, "Code", "User", "mcp.json"),
	};
	return paths[kind];
}

export function loadImportedConfigs(
	imports: ImportKind[], fs: ConfigFsOps, platform: Platform, home: string,
): ImportResult {
	const servers: Record<string, ServerEntry> = {};
	const provenance: Record<string, ServerProvenance> = {};
	for (const kind of imports) {
		const path = getImportPath(kind, platform, home);
		const config = loadConfigFile(path, fs);
		for (const [name, entry] of Object.entries(config.mcpServers)) {
			if (servers[name] === undefined) {
				servers[name] = entry;
				provenance[name] = { path, kind: "import", importKind: kind };
			}
		}
	}
	return { servers, provenance };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/config-imports.test.ts tests/config-imports-platforms.test.ts
```

Expected: PASS (21 tests total)

- [ ] **Step 6: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/config-imports.ts tests/config-imports.test.ts tests/config-imports-platforms.test.ts
git commit -m "mcp: config-imports (6 tools, 3 platforms, first-import-wins)"
```

---

### Task 4: config-merge.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/config-merge.ts`
- Create: `01_EXTENSIONS/mcp/tests/config-merge.test.ts`
- Create: `01_EXTENSIONS/mcp/tests/config-merge-provenance.test.ts`

- [ ] **Step 1: Write the failing test (config-merge.test.ts)**

```typescript
import { describe, expect, it } from "vitest";
import { mergeConfigs } from "../src/config-merge.js";
import type { McpConfig } from "../src/types-config.js";
import type { ImportResult } from "../src/config-imports.js";

describe("mergeConfigs", () => {
	const emptyConfig: McpConfig = { mcpServers: {} };
	const emptyImport: ImportResult = { servers: {}, provenance: {} };

	it("user config provides base servers", () => {
		const user: McpConfig = { mcpServers: { s1: { command: "echo" } } };
		const result = mergeConfigs(user, emptyImport, emptyConfig);
		expect(result.config.mcpServers.s1.command).toBe("echo");
	});

	it("imports add servers not in user config", () => {
		const imports: ImportResult = {
			servers: { s2: { command: "cat" } },
			provenance: { s2: { path: "/imp", kind: "import", importKind: "cursor" } },
		};
		const result = mergeConfigs(emptyConfig, imports, emptyConfig);
		expect(result.config.mcpServers.s2.command).toBe("cat");
	});

	it("project-local overrides user config", () => {
		const user: McpConfig = { mcpServers: { s1: { command: "old" } } };
		const project: McpConfig = { mcpServers: { s1: { command: "new" } } };
		const result = mergeConfigs(user, emptyImport, project);
		expect(result.config.mcpServers.s1.command).toBe("new");
	});

	it("project-local overrides imports", () => {
		const imports: ImportResult = {
			servers: { s1: { command: "imported" } },
			provenance: { s1: { path: "/imp", kind: "import", importKind: "cursor" } },
		};
		const project: McpConfig = { mcpServers: { s1: { command: "local" } } };
		const result = mergeConfigs(emptyConfig, imports, project);
		expect(result.config.mcpServers.s1.command).toBe("local");
	});

	it("merges settings from user config", () => {
		const user: McpConfig = {
			mcpServers: {},
			settings: { toolPrefix: "short" },
		};
		const result = mergeConfigs(user, emptyImport, emptyConfig);
		expect(result.config.settings?.toolPrefix).toBe("short");
	});

	it("project settings override user settings", () => {
		const user: McpConfig = {
			mcpServers: {},
			settings: { toolPrefix: "short", consent: "never" },
		};
		const project: McpConfig = {
			mcpServers: {},
			settings: { toolPrefix: "server" },
		};
		const result = mergeConfigs(user, emptyImport, project);
		expect(result.config.settings?.toolPrefix).toBe("server");
		expect(result.config.settings?.consent).toBe("never");
	});

	it("user + imports + project all contribute servers", () => {
		const user: McpConfig = { mcpServers: { a: { command: "a" } } };
		const imports: ImportResult = {
			servers: { b: { command: "b" } },
			provenance: { b: { path: "/b", kind: "import", importKind: "vscode" } },
		};
		const project: McpConfig = { mcpServers: { c: { command: "c" } } };
		const result = mergeConfigs(user, imports, project);
		expect(Object.keys(result.config.mcpServers).sort()).toEqual(["a", "b", "c"]);
	});
});
```

- [ ] **Step 2: Write the failing provenance test (config-merge-provenance.test.ts)**

```typescript
import { describe, expect, it } from "vitest";
import { mergeConfigs } from "../src/config-merge.js";
import type { McpConfig } from "../src/types-config.js";
import type { ImportResult } from "../src/config-imports.js";

describe("config-merge provenance tracking", () => {
	const emptyImport: ImportResult = { servers: {}, provenance: {} };

	it("tracks user config provenance", () => {
		const user: McpConfig = { mcpServers: { s1: { command: "echo" } } };
		const result = mergeConfigs(user, emptyImport, { mcpServers: {} }, "/home/.pi/agent/mcp.json");
		expect(result.provenance.s1.kind).toBe("user");
		expect(result.provenance.s1.path).toBe("/home/.pi/agent/mcp.json");
	});

	it("tracks import provenance", () => {
		const imports: ImportResult = {
			servers: { s1: { command: "echo" } },
			provenance: { s1: { path: "/cursor/mcp.json", kind: "import", importKind: "cursor" } },
		};
		const result = mergeConfigs({ mcpServers: {} }, imports, { mcpServers: {} });
		expect(result.provenance.s1.kind).toBe("import");
		expect(result.provenance.s1.importKind).toBe("cursor");
	});

	it("tracks project provenance", () => {
		const project: McpConfig = { mcpServers: { s1: { command: "echo" } } };
		const result = mergeConfigs(
			{ mcpServers: {} }, emptyImport, project, undefined, "/proj/.pi/mcp.json",
		);
		expect(result.provenance.s1.kind).toBe("project");
		expect(result.provenance.s1.path).toBe("/proj/.pi/mcp.json");
	});

	it("project override updates provenance", () => {
		const user: McpConfig = { mcpServers: { s1: { command: "old" } } };
		const project: McpConfig = { mcpServers: { s1: { command: "new" } } };
		const result = mergeConfigs(
			user, emptyImport, project, "/user/mcp.json", "/proj/mcp.json",
		);
		expect(result.provenance.s1.kind).toBe("project");
		expect(result.provenance.s1.path).toBe("/proj/mcp.json");
	});

	it("import provenance preserved when no override", () => {
		const imports: ImportResult = {
			servers: { s1: { command: "echo" } },
			provenance: { s1: { path: "/vscode/mcp.json", kind: "import", importKind: "vscode" } },
		};
		const result = mergeConfigs({ mcpServers: {} }, imports, { mcpServers: {} });
		expect(result.provenance.s1.importKind).toBe("vscode");
	});

	it("provenance tracks all servers from different sources", () => {
		const user: McpConfig = { mcpServers: { a: { command: "a" } } };
		const imports: ImportResult = {
			servers: { b: { command: "b" } },
			provenance: { b: { path: "/imp", kind: "import", importKind: "codex" } },
		};
		const project: McpConfig = { mcpServers: { c: { command: "c" } } };
		const result = mergeConfigs(
			user, imports, project, "/user.json", "/proj.json",
		);
		expect(result.provenance.a.kind).toBe("user");
		expect(result.provenance.b.kind).toBe("import");
		expect(result.provenance.c.kind).toBe("project");
	});
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/config-merge.test.ts tests/config-merge-provenance.test.ts
```

Expected: FAIL (mergeConfigs not found)

- [ ] **Step 4: Write config-merge.ts**

```typescript
import type { McpConfig, McpSettings, ServerEntry, ServerProvenance } from "./types-config.js";
import type { ImportResult } from "./config-imports.js";

export interface MergeResult {
	config: McpConfig;
	provenance: Record<string, ServerProvenance>;
}

export function mergeConfigs(
	user: McpConfig,
	imports: ImportResult,
	project: McpConfig,
	userPath?: string,
	projectPath?: string,
): MergeResult {
	const servers: Record<string, ServerEntry> = {};
	const provenance: Record<string, ServerProvenance> = {};

	for (const [name, entry] of Object.entries(user.mcpServers)) {
		servers[name] = entry;
		provenance[name] = { path: userPath ?? "", kind: "user" };
	}

	for (const [name, entry] of Object.entries(imports.servers)) {
		if (servers[name] === undefined) {
			servers[name] = entry;
			provenance[name] = imports.provenance[name];
		}
	}

	for (const [name, entry] of Object.entries(project.mcpServers)) {
		servers[name] = entry;
		provenance[name] = { path: projectPath ?? "", kind: "project" };
	}

	const settings = mergeSettings(user.settings, project.settings);
	return { config: { mcpServers: servers, settings }, provenance };
}

function mergeSettings(
	user: McpSettings | undefined,
	project: McpSettings | undefined,
): McpSettings | undefined {
	if (!user && !project) return undefined;
	return { ...user, ...project };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/config-merge.test.ts tests/config-merge-provenance.test.ts
```

Expected: PASS (13 tests total)

- [ ] **Step 6: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/config-merge.ts tests/config-merge.test.ts tests/config-merge-provenance.test.ts
git commit -m "mcp: config-merge (user/import/project precedence, provenance)"
```

---

### Task 5: config-write.ts

**Files:**
- Create: `01_EXTENSIONS/mcp/src/config-write.ts`
- Create: `01_EXTENSIONS/mcp/tests/config-write.test.ts`

- [ ] **Step 1: Write the failing test (config-write.test.ts)**

```typescript
import { describe, expect, it, vi } from "vitest";
import { writeConfigAtomic } from "../src/config-write.js";

describe("writeConfigAtomic", () => {
	it("writes via temp file then rename", () => {
		const written: Array<{ path: string; data: string }> = [];
		const renamed: Array<{ from: string; to: string }> = [];
		const fs = {
			writeFile: (p: string, d: string) => { written.push({ path: p, data: d }); },
			rename: (from: string, to: string) => { renamed.push({ from, to }); },
			unlink: vi.fn(),
			getPid: () => 1234,
		};
		const config = { mcpServers: { s1: { command: "echo" } } };
		writeConfigAtomic("/path/mcp.json", config, fs);
		expect(written).toHaveLength(1);
		expect(written[0].path).toContain("1234");
		expect(written[0].path).toContain(".tmp");
		expect(renamed).toHaveLength(1);
		expect(renamed[0].to).toBe("/path/mcp.json");
	});

	it("temp file name includes PID", () => {
		const written: Array<{ path: string }> = [];
		const fs = {
			writeFile: (p: string) => { written.push({ path: p }); },
			rename: vi.fn(),
			unlink: vi.fn(),
			getPid: () => 5678,
		};
		writeConfigAtomic("/a/b.json", { mcpServers: {} }, fs);
		expect(written[0].path).toContain("5678");
	});

	it("writes formatted JSON with 2-space indent", () => {
		let writtenData = "";
		const fs = {
			writeFile: (_p: string, d: string) => { writtenData = d; },
			rename: vi.fn(),
			unlink: vi.fn(),
			getPid: () => 1,
		};
		writeConfigAtomic("/a.json", { mcpServers: { s: { command: "x" } } }, fs);
		expect(writtenData).toContain("\n");
		expect(writtenData).toContain("  ");
		const parsed = JSON.parse(writtenData);
		expect(parsed.mcpServers.s.command).toBe("x");
	});

	it("cleans up temp file on rename failure", () => {
		const fs = {
			writeFile: vi.fn(),
			rename: () => { throw new Error("rename failed"); },
			unlink: vi.fn(),
			getPid: () => 1,
		};
		expect(() => writeConfigAtomic("/a.json", { mcpServers: {} }, fs)).toThrow("rename failed");
		expect(fs.unlink).toHaveBeenCalled();
	});

	it("writes trailing newline", () => {
		let writtenData = "";
		const fs = {
			writeFile: (_p: string, d: string) => { writtenData = d; },
			rename: vi.fn(),
			unlink: vi.fn(),
			getPid: () => 1,
		};
		writeConfigAtomic("/a.json", { mcpServers: {} }, fs);
		expect(writtenData.endsWith("\n")).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/config-write.test.ts
```

Expected: FAIL (writeConfigAtomic not found)

- [ ] **Step 3: Write config-write.ts**

```typescript
import type { McpConfig } from "./types-config.js";

export interface WriteFsOps {
	writeFile(path: string, data: string): void;
	rename(from: string, to: string): void;
	unlink(path: string): void;
	getPid(): number;
}

function tempPath(target: string, pid: number): string {
	return `${target}.${pid}.tmp`;
}

export function writeConfigAtomic(
	path: string,
	config: McpConfig,
	fs: WriteFsOps,
): void {
	const tmp = tempPath(path, fs.getPid());
	const data = JSON.stringify(config, null, 2) + "\n";
	fs.writeFile(tmp, data);
	try {
		fs.rename(tmp, path);
	} catch (err) {
		try { fs.unlink(tmp); } catch { /* best-effort cleanup */ }
		throw err;
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd 01_EXTENSIONS/mcp && npx vitest run tests/config-write.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Build and commit**

```bash
cd 01_EXTENSIONS/mcp && npm run build
git add src/config-write.ts tests/config-write.test.ts
git commit -m "mcp: config-write (atomic write via temp+rename)"
```

---

### Task 6: Full verification and Go architecture tests

- [ ] **Step 1: Run full test suite**

```bash
cd 01_EXTENSIONS/mcp && npm test
```

Expected: All tests pass. Coverage thresholds met (100% on all config modules).

- [ ] **Step 2: Verify all files are <= 99 lines**

```bash
cd 01_EXTENSIONS/mcp && wc -l src/config-*.ts tests/config-*.test.ts
```

Expected: Every file <= 99 lines.

- [ ] **Step 3: Run Go architecture tests**

```bash
cd /Users/me/Desktop/pi && go test ./00_ARCHITECTURE/tests/ -v -count=1
```

Expected: ALL tests pass. Every `.ts` file under 99 lines, no `as any/unknown/never`, no `ExtensionAPI` outside index.ts.

- [ ] **Step 4: Commit final verification**

```bash
cd 01_EXTENSIONS/mcp && git add -A && git commit -m "mcp: Plan 2 Config complete (5 modules, 7 test files)"
```
