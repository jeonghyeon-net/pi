import type { McpClient, McpToolRaw, McpResourceRaw } from "./types-server.js";
import type { ToolMetadata } from "./types-tool.js";

function toolRawToMetadata(raw: McpToolRaw, serverName: string): ToolMetadata {
	return {
		name: raw.name,
		originalName: raw.name,
		serverName,
		description: raw.description ?? "",
		inputSchema: raw.inputSchema,
	};
}

function resourceRawToMetadata(
	raw: McpResourceRaw,
	serverName: string,
): ToolMetadata {
	return {
		name: raw.name,
		originalName: raw.name,
		serverName,
		description: raw.description ?? "",
		resourceUri: raw.uri,
	};
}

export async function buildToolMetadata(
	client: McpClient,
	serverName: string,
): Promise<ToolMetadata[]> {
	const all: ToolMetadata[] = [];
	let cursor: string | undefined;
	do {
		const result = await client.listTools(
			cursor ? { cursor } : undefined,
		);
		for (const tool of result.tools) {
			all.push(toolRawToMetadata(tool, serverName));
		}
		cursor = result.nextCursor;
	} while (cursor);
	return all;
}

export async function buildResourceMetadata(
	client: McpClient,
	serverName: string,
): Promise<ToolMetadata[]> {
	const all: ToolMetadata[] = [];
	let cursor: string | undefined;
	do {
		const result = await client.listResources(
			cursor ? { cursor } : undefined,
		);
		for (const res of result.resources) {
			all.push(resourceRawToMetadata(res, serverName));
		}
		cursor = result.nextCursor;
	} while (cursor);
	return all;
}
