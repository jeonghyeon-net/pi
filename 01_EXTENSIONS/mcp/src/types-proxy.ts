export type ProxyAction = "call" | "list" | "describe" | "search" | "status" | "connect";

export interface ProxyParams {
	action: ProxyAction;
	tool?: string;
	args?: Record<string, unknown>;
	server?: string;
	query?: string;
}

export type ContentBlock = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

export interface ProxyToolResult {
	content: ContentBlock[];
	details?: Record<string, unknown>;
}

export interface ProxyErrorResult {
	code: string;
	message: string;
	hint?: string;
	server?: string;
	tool?: string;
}
