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
