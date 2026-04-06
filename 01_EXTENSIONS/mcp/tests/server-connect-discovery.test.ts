import { describe, expect, it, vi } from "vitest";
import { connectServer } from "../src/server-connect.js";
import type { ConnectDeps } from "../src/server-connect.js";
import type { McpTransport, McpToolRaw, McpResourceRaw } from "../src/types-server.js";

function makeDeps(
	tools: McpToolRaw[],
	resources: McpResourceRaw[],
	toolCursor?: string,
): ConnectDeps {
	const transport: McpTransport = { close: vi.fn() };
	let toolCall = 0;
	return {
		createStdioTransport: vi.fn().mockReturnValue(transport),
		createHttpTransport: vi.fn().mockResolvedValue(transport),
		createClient: vi.fn().mockReturnValue({
			callTool: vi.fn(),
			listTools: vi.fn().mockImplementation(() => {
				toolCall++;
				if (toolCall === 1 && toolCursor) {
					return Promise.resolve({
						tools: tools.slice(0, 1), nextCursor: toolCursor,
					});
				}
				return Promise.resolve({
					tools: toolCall === 1 ? tools : tools.slice(1),
				});
			}),
			listResources: vi.fn().mockResolvedValue({ resources }),
			readResource: vi.fn(), ping: vi.fn(), close: vi.fn(),
			connect: vi.fn().mockResolvedValue(undefined),
		}),
		processEnv: {},
	};
}

describe("connectServer discovery", () => {
	it("discovers tools", async () => {
		const tools: McpToolRaw[] = [{ name: "echo", description: "Echo tool" }];
		const deps = makeDeps(tools, []);
		const conn = await connectServer("s1", { command: "echo" }, deps);
		expect(conn.tools).toEqual(tools);
	});

	it("discovers resources", async () => {
		const resources: McpResourceRaw[] = [{ uri: "file:///a", name: "doc" }];
		const deps = makeDeps([], resources);
		const conn = await connectServer("s1", { command: "echo" }, deps);
		expect(conn.resources).toEqual(resources);
	});

	it("paginates tools across multiple pages", async () => {
		const tools: McpToolRaw[] = [
			{ name: "t1", description: "Tool 1" },
			{ name: "t2", description: "Tool 2" },
		];
		const deps = makeDeps(tools, [], "cursor1");
		const conn = await connectServer("s1", { command: "echo" }, deps);
		expect(conn.tools).toHaveLength(2);
	});

	it("returns empty arrays when no tools/resources", async () => {
		const deps = makeDeps([], []);
		const conn = await connectServer("s1", { command: "echo" }, deps);
		expect(conn.tools).toEqual([]);
		expect(conn.resources).toEqual([]);
	});

	it("paginates resources across multiple pages", async () => {
		const resources: McpResourceRaw[] = [
			{ uri: "file:///a", name: "doc1" },
			{ uri: "file:///b", name: "doc2" },
		];
		const transport: McpTransport = { close: vi.fn() };
		let resCall = 0;
		const deps: ConnectDeps = {
			createStdioTransport: vi.fn().mockReturnValue(transport),
			createHttpTransport: vi.fn().mockResolvedValue(transport),
			createClient: vi.fn().mockReturnValue({
				callTool: vi.fn(),
				listTools: vi.fn().mockResolvedValue({ tools: [] }),
				listResources: vi.fn().mockImplementation(() => {
					resCall++;
					if (resCall === 1) {
						return Promise.resolve({
							resources: resources.slice(0, 1), nextCursor: "rc1",
						});
					}
					return Promise.resolve({ resources: resources.slice(1) });
				}),
				readResource: vi.fn(), ping: vi.fn(), close: vi.fn(),
				connect: vi.fn().mockResolvedValue(undefined),
			}),
			processEnv: {},
		};
		const conn = await connectServer("s1", { command: "echo" }, deps);
		expect(conn.resources).toHaveLength(2);
	});
});
