import { connectServer } from "./server-connect.js";
import type { ConnectDeps } from "./server-connect.js";
import { setConnection, removeConnection, getConnections, getConfig, getAllMetadata } from "./state.js";
import { buildToolMetadata } from "./tool-metadata.js";
import { setMetadata } from "./state.js";
import type { ServerEntry } from "./types-config.js";
import { createStdioTransport } from "./transport-stdio.js";
import { createHttpTransport } from "./transport-http.js";
import { createSdkStdioTransport, createSdkStreamableHttpTransport, createSdkSseTransport } from "./sdk-transport.js";
import { createSdkClient } from "./sdk-client.js";
import { recordFailure, clearFailure } from "./failure-tracker.js";
import { computeConfigHash } from "./config-hash.js";
import { wireSaveCache } from "./wire-init-config.js";

type ConnectFn = (name: string, entry: ServerEntry) => Promise<void>;
type CloseFn = (name: string) => Promise<void>;

export function makeConnectDeps(): ConnectDeps {
	return {
		createStdioTransport: (entry, env) =>
			createStdioTransport(entry, env, (cmd, args, opts) =>
				createSdkStdioTransport(cmd, args, opts.env, opts.cwd)),
		createHttpTransport: (url, headers) =>
			createHttpTransport(url, headers, {
				createStreamableHttp: async (u, h) => createSdkStreamableHttpTransport(u, h),
				createSse: async (u, h) => createSdkSseTransport(u, h),
			}),
		createClient: () => createSdkClient(),
		processEnv: process.env as Record<string, string | undefined>,
	};
}

export function wireCommandConnect(): ConnectFn {
	const deps = makeConnectDeps();
	return async (name: string, entry: ServerEntry): Promise<void> => {
		try {
			const result = await connectServer(name, entry, deps);
			setConnection(name, result);
			clearFailure(name);
			const tools = await buildToolMetadata(result.client, name);
			setMetadata(name, tools);
			const cfg = getConfig();
			if (cfg) wireSaveCache()(computeConfigHash(cfg), getAllMetadata()).catch(() => {});
		} catch (err) {
			recordFailure(name);
			throw err;
		}
	};
}

export function wireCommandClose(): CloseFn {
	return async (name: string): Promise<void> => {
		const conns = getConnections();
		const conn = conns.get(name);
		if (!conn) return;
		conn.status = "closed";
		removeConnection(name);
		try { await conn.client.close(); } catch { /* swallow */ }
		try { await conn.transport.close(); } catch { /* swallow */ }
	};
}
