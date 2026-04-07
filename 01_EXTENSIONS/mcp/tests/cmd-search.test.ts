import { describe, expect, it } from "vitest";
import { formatSearchResults } from "../src/cmd-search.js";
import type { ToolMetadata } from "../src/types-tool.js";

const matchAll = () => true;
const matchNone = () => false;

describe("formatSearchResults", () => {
	it("returns matching tools across servers", () => {
		const meta = new Map<string, ToolMetadata[]>([
			["s1", [
				{ name: "s1_web_search", originalName: "web_search", serverName: "s1", description: "Search" },
				{ name: "s1_file_read", originalName: "file_read", serverName: "s1", description: "Read" },
			]],
			["s2", [
				{ name: "s2_search_docs", originalName: "search_docs", serverName: "s2", description: "Docs" },
			]],
		]);
		const matcher = (name: string) => name.includes("search");
		const result = formatSearchResults(meta, "search", matcher);
		expect(result).toContain("web_search");
		expect(result).toContain("search_docs");
		expect(result).not.toContain("file_read");
	});
	it("returns no-results message when nothing matches", () => {
		const meta = new Map<string, ToolMetadata[]>([
			["s1", [{ name: "t1", originalName: "t1", serverName: "s1", description: "d" }]],
		]);
		const result = formatSearchResults(meta, "xyz", matchNone);
		expect(result).toContain("No tools matching");
	});
	it("returns no-results when metadata is empty", () => {
		const result = formatSearchResults(new Map(), "q", matchAll);
		expect(result).toContain("No tools matching");
	});
	it("includes server name in results", () => {
		const meta = new Map<string, ToolMetadata[]>([
			["myserver", [{ name: "ms_t", originalName: "t", serverName: "myserver", description: "d" }]],
		]);
		const result = formatSearchResults(meta, "t", matchAll);
		expect(result).toContain("myserver");
	});
	it("shows query in header", () => {
		const meta = new Map<string, ToolMetadata[]>([
			["s1", [{ name: "t", originalName: "t", serverName: "s1", description: "d" }]],
		]);
		const result = formatSearchResults(meta, "myquery", matchAll);
		expect(result).toContain("myquery");
	});
});
