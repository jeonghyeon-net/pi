import { describe, expect, it, vi } from "vitest";
import { buildToolMetadata, buildResourceMetadata } from "../src/tool-metadata.js";
import type { McpClient } from "../src/types-server.js";

describe("buildToolMetadata pagination", () => {
	it("collects tools across multiple pages", async () => {
		const client: McpClient = {
			listTools: vi.fn()
				.mockResolvedValueOnce({
					tools: [{ name: "t1", description: "first" }],
					nextCursor: "page2",
				})
				.mockResolvedValueOnce({
					tools: [{ name: "t2", description: "second" }],
					nextCursor: undefined,
				}),
			listResources: vi.fn().mockResolvedValue({ resources: [] }),
			callTool: vi.fn(), readResource: vi.fn(),
			ping: vi.fn(), close: vi.fn(),
		};
		const result = await buildToolMetadata(client, "srv");
		expect(result).toHaveLength(2);
		expect(result[0].name).toBe("t1");
		expect(result[1].name).toBe("t2");
		expect(client.listTools).toHaveBeenCalledTimes(2);
		expect(client.listTools).toHaveBeenCalledWith({ cursor: "page2" });
	});
});

describe("buildResourceMetadata pagination", () => {
	it("collects resources across multiple pages", async () => {
		const client: McpClient = {
			listResources: vi.fn()
				.mockResolvedValueOnce({
					resources: [{ uri: "f:///a", name: "a", description: "A" }],
					nextCursor: "pg2",
				})
				.mockResolvedValueOnce({
					resources: [{ uri: "f:///b", name: "b" }],
					nextCursor: undefined,
				}),
			listTools: vi.fn().mockResolvedValue({ tools: [] }),
			callTool: vi.fn(), readResource: vi.fn(),
			ping: vi.fn(), close: vi.fn(),
		};
		const result = await buildResourceMetadata(client, "srv");
		expect(result).toHaveLength(2);
		expect(result[0].resourceUri).toBe("f:///a");
		expect(result[1].resourceUri).toBe("f:///b");
		expect(result[1].description).toBe("");
	});
});
