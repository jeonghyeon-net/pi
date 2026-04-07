import { describe, it, expect } from "vitest";
import { shouldLog, formatEntry } from "../src/logger-format.js";
import type { LogLevel } from "../src/logger-format.js";

describe("shouldLog", () => {
	it("allows same level", () => {
		expect(shouldLog("info", "info")).toBe(true);
	});

	it("allows higher level", () => {
		expect(shouldLog("error", "debug")).toBe(true);
	});

	it("blocks lower level", () => {
		expect(shouldLog("debug", "info")).toBe(false);
	});

	it("debug allows everything at debug min", () => {
		const levels: LogLevel[] = ["debug", "info", "warn", "error"];
		for (const l of levels) expect(shouldLog(l, "debug")).toBe(true);
	});

	it("error only allows error at error min", () => {
		expect(shouldLog("warn", "error")).toBe(false);
		expect(shouldLog("error", "error")).toBe(true);
	});
});

describe("formatEntry", () => {
	it("formats without context", () => {
		expect(formatEntry("info", "hello")).toBe("[mcp:info] hello");
	});

	it("formats with context", () => {
		const result = formatEntry("warn", "slow", { server: "gh" });
		expect(result).toBe("[mcp:warn] slow (server=gh)");
	});

	it("filters undefined context values", () => {
		const result = formatEntry("debug", "msg", { a: "1", b: undefined });
		expect(result).toBe("[mcp:debug] msg (a=1)");
	});

	it("returns no parens when all context values undefined", () => {
		const result = formatEntry("error", "msg", { a: undefined });
		expect(result).toBe("[mcp:error] msg");
	});

	it("formats with empty context object", () => {
		const result = formatEntry("info", "msg", {});
		expect(result).toBe("[mcp:info] msg");
	});
});
