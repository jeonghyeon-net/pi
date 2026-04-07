import { describe, expect, it, vi } from "vitest";
import { onSessionStart, type InitDeps } from "../src/lifecycle-init.js";

function makeDeps(overrides?: Partial<InitDeps>): InitDeps {
	return {
		loadConfig: vi.fn().mockResolvedValue({ mcpServers: {} }),
		mergeConfigs: vi.fn().mockImplementation((c) => c),
		computeHash: vi.fn().mockReturnValue("hash1"),
		loadCache: vi.fn().mockReturnValue(null), isCacheValid: vi.fn().mockReturnValue(false),
		saveCache: vi.fn().mockResolvedValue(undefined),
		connectServer: vi.fn().mockResolvedValue({ name: "s1", client: {}, status: "connected" }),
		buildMetadata: vi.fn().mockResolvedValue([]), resolveDirectTools: vi.fn().mockReturnValue([]),
		registerDirectTools: vi.fn(), buildResourceTools: vi.fn().mockReturnValue([]),
		deduplicateTools: vi.fn().mockImplementation((t) => t),
		startIdleTimer: vi.fn(), startKeepalive: vi.fn(),
		setConfig: vi.fn(), setConnection: vi.fn(), setMetadata: vi.fn(),
		getAllMetadata: vi.fn().mockReturnValue(new Map()),
		incrementGeneration: vi.fn().mockReturnValue(1), getGeneration: vi.fn().mockReturnValue(1),
		updateFooter: vi.fn(),
		logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
		...overrides,
	};
}
const run = (d: InitDeps) => onSessionStart({ registerTool: vi.fn(), exec: vi.fn(), sendMessage: vi.fn() }, d)(undefined, undefined);
const eagerCfg = (s: Record<string, { lifecycle: string }>) => vi.fn().mockResolvedValue({ mcpServers: s });

describe("lifecycle-init errors", () => {
	it("continues when one server fails to connect", async () => {
		const deps = makeDeps({
			loadConfig: eagerCfg({ good: { lifecycle: "eager" }, bad: { lifecycle: "eager" } }),
			connectServer: vi.fn().mockImplementation((name: string) =>
				name === "bad" ? Promise.reject(new Error("refused")) : Promise.resolve({ name, client: {}, status: "connected" })),
		});
		await run(deps);
		expect(deps.setConnection).toHaveBeenCalledWith("good", expect.anything());
		expect(deps.logger.warn).toHaveBeenCalled();
	});
	it("handles loadConfig failure gracefully", async () => {
		const deps = makeDeps({ loadConfig: vi.fn().mockRejectedValue(new Error("no config")) });
		await run(deps);
		expect(deps.logger.error).toHaveBeenCalled();
	});
	it("skips stale generation writes", async () => {
		let gen = 1;
		const deps = makeDeps({
			loadConfig: eagerCfg({ s1: { lifecycle: "eager" } }),
			incrementGeneration: vi.fn().mockReturnValue(1),
			getGeneration: vi.fn().mockImplementation(() => gen),
			connectServer: vi.fn().mockImplementation(async () => { gen = 2; return { name: "s1", client: {}, status: "connected" }; }),
		});
		await run(deps);
		expect(deps.setConnection).not.toHaveBeenCalled();
	});
	it("handles empty server list", async () => {
		const deps = makeDeps();
		await run(deps);
		expect(deps.updateFooter).toHaveBeenCalled();
	});
	it("handles buildMetadata failure for a server", async () => {
		const deps = makeDeps({
			loadConfig: eagerCfg({ s1: { lifecycle: "eager" } }),
			buildMetadata: vi.fn().mockRejectedValue(new Error("discovery failed")),
		});
		await run(deps);
		expect(deps.logger.warn).toHaveBeenCalled();
	});
	it("handles non-Error thrown from connectServer", async () => {
		const deps = makeDeps({ loadConfig: eagerCfg({ s1: { lifecycle: "eager" } }), connectServer: vi.fn().mockRejectedValue("str") });
		await run(deps);
		expect(deps.logger.warn).toHaveBeenCalledWith("Failed to connect s1: str");
	});
	it("handles non-Error thrown from buildMetadata", async () => {
		const deps = makeDeps({ loadConfig: eagerCfg({ s1: { lifecycle: "eager" } }), buildMetadata: vi.fn().mockRejectedValue(42) });
		await run(deps);
		expect(deps.logger.warn).toHaveBeenCalledWith("Tool discovery failed for s1: 42");
	});
	it("handles non-Error thrown from loadConfig", async () => {
		const deps = makeDeps({ loadConfig: vi.fn().mockRejectedValue("bad") });
		await run(deps);
		expect(deps.logger.error).toHaveBeenCalledWith("Config load failed: bad");
	});
	it("skips stale generation after buildMetadata", async () => {
		let gen = 1;
		const deps = makeDeps({
			loadConfig: eagerCfg({ s1: { lifecycle: "eager" } }),
			incrementGeneration: vi.fn().mockReturnValue(1),
			getGeneration: vi.fn().mockImplementation(() => gen),
			connectServer: vi.fn().mockResolvedValue({ name: "s1", client: {}, status: "connected" }),
			buildMetadata: vi.fn().mockImplementation(async () => { gen = 2; return []; }),
		});
		await run(deps);
		expect(deps.setMetadata).not.toHaveBeenCalled();
	});
	it("classifies servers without lifecycle as lazy", async () => {
		const d = makeDeps({ loadConfig: vi.fn().mockResolvedValue({ mcpServers: { s1: {} } }) });
		await run(d);
		expect(d.connectServer).not.toHaveBeenCalled();
	});
});
