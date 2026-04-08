import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/cache-metadata.js", () => ({
	loadMetadataCache: vi.fn().mockReturnValue(null),
	saveMetadataCache: vi.fn(),
	isMetadataCacheValid: vi.fn(),
}));
vi.mock("../src/config-load.js", () => ({ loadConfigFile: vi.fn().mockReturnValue({ mcpServers: {} }) }));
vi.mock("../src/config-imports.js", () => ({ loadImportedConfigs: vi.fn().mockReturnValue({ servers: {}, provenance: {} }) }));
vi.mock("../src/config-merge.js", () => ({ mergeConfigs: vi.fn().mockReturnValue({ config: { mcpServers: {} }, provenance: {} }) }));
vi.mock("../src/tool-direct.js", () => ({ applyDirectToolsEnv: vi.fn().mockImplementation((c) => c) }));
vi.mock("node:fs", () => ({ existsSync: vi.fn(), readFileSync: vi.fn().mockReturnValue("{}"), writeFileSync: vi.fn(), renameSync: vi.fn(), mkdirSync: vi.fn() }));
vi.mock("node:os", () => ({ homedir: vi.fn().mockReturnValue("/home/test") }));

import { loadMetadataCache, saveMetadataCache } from "../src/cache-metadata.js";
import { wireSaveCache } from "../src/wire-init-config.js";

describe("wireSaveCache merge behavior", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(loadMetadataCache).mockReturnValue(null);
	});
	const cfg = { mcpServers: { s1: { command: "echo" } } };
	const existing = { version: 1, configHash: "old-hash", servers: { context7: { tools: [{ name: "query-docs" }], savedAt: 123, configHash: "context7-hash" } } };

	it("preserves existing cached servers absent from current metadata", async () => {
		vi.mocked(loadMetadataCache).mockReturnValue(existing);
		await wireSaveCache()(cfg, new Map());
		expect(saveMetadataCache).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
			servers: { context7: { tools: [{ name: "query-docs" }], savedAt: 123, configHash: "context7-hash" } },
		}), expect.any(Object));
	});

	it("merges current metadata into the existing cache snapshot", async () => {
		vi.mocked(loadMetadataCache).mockReturnValue(existing);
		const meta = new Map([["s1", [{ name: "t1", originalName: "t1", serverName: "s1", description: "" }]]]);
		await wireSaveCache()(cfg, meta);
		expect(saveMetadataCache).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
			servers: {
				context7: { tools: [{ name: "query-docs" }], savedAt: 123, configHash: "context7-hash" },
				s1: expect.objectContaining({ tools: meta.get("s1"), configHash: expect.any(String) }),
			},
		}), expect.any(Object));
	});
});
