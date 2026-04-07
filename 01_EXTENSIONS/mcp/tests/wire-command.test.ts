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

import { wireCommandConnect, wireCommandClose, makeConnectDeps } from "../src/wire-command.js";
import { connectServer } from "../src/server-connect.js";
import { setConnection, getConnections, removeConnection, setMetadata } from "../src/state.js";
import { buildToolMetadata } from "../src/tool-metadata.js";

describe("makeConnectDeps", () => {
	it("transport and client factories throw not-wired errors", async () => {
		const d = makeConnectDeps();
		expect(() => d.createStdioTransport({ command: "x" }, {})).toThrow("stdio");
		await expect(d.createHttpTransport("http://x", undefined)).rejects.toThrow("http");
		expect(() => d.createClient()).toThrow("client");
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

	it("closes server and removes connection", async () => {
		const conn = mkConn();
		vi.mocked(getConnections).mockReturnValue(new Map([["s1", conn]]));
		await wireCommandClose()("s1");
		expect(conn.status).toBe("closed");
		expect(removeConnection).toHaveBeenCalledWith("s1");
	});

	it("no-ops for unknown server", async () => {
		vi.mocked(getConnections).mockReturnValue(new Map());
		await wireCommandClose()("unknown");
		expect(removeConnection).not.toHaveBeenCalled();
	});

	it("swallows client close error", async () => {
		vi.mocked(getConnections).mockReturnValue(new Map([["s1", mkConn(true)]]));
		await expect(wireCommandClose()("s1")).resolves.toBeUndefined();
	});

	it("swallows transport close error", async () => {
		vi.mocked(getConnections).mockReturnValue(new Map([["s1", mkConn(false, true)]]));
		await expect(wireCommandClose()("s1")).resolves.toBeUndefined();
	});
});
