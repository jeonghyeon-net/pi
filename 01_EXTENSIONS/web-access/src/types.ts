import { Type } from "@sinclair/typebox";

export const WebSearchParams = Type.Object({
	query: Type.String({ description: "Search query" }),
	numResults: Type.Optional(Type.Number({ description: "Number of results (default 5)" })),
});

export const CodeSearchParams = Type.Object({
	query: Type.String({ description: "Code search query" }),
	maxTokens: Type.Optional(Type.Number({ description: "Max tokens (default 5000)" })),
});

export const FetchContentParams = Type.Object({
	url: Type.String({ description: "URL to fetch and extract content from" }),
});

export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

export interface ExtractedContent {
	url: string;
	title: string;
	content: string;
	error: string | null;
}

export interface McpRpcResponse {
	result?: {
		content?: Array<{ type?: string; text?: string }>;
		isError?: boolean;
	};
	error?: { code?: number; message?: string };
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
