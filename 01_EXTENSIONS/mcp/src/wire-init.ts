import type { InitDeps } from "./lifecycle-init.js";
import type { ServerConnection } from "./types-server.js";
import { connectServer } from "./server-connect.js";
import { startIdleTimer } from "./lifecycle-idle.js";
import { startKeepalive } from "./lifecycle-keepalive.js";
import { onSessionStart } from "./lifecycle-init.js";
import {
	setConfig, setConnection, setMetadata, getAllMetadata, incrementGeneration,
	getGeneration, getConnections, getConfig, updateFooterStatus,
} from "./state.js";
import { DEFAULT_IDLE_TIMEOUT_MS, KEEPALIVE_INTERVAL_MS } from "./constants.js";
import {
	wireLoadConfig, wireMergeConfigs, wireApplyDirectToolsEnv,
	wireComputeHash, wireLoadCache, wireIsCacheValid, wireSaveCache,
} from "./wire-init-config.js";
import {
	wireBuildMetadata, wireResolveDirectTools, wireRegisterDirectTools,
	wireBuildResourceTools, wireDeduplicateTools,
} from "./wire-init-tools.js";
import { makeConnectDeps, wireCommandConnect } from "./wire-command.js";
import { closeServer } from "./server-close.js";
import { ServerPool } from "./server-pool.js";
import { recordFailure } from "./failure-tracker.js";
import type { McpConfig } from "./types-config.js";

export interface FooterUi {
	setStatus(key: string, text: string | undefined): void;
	theme: { fg(color: string, text: string): string };
}
let capturedUi: FooterUi | null = null;
export function setCapturedUi(ui: FooterUi | null): void { capturedUi = ui; }
export function getCapturedUi(): FooterUi | null { return capturedUi; }

function isConfig(v: unknown): v is McpConfig { return typeof v === "object" && v !== null && "mcpServers" in v; }
function isFooterUi(v: unknown): v is FooterUi { return typeof v === "object" && v !== null && "setStatus" in v && "theme" in v; }

function wrapIdleTimer(opts: unknown): void {
	if (!isConfig(opts)) return;
	const conns = getConnections(); const pool = new ServerPool();
	for (const [n, c] of conns) pool.add(n, c);
	startIdleTimer({
		connections: conns, servers: opts.mcpServers,
		closeFn: (n: string) => closeServer(n, pool),
		timeoutMs: opts.settings?.idleTimeout ?? DEFAULT_IDLE_TIMEOUT_MS,
		intervalMs: DEFAULT_IDLE_TIMEOUT_MS / 10,
	});
}
function wrapKeepalive(opts: unknown): void {
	if (!isConfig(opts)) return;
	const doConnect = wireCommandConnect();
	startKeepalive({
		connections: getConnections(), servers: opts.mcpServers,
		reconnectFn: async (name: string) => {
			const entry = opts.mcpServers[name];
			if (!entry) return;
			try { await doConnect(name, entry); } catch { recordFailure(name); }
		},
		intervalMs: KEEPALIVE_INTERVAL_MS,
	});
}
export function wireInitDeps(): InitDeps {
	const cDeps = makeConnectDeps();
	return {
		loadConfig: wireLoadConfig(), mergeConfigs: wireMergeConfigs(),
		applyDirectToolsEnv: wireApplyDirectToolsEnv(),
		computeHash: wireComputeHash, loadCache: wireLoadCache(),
		isCacheValid: wireIsCacheValid(), saveCache: wireSaveCache(),
		connectServer: (name, entry) => connectServer(name, entry, cDeps),
		buildMetadata: wireBuildMetadata(), resolveDirectTools: wireResolveDirectTools(),
		registerDirectTools: wireRegisterDirectTools(),
		buildResourceTools: wireBuildResourceTools(), deduplicateTools: wireDeduplicateTools(),
		startIdleTimer: wrapIdleTimer, startKeepalive: wrapKeepalive, setConfig,
		setConnection: (name, conn) => { setConnection(name, conn as ServerConnection); },
		setMetadata, getAllMetadata, incrementGeneration, getGeneration,
		updateFooter: () => {
			const ui = getCapturedUi(); const cfg = getConfig();
			if (ui && cfg) updateFooterStatus(ui, Object.keys(cfg.mcpServers).length);
		},
	};
}
interface InitPi {
	registerTool(t: { name: string; parameters: Record<string, unknown>; execute: Function }): void;
	exec(cmd: string, args: string[], opts?: { cwd?: string }): Promise<{ stdout: string; code: number }>;
	sendMessage(msg: { customType: string; content: string; display: boolean }): void;
}
export function wireSessionStart(pi: InitPi) {
	const handler = onSessionStart(pi, wireInitDeps());
	return async (event: unknown, ctx: unknown) => {
		if (isFooterUi(ctx)) setCapturedUi(ctx);
		await handler(event, ctx);
	};
}
