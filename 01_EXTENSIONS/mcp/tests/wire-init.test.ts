import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/server-connect.js", () => ({ connectServer: vi.fn().mockResolvedValue({ name: "s1", client: {}, status: "connected" }) }));
vi.mock("../src/lifecycle-idle.js", () => ({ startIdleTimer: vi.fn() }));
vi.mock("../src/lifecycle-keepalive.js", () => ({ startKeepalive: vi.fn() }));
vi.mock("../src/server-close.js", () => ({ closeServer: vi.fn() }));
vi.mock("../src/server-pool.js", () => ({
	ServerPool: vi.fn().mockImplementation(() => ({ add: vi.fn(), get: vi.fn(), remove: vi.fn(), all: vi.fn().mockReturnValue(new Map()) })),
}));
vi.mock("../src/state.js", () => ({
	setConfig: vi.fn(), setConnection: vi.fn(), setMetadata: vi.fn(),
	getAllMetadata: vi.fn().mockReturnValue(new Map()), incrementGeneration: vi.fn().mockReturnValue(1),
	getGeneration: vi.fn().mockReturnValue(1), getConnections: vi.fn().mockReturnValue(new Map()),
}));
vi.mock("../src/logger.js", () => ({
	createLogger: vi.fn().mockReturnValue({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("../src/wire-init-config.js", () => ({
	wireLoadConfig: vi.fn().mockReturnValue(vi.fn().mockResolvedValue({ mcpServers: {} })),
	wireMergeConfigs: vi.fn().mockReturnValue(vi.fn().mockImplementation((c: unknown) => c)),
	wireApplyDirectToolsEnv: vi.fn().mockReturnValue(vi.fn().mockImplementation((c: unknown) => c)),
	wireComputeHash: vi.fn().mockReturnValue("hash"),
	wireLoadCache: vi.fn().mockReturnValue(vi.fn().mockReturnValue(null)),
	wireIsCacheValid: vi.fn().mockReturnValue(vi.fn().mockReturnValue(false)),
	wireSaveCache: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}));
vi.mock("../src/wire-init-tools.js", () => ({
	wireBuildMetadata: vi.fn().mockReturnValue(vi.fn().mockResolvedValue([])),
	wireResolveDirectTools: vi.fn().mockReturnValue(vi.fn().mockReturnValue([])),
	wireRegisterDirectTools: vi.fn().mockReturnValue(vi.fn()),
	wireBuildResourceTools: vi.fn().mockReturnValue(vi.fn().mockReturnValue([])),
	wireDeduplicateTools: vi.fn().mockReturnValue(vi.fn().mockImplementation((t: unknown) => t)),
}));
vi.mock("../src/wire-command.js", () => ({ makeConnectDeps: vi.fn().mockReturnValue({
	createStdioTransport: vi.fn(), createHttpTransport: vi.fn(), createClient: vi.fn(), processEnv: {},
}) }));

import { wireInitDeps } from "../src/wire-init.js";
import { startIdleTimer } from "../src/lifecycle-idle.js";
import { startKeepalive } from "../src/lifecycle-keepalive.js";
import { getConnections } from "../src/state.js";

describe("wire-init", () => {
	beforeEach(() => vi.clearAllMocks());

	it("returns InitDeps with all required fields", () => {
		const d = wireInitDeps();
		const keys = ["loadConfig", "mergeConfigs", "applyDirectToolsEnv", "computeHash", "loadCache",
			"isCacheValid", "saveCache", "connectServer", "buildMetadata", "resolveDirectTools",
			"registerDirectTools", "buildResourceTools", "deduplicateTools", "startIdleTimer",
			"startKeepalive", "setConfig", "setConnection", "setMetadata", "getAllMetadata",
			"incrementGeneration", "getGeneration", "updateFooter", "logger"];
		for (const k of keys) expect(d).toHaveProperty(k);
	});

	it("startIdleTimer delegates with McpConfig", () => { wireInitDeps().startIdleTimer({ mcpServers: {} }); expect(startIdleTimer).toHaveBeenCalled(); });
	it("startIdleTimer ignores non-config", () => { wireInitDeps().startIdleTimer("x"); expect(startIdleTimer).not.toHaveBeenCalled(); });
	it("startIdleTimer uses settings.idleTimeout", () => {
		wireInitDeps().startIdleTimer({ mcpServers: {}, settings: { idleTimeout: 5000 } });
		expect(startIdleTimer).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 5000 }));
	});
	it("startIdleTimer creates pool", () => {
		const c = { name: "s1", client: {}, transport: {}, status: "connected", lastUsedAt: 0, inFlight: 0 };
		vi.mocked(getConnections).mockReturnValue(new Map([["s1", c]]));
		wireInitDeps().startIdleTimer({ mcpServers: { s1: {} } });
		expect(startIdleTimer).toHaveBeenCalled();
	});
	it("idle closeFn calls closeServer", () => {
		wireInitDeps().startIdleTimer({ mcpServers: {} });
		vi.mocked(startIdleTimer).mock.calls[0][0].closeFn("s1");
	});
	it("startKeepalive delegates", () => { wireInitDeps().startKeepalive({ mcpServers: {} }); expect(startKeepalive).toHaveBeenCalled(); });
	it("startKeepalive ignores non-config", () => { wireInitDeps().startKeepalive(42); expect(startKeepalive).not.toHaveBeenCalled(); });
	it("keepalive reconnectFn no-ops", async () => {
		wireInitDeps().startKeepalive({ mcpServers: {} });
		await expect(vi.mocked(startKeepalive).mock.calls[0][0].reconnectFn("s1")).resolves.toBeUndefined();
	});
	it("setConnection guards type", () => { const d = wireInitDeps(); d.setConnection("s1", { client: {}, transport: {} }); d.setConnection("s2", "bad"); });
	it("updateFooter no-ops", () => { expect(() => wireInitDeps().updateFooter()).not.toThrow(); });
	it("connectServer delegates", async () => { await wireInitDeps().connectServer("s1", { command: "n" }); });
});
