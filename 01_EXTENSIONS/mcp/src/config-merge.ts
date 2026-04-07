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
