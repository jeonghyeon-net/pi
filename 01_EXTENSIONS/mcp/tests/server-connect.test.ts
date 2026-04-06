import { describe, expect, it, vi } from "vitest";
import { connectServer } from "../src/server-connect.js";
import type { ConnectDeps } from "../src/server-connect.js";
import type { McpTransport } from "../src/types-server.js";

function makeDeps(overrides?: Partial<ConnectDeps>): ConnectDeps {
	const transport: McpTransport = { close: vi.fn() };
	return {
		createStdioTransport: vi.fn().mockReturnValue(transport),
		createHttpTransport: vi.fn().mockResolvedValue(transport),
		createClient: vi.fn().mockReturnValue({
			callTool: vi.fn(),
			listTools: vi.fn().mockResolvedValue({ tools: [] }),
			listResources: vi.fn().mockResolvedValue({ resources: [] }),
			readResource: vi.fn(), ping: vi.fn(), close: vi.fn(),
			connect: vi.fn().mockResolvedValue(undefined),
		}),
		processEnv: {},
		...overrides,
	};
}

describe("connectServer", () => {
	it("uses stdio transport for command-based entry", async () => {
		const deps = makeDeps();
		const conn = await connectServer("s1", { command: "echo" }, deps);
		expect(conn.name).toBe("s1");
		expect(conn.status).toBe("connected");
		expect(deps.createStdioTransport).toHaveBeenCalled();
		expect(deps.createHttpTransport).not.toHaveBeenCalled();
	});

	it("uses http transport for url-based entry", async () => {
		const deps = makeDeps();
		const conn = await connectServer("s1", { url: "http://localhost" }, deps);
		expect(conn.name).toBe("s1");
		expect(deps.createHttpTransport).toHaveBeenCalledWith("http://localhost", undefined);
		expect(deps.createStdioTransport).not.toHaveBeenCalled();
	});

	it("passes headers for http transport", async () => {
		const deps = makeDeps();
		const headers = { "X-Key": "val" };
		await connectServer("s1", { url: "http://h", headers }, deps);
		expect(deps.createHttpTransport).toHaveBeenCalledWith("http://h", headers);
	});

	it("throws on entry without command or url", async () => {
		const deps = makeDeps();
		await expect(connectServer("s1", {}, deps)).rejects.toThrow("no command or url");
	});

	it("calls client.connect with transport", async () => {
		const transport: McpTransport = { close: vi.fn() };
		const connectFn = vi.fn().mockResolvedValue(undefined);
		const deps = makeDeps({
			createStdioTransport: vi.fn().mockReturnValue(transport),
			createClient: vi.fn().mockReturnValue({
				callTool: vi.fn(),
				listTools: vi.fn().mockResolvedValue({ tools: [] }),
				listResources: vi.fn().mockResolvedValue({ resources: [] }),
				readResource: vi.fn(), ping: vi.fn(), close: vi.fn(),
				connect: connectFn,
			}),
		});
		await connectServer("s1", { command: "echo" }, deps);
		expect(connectFn).toHaveBeenCalledWith(transport);
	});
});
