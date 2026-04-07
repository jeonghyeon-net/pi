import { describe, expect, it, beforeEach } from "vitest";
import { buildDescription } from "../src/proxy-description.js";

describe("buildDescription", () => {
	const makeState = (
		servers: Array<{ name: string; status: string }>,
		metadata: Map<string, Array<{ name: string }>>,
	) => ({
		getServers: () => servers,
		getMetadataMap: () => metadata,
	});

	it("returns base description with no servers", () => {
		const state = makeState([], new Map());
		const desc = buildDescription(state);
		expect(desc).toContain("MCP proxy");
		expect(desc).toContain("No servers configured");
	});

	it("lists connected servers with tool counts", () => {
		const meta = new Map<string, Array<{ name: string }>>();
		meta.set("github", [{ name: "search" }, { name: "pr" }]);
		const state = makeState(
			[{ name: "github", status: "connected" }],
			meta,
		);
		const desc = buildDescription(state);
		expect(desc).toContain("github");
		expect(desc).toContain("2 tools");
	});

	it("shows status for disconnected servers", () => {
		const state = makeState(
			[{ name: "slack", status: "closed" }],
			new Map(),
		);
		const desc = buildDescription(state);
		expect(desc).toContain("slack");
		expect(desc).toContain("closed");
	});

	it("shows multiple servers", () => {
		const meta = new Map<string, Array<{ name: string }>>();
		meta.set("a", [{ name: "t1" }]);
		meta.set("b", [{ name: "t2" }, { name: "t3" }]);
		const state = makeState(
			[{ name: "a", status: "connected" }, { name: "b", status: "connected" }],
			meta,
		);
		const desc = buildDescription(state);
		expect(desc).toContain("a");
		expect(desc).toContain("1 tool");
		expect(desc).toContain("b");
		expect(desc).toContain("2 tools");
	});

	it("shows cached tool count for lazy servers", () => {
		const meta = new Map<string, Array<{ name: string }>>();
		meta.set("lazy-srv", [{ name: "t1" }, { name: "t2" }, { name: "t3" }]);
		const state = makeState(
			[{ name: "lazy-srv", status: "closed" }],
			meta,
		);
		const desc = buildDescription(state);
		expect(desc).toContain("3 tools");
	});
});
