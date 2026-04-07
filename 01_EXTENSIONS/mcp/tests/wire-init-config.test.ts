import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/config-load.js", () => ({ loadConfigFile: vi.fn().mockReturnValue({ mcpServers: {} }) }));
vi.mock("../src/config-imports.js", () => ({
	loadImportedConfigs: vi.fn().mockReturnValue({ servers: {}, provenance: {} }),
}));
vi.mock("../src/config-merge.js", () => ({
	mergeConfigs: vi.fn().mockReturnValue({ config: { mcpServers: {} }, provenance: {} }),
}));
vi.mock("../src/tool-direct.js", () => ({ applyDirectToolsEnv: vi.fn().mockImplementation((c) => c) }));
vi.mock("../src/cache-metadata.js", () => ({
	loadMetadataCache: vi.fn().mockReturnValue(null),
	isMetadataCacheValid: vi.fn().mockReturnValue(false),
	saveMetadataCache: vi.fn(),
}));
vi.mock("node:fs", () => ({
	existsSync: vi.fn().mockReturnValue(false), readFileSync: vi.fn().mockReturnValue("{}"),
	writeFileSync: vi.fn(), renameSync: vi.fn(), mkdirSync: vi.fn(),
}));
vi.mock("node:os", () => ({ homedir: vi.fn().mockReturnValue("/home/test") }));

import {
	wireLoadConfig, wireMergeConfigs, wireApplyDirectToolsEnv,
	wireComputeHash, wireLoadCache, wireIsCacheValid, wireSaveCache, fsOps, cacheFs,
} from "../src/wire-init-config.js";
import { loadMetadataCache, isMetadataCacheValid, saveMetadataCache } from "../src/cache-metadata.js";
import { loadImportedConfigs } from "../src/config-imports.js";
import { existsSync, readFileSync } from "node:fs";

describe("wire-init-config", () => {
	beforeEach(() => vi.clearAllMocks());
	it("wireLoadConfig loads config", async () => { expect(await wireLoadConfig()()).toEqual({ mcpServers: {} }); });
	it("wireMergeConfigs without imports", () => { wireMergeConfigs()({ mcpServers: {} }); expect(loadImportedConfigs).not.toHaveBeenCalled(); });
	it("wireMergeConfigs with imports", () => { wireMergeConfigs()({ mcpServers: {}, imports: ["cursor"] }); expect(loadImportedConfigs).toHaveBeenCalled(); });
	it("wireApplyDirectToolsEnv wraps", () => { expect(wireApplyDirectToolsEnv()({ mcpServers: {} })).toEqual({ mcpServers: {} }); });
	it("wireComputeHash is a function", () => { expect(typeof wireComputeHash).toBe("function"); });

	it("wireLoadCache null when no cache", () => { expect(wireLoadCache()()).toBeNull(); });
	it("wireLoadCache returns CacheData", () => {
		vi.mocked(loadMetadataCache).mockReturnValue({
			version: 1, configHash: "h1", servers: { s1: { tools: [{ name: "t1" }], savedAt: 1000, configHash: "s1-hash" } },
		});
		const r = wireLoadCache()();
		expect(r?.hash).toBe("h1");
		expect(r?.servers.s1).toEqual({ tools: [{ name: "t1" }], savedAt: 1000, configHash: "s1-hash" });
	});
	it("wireLoadCache non-array tools", () => {
		vi.mocked(loadMetadataCache).mockReturnValue({
			version: 1, configHash: "h1", servers: { s1: { tools: "x", savedAt: 1000 } },
		});
		expect(wireLoadCache()()?.servers.s1).toEqual({ tools: [], savedAt: 1000, configHash: undefined });
	});
	it("wireLoadCache invalid savedAt defaults to zero", () => {
		vi.mocked(loadMetadataCache).mockReturnValue({
			version: 1, configHash: "h1", servers: { s1: { tools: [{ name: "t1" }], savedAt: "x" } },
		});
		expect(wireLoadCache()()?.servers.s1).toEqual({ tools: [{ name: "t1" }], savedAt: 0, configHash: undefined });
	});

	it("wireIsCacheValid null", () => { expect(wireIsCacheValid()(null, { mcpServers: {} }, "h")).toBe(false); });
	it("wireIsCacheValid delegates", () => {
		vi.mocked(isMetadataCacheValid).mockReturnValue(true);
		expect(wireIsCacheValid()({ hash: "h1", servers: { s1: { tools: [], savedAt: 1000 } } }, { mcpServers: { s1: { command: "echo" } } }, "h1")).toBe(true);
	});
	it("wireSaveCache saves", async () => {
		const cfg = { mcpServers: { s1: { command: "echo" } } };
		const meta = new Map([["s1", [{ name: "t1", originalName: "t1", serverName: "s1", description: "" }]]]);
		await wireSaveCache()(cfg, meta);
		expect(saveMetadataCache).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
			configHash: expect.any(String),
			servers: { s1: expect.objectContaining({ configHash: expect.any(String) }) },
		}), expect.any(Object));
	});
	it("wireSaveCache leaves unknown metadata entries without per-server hash", async () => {
		const cfg = { mcpServers: { s1: { command: "echo" } } };
		const meta = new Map([["missing", [{ name: "t1", originalName: "t1", serverName: "missing", description: "" }]]]);
		await wireSaveCache()(cfg, meta);
		expect(saveMetadataCache).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
			servers: { missing: expect.objectContaining({ configHash: undefined }) },
		}), expect.any(Object));
	});
	it("fsOps delegates to node:fs", () => {
		fsOps.readFile("/x"); fsOps.exists("/x");
		expect(readFileSync).toHaveBeenCalled();
		expect(existsSync).toHaveBeenCalled();
	});
	it("cacheFs delegates to node:fs", () => {
		cacheFs.existsSync("/a"); cacheFs.readFileSync("/a");
		cacheFs.writeFileSync("/a", "d"); cacheFs.renameSync("/a", "/b");
		cacheFs.mkdirSync("/dir");
		expect(cacheFs.getPid()).toBe(process.pid);
	});
});
