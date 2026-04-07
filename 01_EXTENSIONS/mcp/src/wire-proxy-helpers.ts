import { createConsentManager } from "./consent.js";
import { transformContent } from "./content-transform.js";
import { getBackoffMs, getFailure } from "./failure-tracker.js";
import { getAllMetadata, getConfig, getConnections } from "./state.js";
import type { CallDeps } from "./proxy-call.js";
import type { ProxyToolResult } from "./types-proxy.js";
import type { ServerEntry } from "./types-config.js";

export type ConnectFn = (name: string, entry: ServerEntry) => Promise<void>;

export function findToolInMetadata(name: string) {
	for (const tools of getAllMetadata().values()) {
		const found = tools.find((t) => t.name === name);
		if (found) return found;
	}
	return undefined;
}

export function buildServerStatuses() {
	const config = getConfig();
	if (!config) return [];
	const conns = getConnections();
	const metadata = getAllMetadata();
	return Object.keys(config.mcpServers).map((name) => {
		const conn = conns.get(name);
		return { name, status: conn?.status ?? "not connected", cached: !conn && metadata.has(name) };
	});
}

export function buildCallDeps(doConnect: ConnectFn): CallDeps {
	const mode = getConfig()?.settings?.consent ?? "never";
	const consent = createConsentManager(mode);
	return {
		findTool: findToolInMetadata, getAllMetadata, getConfig,
		connectServer: async (name: string) => {
			const entry = getConfig()?.mcpServers[name];
			if (entry) await doConnect(name, entry);
		},
		getBackoffMs, getFailure, transform: transformContent,
		getOrConnect: async (server: string) => {
			const conn = getConnections().get(server);
			if (conn) return conn;
			throw new Error(`Server "${server}" not connected`);
		},
		checkConsent: async (server: string) => !consent.needsConsent(server) || (consent.recordApproval(server), true),
	};
}

export async function connectAction(server: string | undefined, doConnect: ConnectFn): Promise<ProxyToolResult> {
	if (!server) return text("Server name is required for connect action.");
	const entry = getConfig()?.mcpServers[server];
	if (!getConfig()) return text("No config loaded.");
	if (!entry) return text(`Server "${server}" not found in config.`);
	await doConnect(server, entry);
	return text(`Connected to "${server}".`);
}

const text = (msg: string): ProxyToolResult => ({ content: [{ type: "text", text: msg }] });
