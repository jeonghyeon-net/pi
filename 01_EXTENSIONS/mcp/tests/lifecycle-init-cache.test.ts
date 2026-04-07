import { describe, expect, it, vi } from "vitest";
import { computeServerHash } from "../src/config-hash.js";
import { makeDeps, run } from "./lifecycle-init-test-helpers.js";

describe("lifecycle-init cache hydration", () => {
	it("hydrates fresh cache into metadata before resolving direct tools", async () => {
		const serverEntry = { lifecycle: "lazy", directTools: true };
		const cachedTools = [{ name: "t1", originalName: "t1", serverName: "s1", description: "" }];
		const meta = new Map([["s1", cachedTools]]);
		const deps = makeDeps({
			loadConfig: vi.fn().mockResolvedValue({ mcpServers: { s1: serverEntry } }),
			loadCache: vi.fn().mockReturnValue({ hash: "old-global-hash", servers: { s1: { tools: cachedTools, savedAt: Date.now(), configHash: computeServerHash(serverEntry) } } }),
			isCacheValid: vi.fn().mockReturnValue(true), getAllMetadata: vi.fn().mockReturnValue(meta),
		});
		await run(deps);
		expect(deps.setMetadata).toHaveBeenCalledWith("s1", cachedTools);
		expect(deps.resolveDirectTools).toHaveBeenCalledWith(meta, expect.anything());
	});

	it("rejects stale, legacy-mismatched, and per-server-mismatched cache", async () => {
		const stale = makeDeps({
			loadConfig: vi.fn().mockResolvedValue({ mcpServers: { s1: { lifecycle: "lazy" } } }),
			loadCache: vi.fn().mockReturnValue({ hash: "hash1", servers: { s1: { tools: [{ name: "t1" }], savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 } } }),
		});
		await run(stale); expect(stale.setMetadata).not.toHaveBeenCalled();
		const legacy = makeDeps({
			loadConfig: vi.fn().mockResolvedValue({ mcpServers: { s1: { lifecycle: "lazy" } } }),
			loadCache: vi.fn().mockReturnValue({ hash: "old-hash", servers: { s1: { tools: [{ name: "t1" }], savedAt: Date.now() } } }),
		});
		await run(legacy); expect(legacy.setMetadata).not.toHaveBeenCalled();
		const mismatch = makeDeps({
			loadConfig: vi.fn().mockResolvedValue({ mcpServers: { s1: { lifecycle: "lazy" } } }),
			loadCache: vi.fn().mockReturnValue({ hash: "old-hash", servers: { s1: { tools: [{ name: "t1" }], savedAt: Date.now(), configHash: "wrong-server-hash" } } }),
		});
		await run(mismatch); expect(mismatch.setMetadata).not.toHaveBeenCalled();
	});

	it("accepts per-server cache despite global hash changes and ignores bad entries", async () => {
		const serverEntry = { lifecycle: "lazy", command: "echo" };
		const hydrated = makeDeps({
			loadConfig: vi.fn().mockResolvedValue({ mcpServers: { s1: serverEntry } }),
			loadCache: vi.fn().mockReturnValue({ hash: "old-hash", servers: { s1: { tools: [{ name: "t1", originalName: "t1", serverName: "s1", description: "" }], savedAt: Date.now(), configHash: computeServerHash(serverEntry) } } }),
		});
		await run(hydrated);
		expect(hydrated.setMetadata).toHaveBeenCalledWith("s1", [{ name: "t1", originalName: "t1", serverName: "s1", description: "" }]);
		const invalid = makeDeps({
			loadConfig: vi.fn().mockResolvedValue({ mcpServers: { s1: { lifecycle: "lazy" }, s2: { lifecycle: "lazy" } } }),
			loadCache: vi.fn().mockReturnValue({ hash: "hash1", servers: { s1: { tools: [{ name: "t1" }], savedAt: Date.now(), configHash: computeServerHash({ lifecycle: "lazy" }) }, s3: { tools: [{ name: "t3" }], savedAt: Date.now() }, s2: { tools: "bad", savedAt: Date.now() } } }),
		});
		await run(invalid);
		expect(invalid.setMetadata).toHaveBeenCalledTimes(1);
		expect(invalid.setMetadata).toHaveBeenCalledWith("s1", [{ name: "t1" }]);
	});
});
