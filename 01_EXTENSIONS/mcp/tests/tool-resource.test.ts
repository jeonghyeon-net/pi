import { describe, expect, it, vi } from "vitest";
import { buildResourceToolSpecs } from "../src/tool-resource.js";
import type { ToolMetadata } from "../src/types-tool.js";

const resMeta = (name: string, uri: string, server: string): ToolMetadata => ({
	name, originalName: name, serverName: server,
	description: `Resource: ${name}`, resourceUri: uri,
});

describe("buildResourceToolSpecs", () => {
	it("converts resources to get_-prefixed specs", () => {
		const resources = [resMeta("readme", "file:///readme", "s1")];
		const result = buildResourceToolSpecs(
			resources, "server", true, new Set(), vi.fn(),
		);
		expect(result).toHaveLength(1);
		expect(result[0].prefixedName).toBe("s1_get_readme");
		expect(result[0].resourceUri).toBe("file:///readme");
	});
	it("returns empty when exposeResources is false", () => {
		const resources = [resMeta("doc", "file:///doc", "s1")];
		const result = buildResourceToolSpecs(
			resources, "server", false, new Set(), vi.fn(),
		);
		expect(result).toEqual([]);
	});
	it("applies none prefix with get_ prefix", () => {
		const resources = [resMeta("config", "file:///cfg", "s1")];
		const result = buildResourceToolSpecs(
			resources, "none", true, new Set(), vi.fn(),
		);
		expect(result[0].prefixedName).toBe("get_config");
	});
	it("applies short prefix with get_ prefix", () => {
		const resources = [resMeta("data", "file:///d", "myserver")];
		const result = buildResourceToolSpecs(
			resources, "short", true, new Set(), vi.fn(),
		);
		expect(result[0].prefixedName).toBe("my_get_data");
	});
	it("allows get_-prefixed resources that do not collide with builtins", () => {
		const resources = [resMeta("read", "file:///r", "s")];
		const result = buildResourceToolSpecs(
			resources, "none", true, new Set(), vi.fn(),
		);
		expect(result[0].prefixedName).toBe("get_read");
	});
	it("falls back to server prefix on collision", () => {
		const registered = new Set(["get_tool"]);
		const warn = vi.fn();
		const resources = [resMeta("tool", "file:///t", "s1")];
		const result = buildResourceToolSpecs(
			resources, "none", true, registered, warn,
		);
		expect(result[0].prefixedName).toBe("s1_get_tool");
		expect(warn).toHaveBeenCalled();
	});
	it("skips on double collision", () => {
		const registered = new Set(["get_tool", "s1_get_tool"]);
		const resources = [resMeta("tool", "file:///t", "s1")];
		const result = buildResourceToolSpecs(
			resources, "none", true, registered, vi.fn(),
		);
		expect(result).toEqual([]);
	});
	it("skips collision with non-none prefix", () => {
		const registered = new Set(["s1_get_tool"]);
		const resources = [resMeta("tool", "file:///t", "s1")];
		const result = buildResourceToolSpecs(
			resources, "server", true, registered, vi.fn(),
		);
		expect(result).toEqual([]);
	});
	it("skips resources without resourceUri", () => {
		const noUri: ToolMetadata = {
			name: "x", originalName: "x", serverName: "s",
			description: "no uri",
		};
		const result = buildResourceToolSpecs(
			[noUri], "server", true, new Set(), vi.fn(),
		);
		expect(result).toEqual([]);
	});
	it("defaults exposeResources to true", () => {
		const resources = [resMeta("doc", "file:///d", "s1")];
		const result = buildResourceToolSpecs(
			resources, "server", undefined, new Set(), vi.fn(),
		);
		expect(result).toHaveLength(1);
	});
});
