import type { McpTransport } from "./types-server.js";

export interface TransportFactory {
	createStreamableHttp(
		url: string,
		headers?: Record<string, string>,
	): Promise<McpTransport>;
	createSse(
		url: string,
		headers?: Record<string, string>,
	): Promise<McpTransport>;
}

export async function createHttpTransport(
	url: string,
	headers: Record<string, string> | undefined,
	factory: TransportFactory,
): Promise<McpTransport> {
	try {
		return await factory.createStreamableHttp(url, headers);
	} catch {
		return factory.createSse(url, headers);
	}
}
