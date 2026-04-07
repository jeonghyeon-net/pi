import { describe, expect, it, vi } from "vitest";
import { proxyList, proxyDescribe, proxyStatus } from "../src/proxy-query.js";
import type { ToolMetadata } from "../src/types-tool.js";

describe("proxyList", () => {
	const tools: ToolMetadata[] = [
		{ name: "search", originalName: "search", serverName: "gh", description: "Search" },
		{ name: "pr", originalName: "pr", serverName: "gh", description: "PR ops" },
	];
	const getTools = vi.fn((_server: string) => tools);

	it("lists tools for a server", () => {
		const result = proxyList("gh", getTools);
		expect(result.content[0].text).toContain("search");
		expect(result.content[0].text).toContain("pr");
	});

	it("returns error when server has no tools", () => {
		const empty = vi.fn((_s: string) => undefined);
		const result = proxyList("none", empty);
		expect(result.content[0].text).toContain("No tools");
	});

	it("lists all servers when no server specified", () => {
		const result = proxyList(undefined, getTools);
		expect(result.content[0].text).toContain("server");
	});
});

describe("proxyDescribe", () => {
	const find = vi.fn((name: string) => {
		if (name === "search") {
			return {
				name: "search", originalName: "search", serverName: "gh",
				description: "Search repos",
				inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
			};
		}
		return undefined;
	});
	const format = (schema: unknown) => (schema ? "q: string [required]" : "(no parameters)");

	it("describes a tool with schema", () => {
		const result = proxyDescribe("search", find, format);
		expect(result.content[0].text).toContain("search");
		expect(result.content[0].text).toContain("q: string");
	});

	it("returns error when tool not found", () => {
		const result = proxyDescribe("missing", find, format);
		expect(result.content[0].text).toContain("not found");
	});

	it("requires tool name", () => {
		const result = proxyDescribe(undefined, find, format);
		expect(result.content[0].text).toContain("required");
	});
});

describe("proxyStatus", () => {
	it("shows all server statuses", () => {
		const servers = [
			{ name: "gh", status: "connected" },
			{ name: "slack", status: "closed" },
		];
		const result = proxyStatus(servers);
		expect(result.content[0].text).toContain("gh");
		expect(result.content[0].text).toContain("connected");
		expect(result.content[0].text).toContain("slack");
		expect(result.content[0].text).toContain("closed");
	});

	it("shows message when no servers", () => {
		const result = proxyStatus([]);
		expect(result.content[0].text).toContain("No servers");
	});
});
