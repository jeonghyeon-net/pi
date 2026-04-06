import { describe, it, expect } from "vitest";
import { shouldLog, formatEntry } from "../src/logger-format.js";

describe("shouldLog", () => {
	it("debug at debug level returns true", () => {
		expect(shouldLog("debug", "debug")).toBe(true);
	});

	it("debug at info level returns false", () => {
		expect(shouldLog("debug", "info")).toBe(false);
	});

	it("error at any level returns true", () => {
		expect(shouldLog("error", "debug")).toBe(true);
		expect(shouldLog("error", "info")).toBe(true);
		expect(shouldLog("error", "warn")).toBe(true);
		expect(shouldLog("error", "error")).toBe(true);
	});

	it("warn at error level returns false", () => {
		expect(shouldLog("warn", "error")).toBe(false);
	});

	it("info at info level returns true", () => {
		expect(shouldLog("info", "info")).toBe(true);
	});

	it("warn at warn level returns true", () => {
		expect(shouldLog("warn", "warn")).toBe(true);
	});
});

describe("formatEntry", () => {
	it("formats without context", () => {
		expect(formatEntry("info", "hello")).toBe("[mcp:info] hello");
	});

	it("formats with context", () => {
		const result = formatEntry("warn", "test", { key: "val" });
		expect(result).toBe("[mcp:warn] test (key=val)");
	});

	it("filters undefined context values", () => {
		const result = formatEntry("debug", "msg", { a: "1", b: undefined, c: "3" });
		expect(result).toBe("[mcp:debug] msg (a=1 c=3)");
	});

	it("handles empty context object", () => {
		expect(formatEntry("error", "fail", {})).toBe("[mcp:error] fail");
	});

	it("handles all undefined context values", () => {
		expect(formatEntry("info", "test", { a: undefined })).toBe("[mcp:info] test");
	});
});
