import { describe, expect, it, vi, beforeEach } from "vitest";

const mockStdioInstance = { close: vi.fn(), start: vi.fn(), send: vi.fn() };
const mockStreamableInstance = { close: vi.fn(), start: vi.fn(), send: vi.fn() };
const mockSseInstance = { close: vi.fn(), start: vi.fn(), send: vi.fn() };

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
	StdioClientTransport: vi.fn().mockImplementation(() => mockStdioInstance),
}));
vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
	StreamableHTTPClientTransport: vi.fn().mockImplementation(() => mockStreamableInstance),
}));
vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => ({
	SSEClientTransport: vi.fn().mockImplementation(() => mockSseInstance),
}));

import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
	createSdkStdioTransport,
	createSdkStreamableHttpTransport,
	createSdkSseTransport,
} from "../src/sdk-transport.js";

describe("createSdkStdioTransport", () => {
	beforeEach(() => vi.clearAllMocks());

	it("creates StdioClientTransport with params", () => {
		const t = createSdkStdioTransport("node", ["s.js"], { FOO: "1" }, "/tmp");
		expect(StdioClientTransport).toHaveBeenCalledWith({
			command: "node", args: ["s.js"], env: { FOO: "1" }, cwd: "/tmp", stderr: "pipe",
		});
		expect(t).toBe(mockStdioInstance);
	});

	it("passes undefined env and cwd", () => {
		createSdkStdioTransport("cmd", [], undefined, undefined);
		expect(StdioClientTransport).toHaveBeenCalledWith({
			command: "cmd", args: [], env: undefined, cwd: undefined, stderr: "pipe",
		});
	});
});

describe("createSdkStreamableHttpTransport", () => {
	beforeEach(() => vi.clearAllMocks());

	it("creates StreamableHTTPClientTransport with URL and headers", () => {
		const t = createSdkStreamableHttpTransport("http://host/mcp", { "x-k": "v" });
		expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
			expect.objectContaining({ href: "http://host/mcp" }),
			{ requestInit: { headers: { "x-k": "v" } } },
		);
		expect(t).toBe(mockStreamableInstance);
	});

	it("creates transport without headers", () => {
		createSdkStreamableHttpTransport("http://h/m", undefined);
		expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
			expect.any(URL),
			{ requestInit: {} },
		);
	});
});

describe("createSdkSseTransport", () => {
	beforeEach(() => vi.clearAllMocks());

	it("creates SSEClientTransport with URL and headers", () => {
		const t = createSdkSseTransport("http://host/sse", { auth: "tok" });
		expect(SSEClientTransport).toHaveBeenCalledWith(
			expect.objectContaining({ href: "http://host/sse" }),
			{ requestInit: { headers: { auth: "tok" } } },
		);
		expect(t).toBe(mockSseInstance);
	});

	it("creates transport without headers", () => {
		createSdkSseTransport("http://h/s", undefined);
		expect(SSEClientTransport).toHaveBeenCalledWith(
			expect.any(URL),
			{ requestInit: {} },
		);
	});
});
