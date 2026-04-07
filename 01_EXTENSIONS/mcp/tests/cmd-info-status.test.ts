import { describe, expect, it, vi } from "vitest";
import { formatStatus } from "../src/cmd-info.js";
import type { ToolMetadata } from "../src/types-tool.js";

function makeConn(name: string, status: "connected" | "closed" | "failed") {
	return { name, status, client: { callTool: vi.fn(), listTools: vi.fn(), listResources: vi.fn(), readResource: vi.fn(), ping: vi.fn(), close: vi.fn() }, transport: { close: vi.fn() }, lastUsedAt: Date.now(), inFlight: 0 };
}

describe("formatStatus", () => {
	it("shows connected and failed server variants", () => {
		const cfg = { mcpServers: { s1: { command: "echo" } } };
		expect(formatStatus(new Map([["s1", makeConn("s1", "connected")]]), cfg, new Map(), () => undefined)).toContain("\u2713");
		const fail = { at: Date.now() - 60000, count: 2 };
		expect(formatStatus(new Map([["s1", makeConn("s1", "failed")]]), cfg, new Map(), () => fail)).toContain("1m ago");
		expect(formatStatus(new Map([["s1", makeConn("s1", "failed")]]), cfg, new Map(), () => ({ at: Date.now() - 7200000, count: 1 }))).toContain("2h ago");
		expect(formatStatus(new Map([["s1", makeConn("s1", "failed")]]), cfg, new Map(), () => ({ at: Date.now() - 30000, count: 1 }))).toContain("30s ago");
		expect(formatStatus(new Map([["s1", makeConn("s1", "failed")]]), cfg, new Map(), () => undefined)).toContain("failed");
	});

	it("shows not connected and cached variants", () => {
		const cfg = { mcpServers: { s1: { command: "echo" } } };
		const disconnected = formatStatus(new Map(), cfg, new Map(), () => undefined);
		expect(disconnected).toContain("\u25CB");
		expect(disconnected).toContain("not connected");
		const meta = new Map<string, ToolMetadata[]>([["s1", [{ name: "t1", originalName: "t1", serverName: "s1", description: "d" }]]]);
		expect(formatStatus(new Map(), cfg, meta, () => undefined)).toContain("cached");
		expect(formatStatus(new Map(), cfg, new Map([["s1", []]]), () => undefined)).toContain("cached");
	});

	it("shows tool counts and empty state", () => {
		const cfg = { mcpServers: { s1: { command: "echo" } } };
		const meta = new Map<string, ToolMetadata[]>([["s1", [{ name: "t1", originalName: "t1", serverName: "s1", description: "d" }]]]);
		expect(formatStatus(new Map([["s1", makeConn("s1", "connected")]]), cfg, meta, () => undefined)).toContain("1 tool");
		expect(formatStatus(new Map(), { mcpServers: {} }, new Map(), () => undefined)).toContain("No servers");
	});
});
