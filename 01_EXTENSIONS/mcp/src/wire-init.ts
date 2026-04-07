import type { InitDeps } from "./lifecycle-init.js";
import { connectServer } from "./server-connect.js";
import { startIdleTimer } from "./lifecycle-idle.js";
import { startKeepalive } from "./lifecycle-keepalive.js";
import {
	setConfig, setConnection, setMetadata, getAllMetadata,
	incrementGeneration, getGeneration, getConnections,
} from "./state.js";
import { createLogger } from "./logger.js";
import { DEFAULT_IDLE_TIMEOUT_MS, KEEPALIVE_INTERVAL_MS } from "./constants.js";
import {
	wireLoadConfig, wireMergeConfigs, wireApplyDirectToolsEnv,
	wireComputeHash, wireLoadCache, wireIsCacheValid, wireSaveCache,
} from "./wire-init-config.js";
import {
	wireBuildMetadata, wireResolveDirectTools, wireRegisterDirectTools,
	wireBuildResourceTools, wireDeduplicateTools,
} from "./wire-init-tools.js";
import { makeConnectDeps } from "./wire-command.js";
import { closeServer } from "./server-close.js";
import { ServerPool } from "./server-pool.js";
import type { McpConfig } from "./types-config.js";
import type { ServerConnection } from "./types-server.js";

function isConfig(v: unknown): v is McpConfig {
	return typeof v === "object" && v !== null && "mcpServers" in v;
}

function isServerConn(v: unknown): v is ServerConnection {
	return typeof v === "object" && v !== null && "client" in v && "transport" in v;
}

function wrapIdleTimer(opts: unknown): void {
	if (!isConfig(opts)) return;
	const conns = getConnections();
	const pool = new ServerPool();
	for (const [n, c] of conns) pool.add(n, c);
	startIdleTimer({
		connections: conns,
		servers: opts.mcpServers,
		closeFn: (n: string) => closeServer(n, pool),
		timeoutMs: opts.settings?.idleTimeout ?? DEFAULT_IDLE_TIMEOUT_MS,
		intervalMs: DEFAULT_IDLE_TIMEOUT_MS / 10,
	});
}

function wrapKeepalive(opts: unknown): void {
	if (!isConfig(opts)) return;
	startKeepalive({
		connections: getConnections(),
		servers: opts.mcpServers,
		reconnectFn: async () => {},
		intervalMs: KEEPALIVE_INTERVAL_MS,
	});
}

export function wireInitDeps(): InitDeps {
	const logger = createLogger("info", { module: "init" });
	const cDeps = makeConnectDeps();
	return {
		loadConfig: wireLoadConfig(),
		mergeConfigs: wireMergeConfigs(),
		applyDirectToolsEnv: wireApplyDirectToolsEnv(),
		computeHash: wireComputeHash,
		loadCache: wireLoadCache(),
		isCacheValid: wireIsCacheValid(),
		saveCache: wireSaveCache(),
		connectServer: (name, entry) => connectServer(name, entry, cDeps),
		buildMetadata: wireBuildMetadata(),
		resolveDirectTools: wireResolveDirectTools(),
		registerDirectTools: wireRegisterDirectTools(),
		buildResourceTools: wireBuildResourceTools(),
		deduplicateTools: wireDeduplicateTools(),
		startIdleTimer: wrapIdleTimer,
		startKeepalive: wrapKeepalive,
		setConfig,
		setConnection: (name, conn) => { if (isServerConn(conn)) setConnection(name, conn); },
		setMetadata, getAllMetadata, incrementGeneration, getGeneration,
		updateFooter: () => {},
		logger,
	};
}
