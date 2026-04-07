import { describe, it, expect, vi } from "vitest";
import type {
	ConnectionStatus, McpClient, CallToolResult, ListToolsResult,
	ListResourcesResult, ReadResourceResult, McpToolRaw, McpResourceRaw,
	McpContent, McpTransport, ServerConnection,
} from "../src/types-server.js";

function mockClient(): McpClient {
	return {
		callTool: vi.fn().mockResolvedValue({ content: [] }),
		listTools: vi.fn().mockResolvedValue({ tools: [] }),
		listResources: vi.fn().mockResolvedValue({ resources: [] }),
		readResource: vi.fn().mockResolvedValue({ contents: [] }),
		ping: vi.fn().mockResolvedValue(undefined),
		close: vi.fn().mockResolvedValue(undefined),
	};
}

describe("types-server", () => {
	it("ConnectionStatus accepts valid values", () => {
		const s: ConnectionStatus[] = ["connected", "closed", "failed"];
		expect(s).toHaveLength(3);
	});

	it("McpClient methods are callable", async () => {
		const client = mockClient();
		const callResult = await client.callTool({ name: "test" });
		expect(callResult.content).toEqual([]);
		await client.ping();
		expect(client.ping).toHaveBeenCalled();
	});

	it("result types hold expected data", () => {
		const call: CallToolResult = { content: [{ type: "text", text: "hello" }] };
		expect(call.content).toHaveLength(1);
		const tools: ListToolsResult = { tools: [{ name: "read" }], nextCursor: "abc" };
		expect(tools.nextCursor).toBe("abc");
		const res: ListResourcesResult = { resources: [{ uri: "file:///a", name: "a" }] };
		expect(res.nextCursor).toBeUndefined();
		const read: ReadResourceResult = {
			contents: [{ uri: "file:///b", text: "data", mimeType: "text/plain" }],
		};
		expect(read.contents[0].text).toBe("data");
	});

	it("raw types have required and optional fields", () => {
		const tool: McpToolRaw = { name: "bash", inputSchema: { type: "object" } };
		expect(tool.description).toBeUndefined();
		const res: McpResourceRaw = {
			uri: "file:///x", name: "x", description: "a file", mimeType: "text/plain",
		};
		expect(res.uri).toBe("file:///x");
	});

	it("McpContent supports all content types", () => {
		const c: McpContent = {
			type: "resource", resource: { uri: "file:///a", text: "hello" },
			uri: "file:///a", name: "a",
		};
		expect(c.resource?.text).toBe("hello");
	});

	it("McpTransport can close", async () => {
		const t: McpTransport = { close: vi.fn().mockResolvedValue(undefined) };
		await t.close();
		expect(t.close).toHaveBeenCalled();
	});

	it("ServerConnection holds all fields", () => {
		const conn: ServerConnection = {
			name: "test-server", client: mockClient(),
			transport: { close: vi.fn().mockResolvedValue(undefined) },
			status: "connected", lastUsedAt: Date.now(), inFlight: 0,
		};
		expect(conn.name).toBe("test-server");
		expect(conn.status).toBe("connected");
		expect(conn.inFlight).toBe(0);
	});
});
