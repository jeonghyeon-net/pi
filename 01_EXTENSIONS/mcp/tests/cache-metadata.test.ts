import { describe, expect, it, vi } from "vitest";
import { loadMetadataCache, saveMetadataCache, isMetadataCacheValid } from "../src/cache-metadata.js";

describe("loadMetadataCache", () => {
	it("returns null when file does not exist", () => {
		const fs = { existsSync: () => false, readFileSync: vi.fn(), writeFileSync: vi.fn(), renameSync: vi.fn(), getPid: () => 123 };
		expect(loadMetadataCache("/cache.json", fs)).toBeNull();
	});

	it("returns parsed cache when file exists", () => {
		const cache = { version: 1, servers: {}, savedAt: Date.now(), configHash: "abc" };
		const fs = {
			existsSync: () => true, readFileSync: () => JSON.stringify(cache),
			writeFileSync: vi.fn(), renameSync: vi.fn(), getPid: () => 123,
		};
		const result = loadMetadataCache("/cache.json", fs);
		expect(result?.configHash).toBe("abc");
	});

	it("returns null on invalid JSON", () => {
		const fs = {
			existsSync: () => true, readFileSync: () => "not json",
			writeFileSync: vi.fn(), renameSync: vi.fn(), getPid: () => 123,
		};
		expect(loadMetadataCache("/cache.json", fs)).toBeNull();
	});
});

describe("saveMetadataCache", () => {
	it("writes via atomic temp file then rename", () => {
		const fs = { existsSync: vi.fn(), readFileSync: vi.fn(), writeFileSync: vi.fn(), renameSync: vi.fn(), getPid: () => 99 };
		const cache = { version: 1, servers: {}, savedAt: Date.now(), configHash: "h" };
		saveMetadataCache("/cache.json", cache, fs);
		expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
		const tmpPath = fs.writeFileSync.mock.calls[0][0];
		expect(tmpPath).toContain(".tmp");
		expect(fs.renameSync).toHaveBeenCalledWith(tmpPath, "/cache.json");
	});
});

describe("isMetadataCacheValid", () => {
	it("returns false for null cache", () => {
		expect(isMetadataCacheValid(null, "hash", Date.now)).toBe(false);
	});

	it("returns false when config hash differs", () => {
		const cache = { version: 1, servers: {}, savedAt: Date.now(), configHash: "old" };
		expect(isMetadataCacheValid(cache, "new", Date.now)).toBe(false);
	});

	it("returns false when TTL expired", () => {
		const expired = Date.now() - 8 * 24 * 60 * 60 * 1000;
		const cache = { version: 1, servers: {}, savedAt: expired, configHash: "h" };
		expect(isMetadataCacheValid(cache, "h", Date.now)).toBe(false);
	});

	it("returns true when hash matches and within TTL", () => {
		const cache = { version: 1, servers: {}, savedAt: Date.now(), configHash: "h" };
		expect(isMetadataCacheValid(cache, "h", Date.now)).toBe(true);
	});
});
