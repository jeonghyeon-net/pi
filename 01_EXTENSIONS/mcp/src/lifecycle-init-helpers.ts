import { isServerCacheValid } from "./cache-metadata.js";
import { computeServerHash } from "./config-hash.js";
import type { CacheData } from "./types-cache.js";
import type { McpConfig, ServerEntry } from "./types-config.js";
import type { ToolMetadata } from "./types-tool.js";
import type { InitDeps } from "./lifecycle-init.js";

export type SC = { name: string; entry: ServerEntry; mode: string };

export function classifyServers(config: McpConfig): { eager: SC[]; lazy: SC[] } {
	const eager: SC[] = [];
	const lazy: SC[] = [];
	for (const [name, entry] of Object.entries(config.mcpServers)) {
		const mode = entry.lifecycle ?? "lazy";
		(mode === "lazy" ? lazy : eager).push({ name, entry, mode });
	}
	return { eager, lazy };
}

export async function connectAndDiscover(gen: number, server: SC, deps: InitDeps): Promise<void> {
	try {
		const conn = await deps.connectServer(server.name, server.entry);
		if (deps.getGeneration() !== gen) return;
		deps.setConnection(server.name, conn);
		try {
			const tools = await deps.buildMetadata(server.name, conn.client);
			if (deps.getGeneration() !== gen) return;
			deps.setMetadata(server.name, tools);
		} catch { /* discovery failed */ }
	} catch { /* connect failed */ }
}

export function hydrateCachedMetadata(config: McpConfig, cache: CacheData, hash: string, deps: InitDeps): void {
	const now = Date.now();
	for (const [name, configEntry] of Object.entries(config.mcpServers)) {
		const entry = cache.servers[name];
		if (!entry || !Array.isArray(entry.tools)) continue;
		if (!isServerCacheValid(entry, computeServerHash(configEntry), cache.hash, hash, now)) continue;
		deps.setMetadata(name, entry.tools as ToolMetadata[]);
	}
}
