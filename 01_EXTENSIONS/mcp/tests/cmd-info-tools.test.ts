import { describe, expect, it } from "vitest";
import { formatTools } from "../src/cmd-info.js";
import type { ToolMetadata } from "../src/types-tool.js";

describe("formatTools", () => {
	it("lists tools for a specific server", () => {
		const meta = new Map<string, ToolMetadata[]>([["s1", [{ name: "s1_echo", originalName: "echo", serverName: "s1", description: "Echo text" }]]]);
		const result = formatTools(meta, "s1");
		expect(result).toContain("echo");
		expect(result).toContain("Echo text");
	});

	it("lists tools across all servers when no filter", () => {
		const meta = new Map<string, ToolMetadata[]>([
			["s1", [{ name: "s1_a", originalName: "a", serverName: "s1", description: "d1" }]],
			["s2", [{ name: "s2_b", originalName: "b", serverName: "s2", description: "d2" }]],
		]);
		const result = formatTools(meta, undefined);
		expect(result).toContain("s1");
		expect(result).toContain("s2");
	});

	it("returns empty messages", () => {
		expect(formatTools(new Map(), "s1")).toContain("No tools");
		expect(formatTools(new Map(), undefined)).toContain("No tools available");
	});
});
