import { describe, expect, it } from "vitest";
import { isServerCacheFresh, invalidateServer } from "../src/cache-metadata.js";

describe("isServerCacheFresh", () => {
	it("returns false for undefined entry", () => {
		expect(isServerCacheFresh(undefined, Date.now())).toBe(false);
	});

	it("returns true for fresh entry", () => {
		expect(isServerCacheFresh({ tools: [], savedAt: Date.now() }, Date.now())).toBe(true);
	});

	it("returns false for expired entry", () => {
		const old = Date.now() - 8 * 24 * 60 * 60 * 1000;
		expect(isServerCacheFresh({ tools: [], savedAt: old }, Date.now())).toBe(false);
	});
});

describe("invalidateServer", () => {
	it("removes a server from cache", () => {
		const servers = { s1: { tools: [], savedAt: 1 }, s2: { tools: [], savedAt: 2 } };
		const result = invalidateServer({ version: 1, servers, configHash: "h" }, "s1");
		expect(result.servers.s1).toBeUndefined();
		expect(result.servers.s2).toBeDefined();
	});

	it("returns unchanged cache when server not present", () => {
		const cache = { version: 1, servers: { s1: { tools: [], savedAt: 1 } }, configHash: "h" };
		const result = invalidateServer(cache, "missing");
		expect(result.servers.s1).toBeDefined();
	});
});
