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
