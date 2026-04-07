import type { McpConfig, ServerEntry } from "./types-config.js";
import type { ToolMetadata, DirectToolSpec } from "./types-tool.js";
import type { CacheData } from "./types-cache.js";
import { classifyServers, connectAndDiscover, hydrateCachedMetadata } from "./lifecycle-init-helpers.js";

type InitPi = {
	registerTool(tool: { name: string; parameters: Record<string, unknown>; execute: Function }): void;
	exec(cmd: string, args: string[], opts?: { cwd?: string }): Promise<{ stdout: string; code: number }>;
	sendMessage(msg: { customType: string; content: string; display: boolean }): void;
};

export interface InitDeps {
	loadConfig: () => Promise<McpConfig>;
	mergeConfigs: (config: McpConfig) => McpConfig;
	applyDirectToolsEnv: (config: McpConfig) => McpConfig;
	computeHash: (config: McpConfig) => string;
	loadCache: () => CacheData | null;
	isCacheValid: (cache: CacheData | null, config: McpConfig, hash: string) => boolean;
	saveCache: (config: McpConfig, metadata: Map<string, ToolMetadata[]>) => Promise<void>;
	connectServer: (name: string, entry: ServerEntry) => Promise<{ name: string; client: unknown; status: string }>;
	buildMetadata: (name: string, client: unknown) => Promise<ToolMetadata[]>;
	resolveDirectTools: (metadata: Map<string, ToolMetadata[]>, config: McpConfig) => DirectToolSpec[];
	registerDirectTools: (pi: InitPi, specs: DirectToolSpec[], deps: InitDeps) => void;
	buildResourceTools: (name: string, client: unknown) => Promise<ToolMetadata[]>;
	deduplicateTools: (tools: DirectToolSpec[]) => DirectToolSpec[];
	startIdleTimer: (opts: unknown) => void; startKeepalive: (opts: unknown) => void;
	setConfig: (config: McpConfig) => void;
	setConnection: (name: string, conn: unknown) => void;
	setMetadata: (name: string, tools: ToolMetadata[]) => void;
	getAllMetadata: () => Map<string, ToolMetadata[]>;
	incrementGeneration: () => number; getGeneration: () => number;
	updateFooter: () => void;
}


export function onSessionStart(pi: InitPi, deps?: InitDeps) {
	return async (_event: unknown, _ctx: unknown): Promise<void> => {
		if (!deps) return;
		const gen = deps.incrementGeneration();
		let config: McpConfig;
		try {
			config = deps.applyDirectToolsEnv(deps.mergeConfigs(await deps.loadConfig()));
		} catch { return; }
		deps.setConfig(config);
		const hash = deps.computeHash(config);
		const cache = deps.loadCache();
		deps.isCacheValid(cache, config, hash);
		if (cache !== null) hydrateCachedMetadata(config, cache, hash, deps);
		const { eager } = classifyServers(config);
		await Promise.allSettled(eager.map((s) => connectAndDiscover(gen, s, deps)));
		if (deps.getGeneration() !== gen) return;
		const directSpecs = deps.resolveDirectTools(deps.getAllMetadata(), config);
		const deduped = deps.deduplicateTools(directSpecs);
		deps.registerDirectTools(pi, deduped, deps);
		deps.startIdleTimer(config); deps.startKeepalive(config);
		const meta = deps.getAllMetadata();
		if (meta.size > 0) deps.saveCache(config, meta).catch(() => {});
		deps.updateFooter();
	};
}
