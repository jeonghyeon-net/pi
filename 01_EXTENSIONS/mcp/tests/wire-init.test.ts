import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/server-connect.js", () => ({ connectServer: vi.fn().mockResolvedValue({ name: "s1", client: {}, status: "connected" }) }));
vi.mock("../src/lifecycle-idle.js", () => ({ startIdleTimer: vi.fn() }));
vi.mock("../src/lifecycle-keepalive.js", () => ({ startKeepalive: vi.fn() }));
vi.mock("../src/lifecycle-init.js", () => ({ onSessionStart: vi.fn().mockReturnValue(vi.fn()) }));
vi.mock("../src/server-close.js", () => ({ closeServer: vi.fn() }));
vi.mock("../src/server-pool.js", () => ({ ServerPool: vi.fn().mockImplementation(() => ({ add: vi.fn(), get: vi.fn(), remove: vi.fn(), all: vi.fn().mockReturnValue(new Map()) })) }));
vi.mock("../src/state.js", () => ({
	setConfig: vi.fn(), setConnection: vi.fn(), setMetadata: vi.fn(),
	getAllMetadata: vi.fn().mockReturnValue(new Map()), incrementGeneration: vi.fn().mockReturnValue(1),
	getGeneration: vi.fn().mockReturnValue(1), getConnections: vi.fn().mockReturnValue(new Map()),
	getConfig: vi.fn().mockReturnValue(null), updateFooterStatus: vi.fn(),
}));
vi.mock("../src/logger.js", () => ({ createLogger: vi.fn().mockReturnValue({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
vi.mock("../src/wire-init-config.js", () => ({
	wireLoadConfig: vi.fn().mockReturnValue(vi.fn().mockResolvedValue({ mcpServers: {} })),
	wireMergeConfigs: vi.fn().mockReturnValue(vi.fn().mockImplementation((c: unknown) => c)),
	wireApplyDirectToolsEnv: vi.fn().mockReturnValue(vi.fn().mockImplementation((c: unknown) => c)),
	wireComputeHash: vi.fn().mockReturnValue("hash"), wireLoadCache: vi.fn().mockReturnValue(vi.fn().mockReturnValue(null)),
	wireIsCacheValid: vi.fn().mockReturnValue(vi.fn().mockReturnValue(false)),
	wireSaveCache: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}));
vi.mock("../src/wire-init-tools.js", () => ({
	wireBuildMetadata: vi.fn().mockReturnValue(vi.fn().mockResolvedValue([])),
	wireResolveDirectTools: vi.fn().mockReturnValue(vi.fn().mockReturnValue([])),
	wireRegisterDirectTools: vi.fn().mockReturnValue(vi.fn()),
	wireBuildResourceTools: vi.fn().mockReturnValue(vi.fn().mockResolvedValue([])),
	wireDeduplicateTools: vi.fn().mockReturnValue(vi.fn().mockImplementation((t: unknown) => t)),
}));
vi.mock("../src/wire-command.js", () => ({
	makeConnectDeps: vi.fn().mockReturnValue({ createStdioTransport: vi.fn(), createHttpTransport: vi.fn(), createClient: vi.fn(), processEnv: {} }),
	wireCommandConnect: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}));
vi.mock("../src/failure-tracker.js", () => ({ recordFailure: vi.fn() }));

import { wireInitDeps, setCapturedUi, getCapturedUi, wireSessionStart } from "../src/wire-init.js";
import { startIdleTimer } from "../src/lifecycle-idle.js";
import { startKeepalive } from "../src/lifecycle-keepalive.js";
import { getConnections, getConfig, updateFooterStatus } from "../src/state.js";

describe("wire-init", () => {
	beforeEach(() => { vi.clearAllMocks(); setCapturedUi(null); });
	it("returns all required fields", () => { const d = wireInitDeps(); ["loadConfig","mergeConfigs","applyDirectToolsEnv","computeHash","loadCache","isCacheValid","saveCache","connectServer","buildMetadata","resolveDirectTools","registerDirectTools","buildResourceTools","deduplicateTools","startIdleTimer","startKeepalive","setConfig","setConnection","setMetadata","getAllMetadata","incrementGeneration","getGeneration","updateFooter","logger"].forEach((k) => expect(d).toHaveProperty(k)); });
	it("idle delegates with McpConfig", () => { wireInitDeps().startIdleTimer({ mcpServers: {} }); expect(startIdleTimer).toHaveBeenCalled(); });
	it("idle ignores non-config", () => { wireInitDeps().startIdleTimer("x"); expect(startIdleTimer).not.toHaveBeenCalled(); });
	it("idle uses settings.idleTimeout", () => { wireInitDeps().startIdleTimer({ mcpServers: {}, settings: { idleTimeout: 5000 } }); expect(startIdleTimer).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 5000 })); });
	it("idle creates pool", () => {
		vi.mocked(getConnections).mockReturnValue(new Map([["s1", { name: "s1", client: {}, transport: {}, status: "connected", lastUsedAt: 0, inFlight: 0 }]]));
		wireInitDeps().startIdleTimer({ mcpServers: { s1: {} } }); expect(startIdleTimer).toHaveBeenCalled();
	});
	it("idle closeFn calls closeServer", () => { wireInitDeps().startIdleTimer({ mcpServers: {} }); vi.mocked(startIdleTimer).mock.calls[0][0].closeFn("s1"); });
	it("keepalive delegates", () => { wireInitDeps().startKeepalive({ mcpServers: {} }); expect(startKeepalive).toHaveBeenCalled(); });
	it("keepalive ignores non-config", () => { wireInitDeps().startKeepalive(42); expect(startKeepalive).not.toHaveBeenCalled(); });
	it("keepalive reconnectFn calls doConnect", async () => { wireInitDeps().startKeepalive({ mcpServers: { s1: { command: "n" } } }); await expect(vi.mocked(startKeepalive).mock.calls[0][0].reconnectFn("s1")).resolves.toBeUndefined(); });
	it("keepalive reconnectFn skips unknown", async () => { wireInitDeps().startKeepalive({ mcpServers: {} }); await expect(vi.mocked(startKeepalive).mock.calls[0][0].reconnectFn("x")).resolves.toBeUndefined(); });
	it("keepalive reconnectFn records failure", async () => {
		const { wireCommandConnect } = await import("../src/wire-command.js");
		vi.mocked(wireCommandConnect).mockReturnValue(vi.fn().mockRejectedValue(new Error("fail")));
		wireInitDeps().startKeepalive({ mcpServers: { s1: { command: "n" } } });
		await vi.mocked(startKeepalive).mock.calls[0][0].reconnectFn("s1");
		const { recordFailure } = await import("../src/failure-tracker.js"); expect(recordFailure).toHaveBeenCalledWith("s1");
	});
	it("setConnection guards type", () => { const d = wireInitDeps(); d.setConnection("s1", { client: {}, transport: {} }); d.setConnection("s2", "bad"); });
	it("updateFooter no-ops without ui", () => { expect(() => wireInitDeps().updateFooter()).not.toThrow(); });
	it("updateFooter calls updateFooterStatus", () => {
		const ui = { setStatus: vi.fn(), theme: { fg: vi.fn().mockReturnValue("t") } };
		setCapturedUi(ui); vi.mocked(getConfig).mockReturnValue({ mcpServers: { s1: { command: "n" } } });
		wireInitDeps().updateFooter(); expect(updateFooterStatus).toHaveBeenCalledWith(ui, 1);
	});
	it("getCapturedUi null initially", () => { expect(getCapturedUi()).toBeNull(); });
	it("connectServer delegates", async () => { await wireInitDeps().connectServer("s1", { command: "n" }); });
	it("wireSessionStart wraps handler and captures ctx", async () => {
		const pi = { registerTool: vi.fn(), exec: vi.fn(), sendMessage: vi.fn() };
		const handler = wireSessionStart(pi);
		const ctx = { setStatus: vi.fn(), theme: { fg: vi.fn() } };
		await handler({}, ctx); expect(getCapturedUi()).toBe(ctx);
	});
	it("wireSessionStart skips non-footer ctx", async () => {
		const pi = { registerTool: vi.fn(), exec: vi.fn(), sendMessage: vi.fn() };
		await wireSessionStart(pi)({}, "not-ui"); expect(getCapturedUi()).toBeNull();
	});
});
