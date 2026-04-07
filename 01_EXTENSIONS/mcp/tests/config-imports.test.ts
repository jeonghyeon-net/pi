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
