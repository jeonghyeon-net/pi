import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { McpTransport } from "./types-server.js";

export type SdkTransport = Transport & McpTransport;

export function createSdkStdioTransport(
	command: string,
	args: string[],
	env: Record<string, string> | undefined,
	cwd: string | undefined,
): SdkTransport {
	const merged: Record<string, string> = {};
	if (env) { for (const [k, v] of Object.entries({ ...process.env, ...env })) { if (v) merged[k] = v; } }
	const mergedEnv = env ? merged : undefined;
	return new StdioClientTransport({
		command,
		args,
		env: mergedEnv,
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
