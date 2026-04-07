import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ConnectableClient } from "./server-connect.js";
import type { McpTransport, CallToolResult, ListToolsResult, ListResourcesResult, ReadResourceResult } from "./types-server.js";

const CLIENT_INFO = { name: "pi-mcp", version: "1.0.0" };

function asSdkTransport(t: McpTransport): Transport {
	const st = t as Transport;
	if (typeof st.start !== "function" || typeof st.send !== "function") {
		throw new Error("Transport is not an SDK transport");
	}
	return st;
}

export function createSdkClient(): ConnectableClient {
	const sdk = new Client(CLIENT_INFO);
	return {
		async connect(transport: McpTransport): Promise<void> {
			await sdk.connect(asSdkTransport(transport));
		},
		async callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<CallToolResult> {
			const r = await sdk.callTool(params);
			return { content: Array.isArray(r.content) ? r.content : [] };
		},
		async listTools(params?: { cursor?: string }): Promise<ListToolsResult> {
			const r = await sdk.listTools(params);
			return { tools: r.tools, nextCursor: r.nextCursor };
		},
		async listResources(params?: { cursor?: string }): Promise<ListResourcesResult> {
			const r = await sdk.listResources(params);
			return { resources: r.resources, nextCursor: r.nextCursor };
		},
		async readResource(params: { uri: string }): Promise<ReadResourceResult> {
			const r = await sdk.readResource(params);
			return { contents: r.contents };
		},
		async ping(): Promise<void> {
			await sdk.ping();
		},
		async close(): Promise<void> {
			await sdk.close();
		},
	};
}
