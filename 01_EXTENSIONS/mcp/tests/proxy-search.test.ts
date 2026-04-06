import { describe, expect, it } from "vitest";
import { proxySearch } from "../src/proxy-search.js";
import type { ToolMetadata } from "../src/types-tool.js";

describe("proxySearch", () => {
	const meta: Map<string, ToolMetadata[]> = new Map([
		["github", [
			{ name: "search_repos", originalName: "search_repos", serverName: "github", description: "Search repos" },
			{ name: "create_pr", originalName: "create_pr", serverName: "github", description: "Create PR" },
		]],
		["slack", [
			{ name: "send_message", originalName: "send_message", serverName: "slack", description: "Send msg" },
			{ name: "search_msgs", originalName: "search_msgs", serverName: "slack", description: "Search messages" },
		]],
	]);

	const matcher = (toolName: string, query: string): boolean =>
		toolName.toLowerCase().includes(query.toLowerCase().replace(/[-_]/g, ""));

	it("finds tools matching query across all servers", () => {
		const result = proxySearch("search", meta, matcher);
		expect(result.content[0].text).toContain("search_repos");
		expect(result.content[0].text).toContain("search_msgs");
	});

	it("returns no results message when nothing matches", () => {
		const result = proxySearch("zzz_nonexistent", meta, matcher);
		expect(result.content[0].text).toContain("No tools found");
	});

	it("returns empty result for empty query", () => {
		const noMatch = (_t: string, _q: string) => false;
		const result = proxySearch("", meta, noMatch);
		expect(result.content[0].text).toContain("No tools found");
	});

	it("groups results by server", () => {
		const result = proxySearch("search", meta, matcher);
		const text = result.content[0].text ?? "";
		expect(text).toContain("github");
		expect(text).toContain("slack");
	});

	it("includes tool descriptions in output", () => {
		const result = proxySearch("create", meta, matcher);
		const text = result.content[0].text ?? "";
		expect(text).toContain("Create PR");
	});
});
