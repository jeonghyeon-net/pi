import { describe, it, expect } from "vitest";
import * as C from "../src/constants.js";

describe("constants", () => {
	it("METADATA_CACHE_TTL_MS is 7 days", () => {
		expect(C.METADATA_CACHE_TTL_MS).toBe(604_800_000);
	});

	it("NPX_CACHE_TTL_MS is 1 day", () => {
		expect(C.NPX_CACHE_TTL_MS).toBe(86_400_000);
	});

	it("DEFAULT_IDLE_TIMEOUT_MS is 10 minutes", () => {
		expect(C.DEFAULT_IDLE_TIMEOUT_MS).toBe(600_000);
	});

	it("KEEPALIVE_INTERVAL_MS is 30 seconds", () => {
		expect(C.KEEPALIVE_INTERVAL_MS).toBe(30_000);
	});

	it("MAX_CONCURRENCY is 10", () => {
		expect(C.MAX_CONCURRENCY).toBe(10);
	});

	it("BUILTIN_TOOL_NAMES contains expected tools", () => {
		expect(C.BUILTIN_TOOL_NAMES.has("read")).toBe(true);
		expect(C.BUILTIN_TOOL_NAMES.has("bash")).toBe(true);
		expect(C.BUILTIN_TOOL_NAMES.has("mcp")).toBe(true);
		expect(C.BUILTIN_TOOL_NAMES.size).toBe(8);
	});

	it("MCP_CONFIG_FLAG has correct shape", () => {
		expect(C.MCP_CONFIG_FLAG.description).toBe("Path to MCP config file");
		expect(C.MCP_CONFIG_FLAG.type).toBe("string");
	});

	it("path constants are non-empty strings", () => {
		expect(C.DEFAULT_USER_CONFIG.length).toBeGreaterThan(0);
		expect(C.DEFAULT_PROJECT_CONFIG.length).toBeGreaterThan(0);
		expect(C.CACHE_FILE_PATH.length).toBeGreaterThan(0);
		expect(C.NPX_CACHE_FILE_PATH.length).toBeGreaterThan(0);
		expect(C.OAUTH_TOKEN_DIR.length).toBeGreaterThan(0);
	});

	it("STATUS_KEY is 'mcp'", () => {
		expect(C.STATUS_KEY).toBe("mcp");
	});

	it("HASH_EXCLUDE_FIELDS contains expected fields", () => {
		expect(C.HASH_EXCLUDE_FIELDS.has("lifecycle")).toBe(true);
		expect(C.HASH_EXCLUDE_FIELDS.has("idleTimeout")).toBe(true);
		expect(C.HASH_EXCLUDE_FIELDS.has("debug")).toBe(true);
		expect(C.HASH_EXCLUDE_FIELDS.size).toBe(3);
	});

	it("SERVER_NAME_SANITIZE_RE matches unsafe chars", () => {
		const re = C.SERVER_NAME_SANITIZE_RE;
		expect("/".match(re)).not.toBeNull();
		expect("\\".match(re)).not.toBeNull();
		expect(".".match(re)).not.toBeNull();
		expect("\x00".match(re)).not.toBeNull();
		expect("safe".match(re)).toBeNull();
	});
});
