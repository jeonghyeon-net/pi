export type ConnectionStatus = "connected" | "closed" | "failed";

export interface McpClient {
	callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<CallToolResult>;
	listTools(params?: { cursor?: string }): Promise<ListToolsResult>;
	listResources(params?: { cursor?: string }): Promise<ListResourcesResult>;
	readResource(params: { uri: string }): Promise<ReadResourceResult>;
	ping(): Promise<void>;
	close(): Promise<void>;
}

export interface CallToolResult {
	content: McpContent[];
}

export interface ListToolsResult {
	tools: McpToolRaw[];
	nextCursor?: string;
}

export interface ListResourcesResult {
	resources: McpResourceRaw[];
	nextCursor?: string;
}

export interface ReadResourceResult {
	contents: Array<{ uri: string; text?: string; blob?: string; mimeType?: string }>;
}

export interface McpToolRaw {
	name: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
}

export interface McpResourceRaw {
	uri: string;
	name: string;
	description?: string;
	mimeType?: string;
}

export interface McpContent {
	type: string;
	text?: string;
	data?: string;
	mimeType?: string;
	resource?: { uri: string; text?: string; blob?: string };
	uri?: string;
	name?: string;
}

export interface McpTransport {
	close(): Promise<void>;
}

export interface ServerConnection {
	name: string;
	client: McpClient;
	transport: McpTransport;
	status: ConnectionStatus;
	lastUsedAt: number;
	inFlight: number;
}
