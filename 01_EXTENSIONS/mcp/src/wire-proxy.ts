import { proxySearch } from "./proxy-search.js";
import { proxyList, proxyDescribe, proxyStatus } from "./proxy-query.js";
import { proxyCall } from "./proxy-call.js";
import type { CallDeps } from "./proxy-call.js";
import type { ActionDeps } from "./proxy-router.js";
import type { ProxyToolResult } from "./types-proxy.js";
import { matchTool } from "./search.js";
import { formatSchema } from "./schema-format.js";
import { transformContent } from "./content-transform.js";
import { getAllMetadata, getMetadata, getConfig, getConnections } from "./state.js";
import { getBackoffMs, getFailure } from "./failure-tracker.js";
import { wireCommandConnect } from "./wire-command.js";
import { buildDescription } from "./proxy-description.js";
import { createConsentManager } from "./consent.js";
import type { ServerEntry } from "./types-config.js";

type ConnectFn = (name: string, entry: ServerEntry) => Promise<void>;

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
	return Object.keys(config.mcpServers).map((name) => {
		const conn = conns.get(name);
		return { name, status: conn?.status ?? "not connected" };
	});
}

export function buildCallDeps(doConnect: ConnectFn): CallDeps {
	const cfg = getConfig();
	const mode = cfg?.settings?.consent ?? "never";
	const consent = createConsentManager(mode);
	return {
		findTool: findToolInMetadata,
		getAllMetadata,
		getConfig,
		connectServer: async (name: string) => {
			const c = getConfig();
			if (!c) return;
			const entry = c.mcpServers[name];
			if (entry) await doConnect(name, entry);
		},
		getBackoffMs,
		getFailure,
		getOrConnect: async (server: string) => {
			const conn = getConnections().get(server);
			if (conn) return conn;
			throw new Error(`Server "${server}" not connected`);
		},
		checkConsent: async (server: string) => {
			if (!consent.needsConsent(server)) return true;
			consent.recordApproval(server);
			return true;
		},
		transform: transformContent,
	};
}

export function wireProxyDeps(): ActionDeps {
	const doConnect = wireCommandConnect();
	const callDeps = buildCallDeps(doConnect);
	return {
		search: (query) => proxySearch(query ?? "", getAllMetadata(), matchTool),
		list: (server) => proxyList(server, (s) => getMetadata(s)),
		describe: (tool) => proxyDescribe(tool, findToolInMetadata, formatSchema),
		status: () => proxyStatus(buildServerStatuses()),
		call: (tool, args) => proxyCall(tool, args, callDeps),
		connect: async (server) => connectAction(server, doConnect),
	};
}

async function connectAction(server: string | undefined, doConnect: ConnectFn): Promise<ProxyToolResult> {
	if (!server) return text("Server name is required for connect action.");
	const config = getConfig();
	if (!config) return text("No config loaded.");
	const entry = config.mcpServers[server];
	if (!entry) return text(`Server "${server}" not found in config.`);
	await doConnect(server, entry);
	return text(`Connected to "${server}".`);
}

export function buildProxyDescription(): string {
	return buildDescription({
		getServers: () => buildServerStatuses(),
		getMetadataMap: () => getAllMetadata(),
	});
}

function text(msg: string): ProxyToolResult {
	return { content: [{ type: "text", text: msg }] };
}
