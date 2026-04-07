import { describe, expect, it, vi } from "vitest";
import { loadNpxCache, saveNpxCache, getNpxEntry, setNpxEntry, isNpxEntryValid } from "../src/cache-npx.js";

describe("loadNpxCache", () => {
	it("returns empty entries when file does not exist", () => {
		const fs = { existsSync: () => false, readFileSync: vi.fn(), writeFileSync: vi.fn(), renameSync: vi.fn(), getPid: () => 1 };
		const cache = loadNpxCache("/npx.json", fs);
		expect(cache.entries).toEqual({});
	});

	it("returns parsed entries when file exists", () => {
		const data = { entries: { pkg: { resolvedPath: "/bin/pkg", savedAt: Date.now() } } };
		const fs = {
			existsSync: () => true, readFileSync: () => JSON.stringify(data),
			writeFileSync: vi.fn(), renameSync: vi.fn(), getPid: () => 1,
		};
		const cache = loadNpxCache("/npx.json", fs);
		expect(cache.entries.pkg.resolvedPath).toBe("/bin/pkg");
	});

	it("returns empty entries on invalid JSON", () => {
		const fs = {
			existsSync: () => true, readFileSync: () => "{broken",
			writeFileSync: vi.fn(), renameSync: vi.fn(), getPid: () => 1,
		};
		expect(loadNpxCache("/npx.json", fs).entries).toEqual({});
	});

	it("returns empty entries when parsed object has no entries field", () => {
		const fs = {
			existsSync: () => true, readFileSync: () => JSON.stringify({ foo: "bar" }),
			writeFileSync: vi.fn(), renameSync: vi.fn(), getPid: () => 1,
		};
		expect(loadNpxCache("/npx.json", fs).entries).toEqual({});
	});
});

describe("saveNpxCache", () => {
	it("writes via atomic temp file then rename", () => {
		const fs = { existsSync: vi.fn(), readFileSync: vi.fn(), writeFileSync: vi.fn(), renameSync: vi.fn(), getPid: () => 42 };
		saveNpxCache("/npx.json", { entries: {} }, fs);
		const tmpPath = fs.writeFileSync.mock.calls[0][0];
		expect(tmpPath).toContain(".tmp");
		expect(fs.renameSync).toHaveBeenCalledWith(tmpPath, "/npx.json");
	});
});

describe("getNpxEntry", () => {
	it("returns entry if present", () => {
		const cache = { entries: { pkg: { resolvedPath: "/bin/p", savedAt: 1 } } };
		expect(getNpxEntry(cache, "pkg")?.resolvedPath).toBe("/bin/p");
	});

	it("returns undefined if missing", () => {
		expect(getNpxEntry({ entries: {} }, "pkg")).toBeUndefined();
	});
});

describe("setNpxEntry", () => {
	it("sets entry in cache", () => {
		const cache = { entries: {} as Record<string, { resolvedPath: string; savedAt: number }> };
		setNpxEntry(cache, "pkg", "/bin/p", Date.now);
		expect(cache.entries.pkg.resolvedPath).toBe("/bin/p");
	});
});

describe("isNpxEntryValid", () => {
	it("returns false for undefined entry", () => {
		expect(isNpxEntryValid(undefined, Date.now)).toBe(false);
	});

	it("returns false when TTL expired", () => {
		const old = { resolvedPath: "/p", savedAt: Date.now() - 25 * 60 * 60 * 1000 };
		expect(isNpxEntryValid(old, Date.now)).toBe(false);
	});

	it("returns true within TTL", () => {
		const fresh = { resolvedPath: "/p", savedAt: Date.now() };
		expect(isNpxEntryValid(fresh, Date.now)).toBe(true);
	});
});
