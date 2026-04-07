import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/server-connect.js", () => ({
	connectServer: vi.fn().mockResolvedValue({
		name: "s1", client: { listTools: vi.fn(), close: vi.fn() },
		transport: { close: vi.fn() }, status: "connected", lastUsedAt: 0, inFlight: 0, tools: [], resources: [],
	}),
}));
vi.mock("../src/tool-metadata.js", () => ({ buildToolMetadata: vi.fn().mockResolvedValue([]) }));
vi.mock("../src/state.js", () => ({
	setConnection: vi.fn(), removeConnection: vi.fn(), setMetadata: vi.fn(),
	getConnections: vi.fn().mockReturnValue(new Map()),
	getConfig: vi.fn().mockReturnValue(null), getAllMetadata: vi.fn().mockReturnValue(new Map()),
}));
vi.mock("../src/failure-tracker.js", () => ({ recordFailure: vi.fn(), clearFailure: vi.fn() }));
vi.mock("../src/config-hash.js", () => ({ computeConfigHash: vi.fn().mockReturnValue("hash") }));
vi.mock("../src/wire-init-config.js", () => ({ wireSaveCache: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)) }));
const mockStdio = vi.fn().mockReturnValue({ close: vi.fn() });
const mockStreamable = vi.fn().mockReturnValue({ close: vi.fn() });
const mockSse = vi.fn().mockReturnValue({ close: vi.fn() });
const mockClient = vi.fn().mockReturnValue({ connect: vi.fn() });
vi.mock("../src/sdk-transport.js", () => ({
	createSdkStdioTransport: (...a: unknown[]) => mockStdio(...a),
	createSdkStreamableHttpTransport: (...a: unknown[]) => mockStreamable(...a),
	createSdkSseTransport: (...a: unknown[]) => mockSse(...a),
}));
vi.mock("../src/sdk-client.js", () => ({ createSdkClient: () => mockClient() }));

import { wireCommandConnect, wireCommandClose, makeConnectDeps } from "../src/wire-command.js";
import { connectServer } from "../src/server-connect.js";
import { setConnection, getConnections, removeConnection, setMetadata } from "../src/state.js";
import { buildToolMetadata } from "../src/tool-metadata.js";
import { recordFailure, clearFailure } from "../src/failure-tracker.js";

describe("makeConnectDeps", () => {
	beforeEach(() => vi.clearAllMocks());
	it("creates stdio transport", () => { makeConnectDeps().createStdioTransport({ command: "node", args: ["s.js"] }, {}); expect(mockStdio).toHaveBeenCalled(); });
	it("creates http transport", async () => { await makeConnectDeps().createHttpTransport("http://x", { "x-key": "v" }); expect(mockStreamable).toHaveBeenCalled(); });
	it("falls back to SSE", async () => { mockStreamable.mockImplementationOnce(() => { throw new Error("fail"); }); await makeConnectDeps().createHttpTransport("http://x", undefined); expect(mockSse).toHaveBeenCalled(); });
	it("creates client and has processEnv", () => { const d = makeConnectDeps(); d.createClient(); expect(mockClient).toHaveBeenCalled(); expect(d.processEnv).toBeDefined(); });
});

describe("wireCommandConnect", () => {
	beforeEach(() => vi.clearAllMocks());
	it("connects and stores connection + metadata", async () => {
		await wireCommandConnect()("s1", { command: "node" });
		expect(connectServer).toHaveBeenCalled(); expect(setConnection).toHaveBeenCalled();
		expect(clearFailure).toHaveBeenCalledWith("s1"); expect(setMetadata).toHaveBeenCalled();
	});
	it("records failure and rethrows on error", async () => {
		vi.mocked(connectServer).mockRejectedValueOnce(new Error("boom"));
		await expect(wireCommandConnect()("s1", { command: "node" })).rejects.toThrow("boom");
		expect(recordFailure).toHaveBeenCalledWith("s1");
	});
});

describe("wireCommandClose", () => {
	beforeEach(() => vi.clearAllMocks());
	const mkConn = (cErr?: boolean, tErr?: boolean) => ({
		name: "s1", status: "connected", lastUsedAt: 0, inFlight: 0,
		client: { close: cErr ? vi.fn().mockRejectedValue(new Error("f")) : vi.fn().mockResolvedValue(undefined) },
		transport: { close: tErr ? vi.fn().mockRejectedValue(new Error("f")) : vi.fn().mockResolvedValue(undefined) },
	});
	it("closes and removes; no-ops for unknown", async () => {
		const conn = mkConn();
		vi.mocked(getConnections).mockReturnValue(new Map([["s1", conn]]));
		await wireCommandClose()("s1"); expect(conn.status).toBe("closed"); expect(removeConnection).toHaveBeenCalledWith("s1");
		vi.mocked(getConnections).mockReturnValue(new Map()); vi.mocked(removeConnection).mockClear();
		await wireCommandClose()("unknown"); expect(removeConnection).not.toHaveBeenCalled();
	});
	it("swallows close errors", async () => {
		vi.mocked(getConnections).mockReturnValue(new Map([["s1", mkConn(true)]]));
		await expect(wireCommandClose()("s1")).resolves.toBeUndefined();
		vi.mocked(getConnections).mockReturnValue(new Map([["s1", mkConn(false, true)]]));
		await expect(wireCommandClose()("s1")).resolves.toBeUndefined();
	});
});
