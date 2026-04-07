import { describe, it, expect } from "vitest";
import type {
	LifecycleMode, ImportKind, ToolPrefix, ConsentMode,
	ServerEntry, McpSettings, McpConfig, ServerProvenance,
} from "../src/types-config.js";

describe("types-config", () => {
	it("union types accept valid values", () => {
		const modes: LifecycleMode[] = ["lazy", "eager", "keep-alive"];
		const kinds: ImportKind[] = ["cursor", "claude-code", "claude-desktop", "codex", "windsurf", "vscode"];
		const prefixes: ToolPrefix[] = ["server", "short", "none"];
		const consents: ConsentMode[] = ["never", "once-per-server", "always"];
		expect(modes).toHaveLength(3);
		expect(kinds).toHaveLength(6);
		expect(prefixes).toHaveLength(3);
		expect(consents).toHaveLength(3);
	});

	it("ServerEntry supports all optional fields", () => {
		const entry: ServerEntry = {
			command: "npx", args: ["-y", "server"],
			env: { NODE_ENV: "production" }, cwd: "/tmp",
			url: "http://localhost:3000", headers: { Authorization: "Bearer x" },
			auth: "bearer", bearerToken: "tok", bearerTokenEnv: "TOKEN",
			lifecycle: "eager", idleTimeout: 5000,
			directTools: ["read"], exposeResources: true, debug: false,
		};
		expect(entry.command).toBe("npx");
		expect(entry.auth).toBe("bearer");
		expect(entry.directTools).toEqual(["read"]);
	});

	it("ServerEntry works with minimal fields and boolean directTools", () => {
		const empty: ServerEntry = {};
		expect(empty.command).toBeUndefined();
		const withBool: ServerEntry = { directTools: true };
		expect(withBool.directTools).toBe(true);
	});

	it("McpSettings supports all fields", () => {
		const settings: McpSettings = {
			toolPrefix: "server", idleTimeout: 60000, directTools: false, consent: "always",
		};
		expect(settings.toolPrefix).toBe("server");
		expect(settings.consent).toBe("always");
	});

	it("McpConfig requires mcpServers", () => {
		const config: McpConfig = {
			mcpServers: { myServer: { command: "node", args: ["server.js"] } },
			imports: ["cursor", "claude-code"],
			settings: { toolPrefix: "short" },
		};
		expect(Object.keys(config.mcpServers)).toContain("myServer");
		expect(config.imports).toHaveLength(2);
	});

	it("ServerProvenance tracks origin with optional importKind", () => {
		const withImport: ServerProvenance = {
			path: "/home/user/.pi/mcp.json", kind: "import", importKind: "cursor",
		};
		expect(withImport.kind).toBe("import");
		expect(withImport.importKind).toBe("cursor");
		const without: ServerProvenance = { path: ".pi/mcp.json", kind: "project" };
		expect(without.importKind).toBeUndefined();
	});
});
