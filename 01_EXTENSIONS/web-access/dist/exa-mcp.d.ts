import type { McpRpcResponse, FetchFn } from "./types.js";
export declare function buildRpcBody(toolName: string, args: Record<string, unknown>): string;
export declare function parseSseResponse(body: string): McpRpcResponse | null;
export declare function extractText(parsed: McpRpcResponse): string;
export declare function callExaMcp(toolName: string, args: Record<string, unknown>, fetchImpl?: FetchFn, signal?: AbortSignal): Promise<string>;
