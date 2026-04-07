import { describe, expect, it, vi, beforeEach } from "vitest";

const mockConnect = vi.fn();
const mockCallTool = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
const mockListTools = vi.fn().mockResolvedValue({ tools: [{ name: "t1" }], nextCursor: "c" });
const mockListResources = vi.fn().mockResolvedValue({ resources: [{ uri: "r://1", name: "r1" }] });
const mockReadResource = vi.fn().mockResolvedValue({ contents: [{ uri: "r://1", text: "hi" }] });
const mockPing = vi.fn().mockResolvedValue({});
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
	Client: vi.fn().mockImplementation(() => ({
		connect: mockConnect,
		callTool: mockCallTool,
		listTools: mockListTools,
		listResources: mockListResources,
		readResource: mockReadResource,
		ping: mockPing,
		close: mockClose,
	})),
}));

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createSdkClient } from "../src/sdk-client.js";
import type { SdkTransport } from "../src/sdk-transport.js";

function fakeTransport(): SdkTransport {
	return { start: vi.fn(), send: vi.fn(), close: vi.fn() };
}

describe("createSdkClient", () => {
	beforeEach(() => vi.clearAllMocks());

	it("creates Client with pi-mcp info", () => {
		createSdkClient();
		expect(Client).toHaveBeenCalledWith({ name: "pi-mcp", version: "1.0.0" });
	});

	it("connect delegates to SDK client", async () => {
		const c = createSdkClient();
		const t = fakeTransport();
		await c.connect(t);
		expect(mockConnect).toHaveBeenCalledWith(t);
	});

	it("connect rejects non-SDK transport", async () => {
		const c = createSdkClient();
		const bad = { close: vi.fn() };
		await expect(c.connect(bad)).rejects.toThrow("not an SDK transport");
	});

	it("callTool returns content array", async () => {
		const c = createSdkClient();
		const r = await c.callTool({ name: "t1", arguments: { x: 1 } });
		expect(mockCallTool).toHaveBeenCalledWith({ name: "t1", arguments: { x: 1 } });
		expect(r.content).toEqual([{ type: "text", text: "ok" }]);
	});

	it("callTool returns empty content when SDK returns non-array", async () => {
		mockCallTool.mockResolvedValueOnce({ toolResult: "x" });
		const c = createSdkClient();
		const r = await c.callTool({ name: "t1" });
		expect(r.content).toEqual([]);
	});

	it("listTools returns tools and cursor", async () => {
		const c = createSdkClient();
		const r = await c.listTools({ cursor: "abc" });
		expect(mockListTools).toHaveBeenCalledWith({ cursor: "abc" });
		expect(r.tools).toEqual([{ name: "t1" }]);
		expect(r.nextCursor).toBe("c");
	});

	it("listResources returns resources", async () => {
		const c = createSdkClient();
		const r = await c.listResources();
		expect(r.resources).toEqual([{ uri: "r://1", name: "r1" }]);
	});

	it("readResource returns contents", async () => {
		const c = createSdkClient();
		const r = await c.readResource({ uri: "r://1" });
		expect(mockReadResource).toHaveBeenCalledWith({ uri: "r://1" });
		expect(r.contents).toEqual([{ uri: "r://1", text: "hi" }]);
	});

	it("ping resolves void", async () => {
		const c = createSdkClient();
		await expect(c.ping()).resolves.toBeUndefined();
		expect(mockPing).toHaveBeenCalled();
	});

	it("close delegates to SDK client", async () => {
		const c = createSdkClient();
		await c.close();
		expect(mockClose).toHaveBeenCalled();
	});
});
