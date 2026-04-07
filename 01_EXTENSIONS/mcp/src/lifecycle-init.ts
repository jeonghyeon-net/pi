import type { McpConfig, ServerEntry } from "./types-config.js";
import type { ToolMetadata, DirectToolSpec } from "./types-tool.js";

interface InitPi {
	registerTool(tool: { name: string; parameters: Record<string, unknown>; execute: Function }): void;
	exec(cmd: string, args: string[], opts?: { cwd?: string }): Promise<{ stdout: string; code: number }>;
	sendMessage(msg: { customType: string; content: string; display: boolean }): void;
}

export interface CacheData { hash: string; servers: Record<string, unknown[]>; timestamp: number }

export interface InitDeps {
	loadConfig: () => Promise<McpConfig>;
	mergeConfigs: (config: McpConfig) => McpConfig;
	applyDirectToolsEnv: (config: McpConfig) => McpConfig;
	computeHash: (config: McpConfig) => string;
	loadCache: () => CacheData | null;
	isCacheValid: (cache: CacheData | null, hash: string) => boolean;
	saveCache: (hash: string, metadata: Map<string, ToolMetadata[]>) => Promise<void>;
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

type SC = { name: string; entry: ServerEntry; mode: string };

function classifyServers(config: McpConfig): { eager: SC[]; lazy: SC[] } {
	const eager: SC[] = [];
	const lazy: SC[] = [];
	for (const [name, entry] of Object.entries(config.mcpServers)) {
		const mode = entry.lifecycle ?? "lazy";
		(mode === "lazy" ? lazy : eager).push({ name, entry, mode });
	}
	return { eager, lazy };
}

async function connectAndDiscover(
	gen: number, server: SC, deps: InitDeps,
): Promise<void> {
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
		deps.isCacheValid(cache, hash);
		const { eager } = classifyServers(config);
		await Promise.allSettled(eager.map((s) => connectAndDiscover(gen, s, deps)));
		if (deps.getGeneration() !== gen) return;
		const directSpecs = deps.resolveDirectTools(deps.getAllMetadata(), config);
		const deduped = deps.deduplicateTools(directSpecs);
		deps.registerDirectTools(pi, deduped, deps);
		deps.startIdleTimer(config); deps.startKeepalive(config);
		deps.saveCache(hash, deps.getAllMetadata()).catch(() => {});
		deps.updateFooter();
	};
}
