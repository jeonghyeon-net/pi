import { describe, expect, it, vi } from "vitest";
import { onSessionStart } from "../src/lifecycle-init.js";
import type { InitDeps } from "../src/lifecycle-init.js";

const mockPi = () => ({ registerTool: vi.fn(), exec: vi.fn(), sendMessage: vi.fn() });

function makeDeps(overrides?: Partial<InitDeps>): InitDeps {
	return {
		loadConfig: vi.fn().mockResolvedValue({ mcpServers: { s1: { lifecycle: "eager" } } }),
		mergeConfigs: vi.fn().mockImplementation((c) => c),
		computeHash: vi.fn().mockReturnValue("hash1"),
		loadCache: vi.fn().mockReturnValue(null),
		isCacheValid: vi.fn().mockReturnValue(false),
		saveCache: vi.fn().mockResolvedValue(undefined),
		connectServer: vi.fn().mockResolvedValue({ name: "s1", client: {}, status: "connected" }),
		buildMetadata: vi.fn().mockResolvedValue([{ name: "t1", originalName: "t1", serverName: "s1", description: "" }]),
		resolveDirectTools: vi.fn().mockReturnValue([]),
		registerDirectTools: vi.fn(),
		buildResourceTools: vi.fn().mockReturnValue([]),
		deduplicateTools: vi.fn().mockImplementation((tools) => tools),
		startIdleTimer: vi.fn(), startKeepalive: vi.fn(),
		setConfig: vi.fn(), setConnection: vi.fn(), setMetadata: vi.fn(),
		getAllMetadata: vi.fn().mockReturnValue(new Map()),
		incrementGeneration: vi.fn().mockReturnValue(1),
		getGeneration: vi.fn().mockReturnValue(1),
		updateFooter: vi.fn(),
		logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
		...overrides,
	};
}

async function run(deps: InitDeps) {
	const pi = mockPi();
	await onSessionStart(pi, deps)(undefined, undefined);
	return pi;
}

describe("lifecycle-init", () => {
	it("loads config and connects eager servers", async () => {
		const deps = makeDeps();
		await run(deps);
		expect(deps.loadConfig).toHaveBeenCalled();
		expect(deps.connectServer).toHaveBeenCalledWith("s1", expect.anything());
	});
	it("skips lazy servers during init", async () => {
		const deps = makeDeps({
			loadConfig: vi.fn().mockResolvedValue({ mcpServers: { s1: { lifecycle: "lazy" } } }),
		});
		await run(deps);
		expect(deps.connectServer).not.toHaveBeenCalled();
	});
	it("connects keep-alive servers", async () => {
		const deps = makeDeps({
			loadConfig: vi.fn().mockResolvedValue({ mcpServers: { ka: { lifecycle: "keep-alive" } } }),
			connectServer: vi.fn().mockResolvedValue({ name: "ka", client: {}, status: "connected" }),
		});
		await run(deps);
		expect(deps.connectServer).toHaveBeenCalledWith("ka", expect.anything());
	});
	it("builds and registers direct tools", async () => {
		const spec = { serverName: "s1", originalName: "t1", prefixedName: "s1_t1", description: "d" };
		const deps = makeDeps({ resolveDirectTools: vi.fn().mockReturnValue([spec]) });
		await run(deps);
		expect(deps.registerDirectTools).toHaveBeenCalled();
	});
	it("starts idle and keepalive timers", async () => {
		const deps = makeDeps();
		await run(deps);
		expect(deps.startIdleTimer).toHaveBeenCalled();
		expect(deps.startKeepalive).toHaveBeenCalled();
	});
	it("updates footer status", async () => {
		const deps = makeDeps();
		await run(deps);
		expect(deps.updateFooter).toHaveBeenCalled();
	});
	it("skips connecting when cache is valid", async () => {
		const cached = { hash: "hash1", servers: { s1: [{ name: "t1" }] }, timestamp: Date.now() };
		const deps = makeDeps({
			loadCache: vi.fn().mockReturnValue(cached),
			isCacheValid: vi.fn().mockReturnValue(true),
		});
		await run(deps);
		expect(deps.loadCache).toHaveBeenCalled();
		expect(deps.isCacheValid).toHaveBeenCalledWith(cached, "hash1");
		expect(deps.connectServer).not.toHaveBeenCalled();
	});
	it("resolves direct tools from getAllMetadata", async () => {
		const meta = new Map([["s1", [{ name: "t1", originalName: "t1", serverName: "s1", description: "" }]]]);
		const deps = makeDeps({ getAllMetadata: vi.fn().mockReturnValue(meta) });
		await run(deps);
		expect(deps.resolveDirectTools).toHaveBeenCalledWith(meta, expect.anything());
	});
	it("returns no-op handler when deps not provided", async () => {
		const pi = mockPi();
		await onSessionStart(pi)(undefined, undefined);
	});
});
