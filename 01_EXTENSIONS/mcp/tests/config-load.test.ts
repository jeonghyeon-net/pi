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
		expect(() => loadConfigFile("/bad.json", fs)).toThrow("Invalid JSON");
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
