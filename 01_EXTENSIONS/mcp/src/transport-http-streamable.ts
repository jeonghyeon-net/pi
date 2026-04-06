import type { McpTransport } from "./types-server.js";

export type StreamableHttpFactory = (
	url: string,
	headers?: Record<string, string>,
) => Promise<McpTransport>;

export async function createStreamableHttpTransport(
	url: string,
	headers: Record<string, string> | undefined,
	factory: StreamableHttpFactory,
): Promise<McpTransport> {
	return factory(url, headers);
}
