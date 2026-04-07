import { loadConfigFile } from "./config-load.js";
import { loadImportedConfigs } from "./config-imports.js";
import { mergeConfigs } from "./config-merge.js";
import { applyDirectToolsEnv } from "./tool-direct.js";
import { computeConfigHash } from "./config-hash.js";
import { loadMetadataCache, isMetadataCacheValid, saveMetadataCache } from "./cache-metadata.js";
import type { McpConfig } from "./types-config.js";
import type { ToolMetadata } from "./types-tool.js";
import type { CacheData } from "./lifecycle-init.js";
import { DEFAULT_USER_CONFIG, DEFAULT_PROJECT_CONFIG, CACHE_FILE_PATH } from "./constants.js";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";

function resolve(p: string): string {
	return p.startsWith("~") ? p.replace("~", homedir()) : p;
}

export const fsOps = {
	readFile: (p: string) => readFileSync(p, "utf-8"),
	exists: (p: string) => existsSync(p),
};

export const cacheFs = {
	existsSync: (p: string) => existsSync(p),
	readFileSync: (p: string) => readFileSync(p, "utf-8"),
	writeFileSync: (p: string, d: string) => writeFileSync(p, d, "utf-8"),
	renameSync: (s: string, d: string) => renameSync(s, d),
	getPid: () => process.pid,
};

export function wireLoadConfig(): () => Promise<McpConfig> {
	return async () => loadConfigFile(resolve(DEFAULT_USER_CONFIG), fsOps);
}

export function wireMergeConfigs(): (config: McpConfig) => McpConfig {
	return (config) => {
		const imports = config.imports
			? loadImportedConfigs(config.imports, fsOps, process.platform as "darwin" | "linux" | "win32", homedir())
			: { servers: {}, provenance: {} };
		const project = loadConfigFile(resolve(DEFAULT_PROJECT_CONFIG), fsOps);
		return mergeConfigs(config, imports, project).config;
	};
}

export function wireApplyDirectToolsEnv(): (config: McpConfig) => McpConfig {
	return (config) => applyDirectToolsEnv(config, process.env.PI_MCP_DIRECT_TOOLS);
}

export const wireComputeHash = computeConfigHash;

export function wireLoadCache(): () => CacheData | null {
	return () => {
		const cache = loadMetadataCache(resolve(CACHE_FILE_PATH), cacheFs);
		if (!cache) return null;
		const servers: Record<string, unknown[]> = {};
		for (const [name, entry] of Object.entries(cache.servers)) {
			servers[name] = Array.isArray(entry.tools) ? entry.tools : [];
		}
		return { hash: cache.configHash, servers, timestamp: Date.now() };
	};
}

export function wireIsCacheValid(): (cache: CacheData | null, hash: string) => boolean {
	return (cache, hash) => {
		if (!cache) return false;
		const servers: Record<string, { tools: unknown; savedAt: number }> = {};
		for (const [name, tools] of Object.entries(cache.servers)) {
			servers[name] = { tools, savedAt: cache.timestamp };
		}
		return isMetadataCacheValid({ version: 1, configHash: cache.hash, servers }, hash, () => Date.now());
	};
}

export function wireSaveCache(): (hash: string, metadata: Map<string, ToolMetadata[]>) => Promise<void> {
	return async (hash, metadata) => {
		const servers: Record<string, { tools: unknown; savedAt: number }> = {};
		const now = Date.now();
		for (const [name, tools] of metadata) servers[name] = { tools, savedAt: now };
		saveMetadataCache(resolve(CACHE_FILE_PATH), { version: 1, configHash: hash, servers }, cacheFs);
	};
}
