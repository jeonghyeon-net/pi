import { connectServer } from "./server-connect.js";
import type { ConnectDeps } from "./server-connect.js";
import { setConnection, removeConnection, getConnections } from "./state.js";
import { buildToolMetadata } from "./tool-metadata.js";
import { setMetadata } from "./state.js";
import type { ServerEntry } from "./types-config.js";

type ConnectFn = (name: string, entry: ServerEntry) => Promise<void>;
type CloseFn = (name: string) => Promise<void>;

export function makeConnectDeps(): ConnectDeps {
	return {
		createStdioTransport: () => { throw new Error("stdio transport not wired"); },
		createHttpTransport: async () => { throw new Error("http transport not wired"); },
		createClient: () => { throw new Error("client factory not wired"); },
		processEnv: process.env as Record<string, string | undefined>,
	};
}

export function wireCommandConnect(): ConnectFn {
	const deps = makeConnectDeps();
	return async (name: string, entry: ServerEntry): Promise<void> => {
		const result = await connectServer(name, entry, deps);
		setConnection(name, result);
		const tools = await buildToolMetadata(result.client, name);
		setMetadata(name, tools);
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
