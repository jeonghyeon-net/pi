import { describe, expect, it, vi } from "vitest";
import { loadMetadataCache, saveMetadataCache, isMetadataCacheValid } from "../src/cache-metadata.js";

const mockFs = (overrides = {}) => ({
	existsSync: () => false, readFileSync: vi.fn(), writeFileSync: vi.fn(),
	renameSync: vi.fn(), mkdirSync: vi.fn(), getPid: () => 123, ...overrides,
});

describe("loadMetadataCache", () => {
	it("returns null when file does not exist", () => {
		expect(loadMetadataCache("/cache.json", mockFs())).toBeNull();
	});
	it("returns parsed cache when file exists", () => {
		const cache = { version: 1, servers: {}, configHash: "abc" };
		const fs = mockFs({ existsSync: () => true, readFileSync: () => JSON.stringify(cache) });
		expect(loadMetadataCache("/cache.json", fs)?.configHash).toBe("abc");
	});
	it("returns null on invalid JSON", () => {
		const fs = mockFs({ existsSync: () => true, readFileSync: () => "not json" });
		expect(loadMetadataCache("/cache.json", fs)).toBeNull();
	});
	it("returns null for non-object JSON", () => {
		const fs = mockFs({ existsSync: () => true, readFileSync: () => JSON.stringify([]) });
		expect(loadMetadataCache("/cache.json", fs)).toBeNull();
	});
	it("returns null when version is not a number", () => {
		const data = JSON.stringify({ version: "bad", servers: {}, configHash: "h" });
		const fs = mockFs({ existsSync: () => true, readFileSync: () => data });
		expect(loadMetadataCache("/cache.json", fs)).toBeNull();
	});
	it("returns null when configHash is missing", () => {
		const fs = mockFs({ existsSync: () => true, readFileSync: () => JSON.stringify({ version: 1 }) });
		expect(loadMetadataCache("/cache.json", fs)).toBeNull();
	});
	it("returns null when servers is not an object", () => {
		const data = JSON.stringify({ version: 1, servers: "bad", configHash: "h" });
		const fs = mockFs({ existsSync: () => true, readFileSync: () => data });
		expect(loadMetadataCache("/cache.json", fs)).toBeNull();
	});
});

describe("saveMetadataCache", () => {
	it("writes via atomic temp file then rename", () => {
		const fs = mockFs({ getPid: () => 99 });
		const cache = { version: 1, servers: {}, configHash: "h" };
		saveMetadataCache("/cache.json", cache, fs);
		expect(fs.mkdirSync).toHaveBeenCalledWith("/");
		expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
		const tmpPath = fs.writeFileSync.mock.calls[0][0];
		expect(tmpPath).toContain(".tmp");
		expect(fs.renameSync).toHaveBeenCalledWith(tmpPath, "/cache.json");
	});
	it("creates relative parent directories", () => {
		const fs = mockFs();
		saveMetadataCache("cache/cache.json", { version: 1, servers: {}, configHash: "h" }, fs);
		expect(fs.mkdirSync).toHaveBeenCalledWith("cache");
	});
	it("uses current directory when path has no parent", () => {
		const fs = mockFs();
		saveMetadataCache("cache.json", { version: 1, servers: {}, configHash: "h" }, fs);
		expect(fs.mkdirSync).toHaveBeenCalledWith(".");
	});
});

describe("isMetadataCacheValid", () => {
	it("returns false for null cache", () => {
		expect(isMetadataCacheValid(null, "hash", {}, Date.now)).toBe(false);
	});
	it("returns false when legacy global hash differs", () => {
		const cache = { version: 1, servers: { s1: { tools: [], savedAt: Date.now() } }, configHash: "old" };
		expect(isMetadataCacheValid(cache, "new", { s1: "server-hash" }, Date.now)).toBe(false);
	});
	it("returns true for empty servers when config hash matches", () => {
		const cache = { version: 1, servers: {}, configHash: "h" };
		expect(isMetadataCacheValid(cache, "h", {}, Date.now)).toBe(true);
	});
	it("returns true when any fresh server entry matches per-server hash", () => {
		const s = { s1: { tools: [], savedAt: Date.now(), configHash: "server-hash" } };
		expect(isMetadataCacheValid({ version: 1, servers: s, configHash: "old-global" }, "new-global", { s1: "server-hash" }, Date.now)).toBe(true);
	});
	it("returns false when per-server hash differs", () => {
		const s = { s1: { tools: [], savedAt: Date.now(), configHash: "old-server-hash" } };
		expect(isMetadataCacheValid({ version: 1, servers: s, configHash: "same-global" }, "same-global", { s1: "new-server-hash" }, Date.now)).toBe(false);
	});
	it("returns false when all server entries are expired", () => {
		const old = Date.now() - 8 * 24 * 60 * 60 * 1000;
		const s = { s1: { tools: [], savedAt: old, configHash: "server-hash" } };
		expect(isMetadataCacheValid({ version: 1, servers: s, configHash: "h" }, "h", { s1: "server-hash" }, Date.now)).toBe(false);
	});
});
