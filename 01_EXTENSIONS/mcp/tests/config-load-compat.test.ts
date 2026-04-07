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
