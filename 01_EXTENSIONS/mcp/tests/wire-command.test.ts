import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/server-connect.js", () => ({
	connectServer: vi.fn().mockResolvedValue({
		name: "s1", client: { listTools: vi.fn(), close: vi.fn() },
		transport: { close: vi.fn() }, status: "connected", lastUsedAt: 0, inFlight: 0,
		tools: [], resources: [],
	}),
}));
vi.mock("../src/tool-metadata.js", () => ({ buildToolMetadata: vi.fn().mockResolvedValue([]) }));
vi.mock("../src/state.js", () => ({
	setConnection: vi.fn(), removeConnection: vi.fn(), setMetadata: vi.fn(),
	getConnections: vi.fn().mockReturnValue(new Map()),
}));

const mockStdio = vi.fn().mockReturnValue({ close: vi.fn() });
const mockStreamable = vi.fn().mockReturnValue({ close: vi.fn() });
const mockSse = vi.fn().mockReturnValue({ close: vi.fn() });
const mockClient = vi.fn().mockReturnValue({ connect: vi.fn() });

vi.mock("../src/sdk-transport.js", () => ({
	createSdkStdioTransport: (...a: unknown[]) => mockStdio(...a),
	createSdkStreamableHttpTransport: (...a: unknown[]) => mockStreamable(...a),
	createSdkSseTransport: (...a: unknown[]) => mockSse(...a),
}));
vi.mock("../src/sdk-client.js", () => ({
	createSdkClient: () => mockClient(),
}));

import { wireCommandConnect, wireCommandClose, makeConnectDeps } from "../src/wire-command.js";
import { connectServer } from "../src/server-connect.js";
import { setConnection, getConnections, removeConnection, setMetadata } from "../src/state.js";
import { buildToolMetadata } from "../src/tool-metadata.js";

describe("makeConnectDeps", () => {
	beforeEach(() => vi.clearAllMocks());
	it("creates stdio transport via SDK factory", () => {
		const d = makeConnectDeps();
		d.createStdioTransport({ command: "node", args: ["s.js"] }, {});
		expect(mockStdio).toHaveBeenCalledWith("node", ["s.js"], undefined, undefined);
	});
	it("creates http transport via streamable SDK factory", async () => {
		const d = makeConnectDeps();
		await d.createHttpTransport("http://x", { "x-key": "v" });
		expect(mockStreamable).toHaveBeenCalledWith("http://x", { "x-key": "v" });
	});
	it("falls back to SSE when streamable throws", async () => {
		mockStreamable.mockImplementationOnce(() => { throw new Error("fail"); });
		const d = makeConnectDeps();
		await d.createHttpTransport("http://x", undefined);
		expect(mockSse).toHaveBeenCalledWith("http://x", undefined);
	});
	it("creates client via SDK factory and exposes processEnv", () => {
		const d = makeConnectDeps();
		d.createClient();
		expect(mockClient).toHaveBeenCalled();
		expect(d.processEnv).toBeDefined();
	});
});

describe("wireCommandConnect", () => {
	beforeEach(() => vi.clearAllMocks());
	it("connects server and stores connection + metadata", async () => {
		const fn = wireCommandConnect();
		await fn("s1", { command: "node" });
		expect(connectServer).toHaveBeenCalledWith("s1", { command: "node" }, expect.anything());
		expect(setConnection).toHaveBeenCalled();
		expect(buildToolMetadata).toHaveBeenCalled();
		expect(setMetadata).toHaveBeenCalled();
	});
});

describe("wireCommandClose", () => {
	beforeEach(() => vi.clearAllMocks());
	const mkConn = (clientErr?: boolean, transportErr?: boolean) => ({
		name: "s1",
		client: { close: clientErr ? vi.fn().mockRejectedValue(new Error("f")) : vi.fn().mockResolvedValue(undefined) },
		transport: { close: transportErr ? vi.fn().mockRejectedValue(new Error("f")) : vi.fn().mockResolvedValue(undefined) },
		status: "connected", lastUsedAt: 0, inFlight: 0,
	});

	it("closes and removes connection; no-ops for unknown", async () => {
		const conn = mkConn();
		vi.mocked(getConnections).mockReturnValue(new Map([["s1", conn]]));
		await wireCommandClose()("s1");
		expect(conn.status).toBe("closed");
		expect(removeConnection).toHaveBeenCalledWith("s1");
		vi.mocked(getConnections).mockReturnValue(new Map());
		vi.mocked(removeConnection).mockClear();
		await wireCommandClose()("unknown");
		expect(removeConnection).not.toHaveBeenCalled();
	});
	it("swallows client and transport close errors", async () => {
		vi.mocked(getConnections).mockReturnValue(new Map([["s1", mkConn(true)]]));
		await expect(wireCommandClose()("s1")).resolves.toBeUndefined();
		vi.mocked(getConnections).mockReturnValue(new Map([["s1", mkConn(false, true)]]));
		await expect(wireCommandClose()("s1")).resolves.toBeUndefined();
	});
});
