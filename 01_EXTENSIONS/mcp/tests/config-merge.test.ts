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
