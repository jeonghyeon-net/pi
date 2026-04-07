import type { ProxyToolResult } from "./types-proxy.js";
import type { McpContent } from "./types-server.js";
import type { ToolMetadata } from "./types-tool.js";

interface CallClient {
	callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<{ content: McpContent[] }>;
}

interface CallConnection {
	name: string;
	client: CallClient;
	status: string;
	lastUsedAt: number;
	inFlight: number;
}

type ContentBlock = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

export interface CallDeps {
	findTool: (name: string) => ToolMetadata | undefined;
	getOrConnect: (server: string) => Promise<CallConnection>;
	checkConsent: (server: string) => Promise<boolean>;
	transform: (content: McpContent) => ContentBlock;
}

export async function proxyCall(
	toolName: string,
	args: Record<string, unknown> | undefined,
	deps: CallDeps,
): Promise<ProxyToolResult> {
	const meta = deps.findTool(toolName);
	if (!meta) {
		return { content: [{ type: "text", text: `Tool "${toolName}" not found. Try action: "search".` }] };
	}
	const allowed = await deps.checkConsent(meta.serverName);
	if (!allowed) {
		return { content: [{ type: "text", text: `Execution denied for server "${meta.serverName}".` }] };
	}
	const conn = await deps.getOrConnect(meta.serverName);
	conn.inFlight++;
	try {
		const result = await conn.client.callTool({
			name: meta.originalName,
			arguments: args,
		});
		conn.lastUsedAt = Date.now();
		return { content: result.content.map(deps.transform) };
	} finally {
		conn.inFlight--;
	}
}
