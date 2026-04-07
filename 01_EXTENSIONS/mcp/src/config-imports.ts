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
