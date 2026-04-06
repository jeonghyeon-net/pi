import type { McpTransport, McpClient, ServerConnection, McpToolRaw, McpResourceRaw } from "./types-server.js";
import type { ServerEntry } from "./types-config.js";
import { mcpError } from "./errors.js";
import { paginateAll } from "./pagination.js";

export interface ConnectableClient extends McpClient {
	connect(transport: McpTransport): Promise<void>;
}

export interface ConnectDeps {
	createStdioTransport(
		entry: ServerEntry,
		env: Record<string, string | undefined>,
	): McpTransport;
	createHttpTransport(
		url: string,
		headers: Record<string, string> | undefined,
	): Promise<McpTransport>;
	createClient(): ConnectableClient;
	processEnv: Record<string, string | undefined>;
}

export interface ConnectResult extends ServerConnection {
	tools: McpToolRaw[];
	resources: McpResourceRaw[];
}

async function discoverTools(client: McpClient): Promise<McpToolRaw[]> {
	return paginateAll(async (cursor) => {
		const r = await client.listTools(cursor ? { cursor } : undefined);
		return { items: r.tools, nextCursor: r.nextCursor };
	});
}

async function discoverResources(client: McpClient): Promise<McpResourceRaw[]> {
	return paginateAll(async (cursor) => {
		const r = await client.listResources(cursor ? { cursor } : undefined);
		return { items: r.resources, nextCursor: r.nextCursor };
	});
}

export async function connectServer(
	name: string,
	entry: ServerEntry,
	deps: ConnectDeps,
): Promise<ConnectResult> {
	const transport = entry.command
		? deps.createStdioTransport(entry, deps.processEnv)
		: entry.url
			? await deps.createHttpTransport(entry.url, entry.headers)
			: null;
	if (!transport) {
		throw mcpError("no_transport", `Server "${name}" has no command or url`);
	}
	const client = deps.createClient();
	await client.connect(transport);
	const [tools, resources] = await Promise.all([
		discoverTools(client), discoverResources(client),
	]);
	return {
		name, client, transport, status: "connected",
		lastUsedAt: Date.now(), inFlight: 0, tools, resources,
	};
}
