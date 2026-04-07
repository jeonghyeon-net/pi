import { describe, expect, it, vi } from "vitest";
import { buildToolMetadata, buildResourceMetadata } from "../src/tool-metadata.js";
import type { McpClient } from "../src/types-server.js";

function mockClient(
	tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>,
	resources: Array<{ uri: string; name: string; description?: string; mimeType?: string }>,
): McpClient {
	return {
		listTools: vi.fn().mockResolvedValue({ tools, nextCursor: undefined }),
		listResources: vi.fn().mockResolvedValue({ resources, nextCursor: undefined }),
		callTool: vi.fn(),
		readResource: vi.fn(),
		ping: vi.fn(),
		close: vi.fn(),
	};
}

describe("buildToolMetadata", () => {
	it("builds metadata from tools list", async () => {
		const client = mockClient(
			[{ name: "search", description: "Search the web" }], [],
		);
		const result = await buildToolMetadata(client, "myserver");
		expect(result).toEqual([{
			name: "search", originalName: "search",
			serverName: "myserver", description: "Search the web",
			inputSchema: undefined,
		}]);
	});
	it("includes inputSchema when present", async () => {
		const schema = { type: "object", properties: { q: { type: "string" } } };
		const client = mockClient([{ name: "t1", inputSchema: schema }], []);
		const result = await buildToolMetadata(client, "s");
		expect(result[0].inputSchema).toEqual(schema);
	});
	it("handles empty tools list", async () => {
		const client = mockClient([], []);
		const result = await buildToolMetadata(client, "s");
		expect(result).toEqual([]);
	});
	it("uses empty string for missing description", async () => {
		const client = mockClient([{ name: "t1" }], []);
		const result = await buildToolMetadata(client, "s");
		expect(result[0].description).toBe("");
	});
});

describe("buildResourceMetadata", () => {
	it("builds resource metadata with resourceUri", async () => {
		const client = mockClient(
			[], [{ uri: "file:///doc", name: "doc", description: "A doc" }],
		);
		const result = await buildResourceMetadata(client, "srv");
		expect(result).toEqual([{
			name: "doc", originalName: "doc",
			serverName: "srv", description: "A doc",
			resourceUri: "file:///doc",
		}]);
	});
	it("handles empty resources list", async () => {
		const client = mockClient([], []);
		const result = await buildResourceMetadata(client, "s");
		expect(result).toEqual([]);
	});
});
