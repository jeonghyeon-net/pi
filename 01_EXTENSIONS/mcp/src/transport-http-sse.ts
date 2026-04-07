import type { McpTransport } from "./types-server.js";

export type SseTransportFactory = (
	url: string,
	headers?: Record<string, string>,
) => Promise<McpTransport>;

export async function createSseTransport(
	url: string,
	headers: Record<string, string> | undefined,
	factory: SseTransportFactory,
): Promise<McpTransport> {
	return factory(url, headers);
}
