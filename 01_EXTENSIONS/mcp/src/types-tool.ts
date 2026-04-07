export interface ToolMetadata {
	name: string;
	originalName: string;
	serverName: string;
	description: string;
	inputSchema?: Record<string, unknown>;
	resourceUri?: string;
}

export interface DirectToolSpec {
	serverName: string;
	originalName: string;
	prefixedName: string;
	description: string;
	inputSchema?: Record<string, unknown>;
	resourceUri?: string;
}

export interface ToolDef {
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters: unknown;
	execute: ToolExecuteFn;
}

export type ToolExecuteFn = (
	toolCallId: string,
	params: Record<string, unknown>,
	signal: unknown,
	onUpdate: unknown,
	ctx: unknown,
) => Promise<ToolResult>;

export type ToolContentBlock = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

export interface ToolResult {
	content: ToolContentBlock[];
	details?: Record<string, unknown>;
}
