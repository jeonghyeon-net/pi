import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { McpTransport } from "./types-server.js";

export interface SdkTransport extends McpTransport {
	start(): Promise<void>;
	send(message: unknown): Promise<void>;
	onclose?: () => void;
	onerror?: (error: Error) => void;
	onmessage?: (message: unknown) => void;
}

export function createSdkStdioTransport(
	command: string,
	args: string[],
	env: Record<string, string> | undefined,
	cwd: string | undefined,
): SdkTransport {
	return new StdioClientTransport({
		command,
		args,
		env,
		cwd,
		stderr: "pipe",
	});
}

export function createSdkStreamableHttpTransport(
	url: string,
	headers: Record<string, string> | undefined,
): SdkTransport {
	const reqInit: RequestInit = {};
	if (headers) reqInit.headers = headers;
	return new StreamableHTTPClientTransport(
		new URL(url),
		{ requestInit: reqInit },
	);
}

export function createSdkSseTransport(
	url: string,
	headers: Record<string, string> | undefined,
): SdkTransport {
	const reqInit: RequestInit = {};
	if (headers) reqInit.headers = headers;
	return new SSEClientTransport(
		new URL(url),
		{ requestInit: reqInit },
	);
}
