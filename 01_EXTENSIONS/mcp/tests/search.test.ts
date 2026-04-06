import { describe, it, expect } from "vitest";
import { matchTool } from "../src/search.js";

describe("matchTool", () => {
	it("matches substring case-insensitive", () => {
		expect(matchTool("web_search", "SEARCH")).toBe(true);
	});

	it("treats dash and underscore as equivalent", () => {
		expect(matchTool("web-search", "web_search")).toBe(true);
		expect(matchTool("web_search", "web-search")).toBe(true);
	});

	it("returns false when no match", () => {
		expect(matchTool("web_search", "delete")).toBe(false);
	});

	it("matches regex /^web/", () => {
		expect(matchTool("web_search", "/^web/")).toBe(true);
	});

	it("returns false for regex no match", () => {
		expect(matchTool("file_read", "/^web/")).toBe(false);
	});

	it("returns false for invalid regex", () => {
		expect(matchTool("web_search", "/[invalid/")).toBe(false);
	});

	it("returns false for empty query", () => {
		expect(matchTool("web_search", "")).toBe(false);
	});
});
