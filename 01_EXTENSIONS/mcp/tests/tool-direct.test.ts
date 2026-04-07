import { describe, expect, it, vi } from "vitest";
import { resolveDirectTools } from "../src/tool-direct.js";
import type { ToolMetadata } from "../src/types-tool.js";

const meta = (name: string, server: string): ToolMetadata => ({
	name, originalName: name, serverName: server, description: `${name} desc`,
});

describe("resolveDirectTools", () => {
	it("promotes all tools when directTools is true", () => {
		const tools = [meta("search", "s1"), meta("fetch", "s1")];
		const result = resolveDirectTools(tools, true, "server", new Set(), vi.fn());
		expect(result).toHaveLength(2);
		expect(result[0].prefixedName).toBe("s1_search");
	});
	it("promotes only listed tools when directTools is string[]", () => {
		const tools = [meta("search", "s1"), meta("fetch", "s1")];
		const result = resolveDirectTools(tools, ["search"], "server", new Set(), vi.fn());
		expect(result).toHaveLength(1);
		expect(result[0].originalName).toBe("search");
	});
	it("returns empty when directTools is false", () => {
		const result = resolveDirectTools([meta("t", "s")], false, "server", new Set(), vi.fn());
		expect(result).toEqual([]);
	});
	it("applies none prefix", () => {
		const tools = [meta("search", "s1")];
		const result = resolveDirectTools(tools, true, "none", new Set(), vi.fn());
		expect(result[0].prefixedName).toBe("search");
	});
	it("falls back to server prefix on collision with none", () => {
		const registered = new Set(["search"]);
		const warn = vi.fn();
		const tools = [meta("search", "s1")];
		const result = resolveDirectTools(tools, true, "none", registered, warn);
		expect(result[0].prefixedName).toBe("s1_search");
		expect(warn).toHaveBeenCalled();
	});
	it("falls back to server prefix on builtin collision with none", () => {
		const tools = [meta("read", "s1")];
		const result = resolveDirectTools(tools, true, "none", new Set(), vi.fn());
		expect(result).toHaveLength(1);
		expect(result[0].prefixedName).toBe("s1_read");
	});
	it("skips builtin-colliding tools even with server prefix", () => {
		const tools = [meta("bash", "bash")];
		const result = resolveDirectTools(tools, true, "server", new Set(), vi.fn());
		expect(result[0].prefixedName).toBe("bash_bash");
	});
	it("skips duplicate with server prefix", () => {
		const registered = new Set(["s1_search"]);
		const tools = [meta("search", "s1")];
		const result = resolveDirectTools(tools, true, "server", registered, vi.fn());
		expect(result).toEqual([]);
	});
	it("skips on double collision with none prefix", () => {
		const registered = new Set(["search", "s1_search"]);
		const tools = [meta("search", "s1")];
		const result = resolveDirectTools(tools, true, "none", registered, vi.fn());
		expect(result).toEqual([]);
	});
	it("preserves inputSchema and resourceUri", () => {
		const t: ToolMetadata = {
			...meta("t", "s"), inputSchema: { type: "object" }, resourceUri: "file:///a",
		};
		const result = resolveDirectTools([t], true, "server", new Set(), vi.fn());
		expect(result[0].inputSchema).toEqual({ type: "object" });
		expect(result[0].resourceUri).toBe("file:///a");
	});
});
