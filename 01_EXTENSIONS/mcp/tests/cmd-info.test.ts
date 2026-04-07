import { describe, expect, it, vi } from "vitest";
import { formatStatus, formatTools } from "../src/cmd-info.js";
import type { ToolMetadata } from "../src/types-tool.js";

function makeConn(name: string, status: "connected" | "closed" | "failed") {
	return { name, status, client: { callTool: vi.fn(), listTools: vi.fn(), listResources: vi.fn(), readResource: vi.fn(), ping: vi.fn(), close: vi.fn() }, transport: { close: vi.fn() }, lastUsedAt: Date.now(), inFlight: 0 };
}

describe("formatStatus", () => {
	it("shows connected server with checkmark", () => {
		const conns = new Map([["s1", makeConn("s1", "connected")]]);
		const cfg = { mcpServers: { s1: { command: "echo" } } };
		const result = formatStatus(conns, cfg, new Map(), () => undefined);
		expect(result).toContain("s1");
		expect(result).toContain("\u2713");
	});
	it("shows failed server with cross and time (minutes)", () => {
		const conns = new Map([["s1", makeConn("s1", "failed")]]);
		const cfg = { mcpServers: { s1: { command: "echo" } } };
		const fail = { at: Date.now() - 60000, count: 2 };
		const result = formatStatus(conns, cfg, new Map(), (n) => n === "s1" ? fail : undefined);
		expect(result).toContain("\u2717");
		expect(result).toContain("1m ago");
	});
	it("shows failed server with hours ago", () => {
		const conns = new Map([["s1", makeConn("s1", "failed")]]);
		const cfg = { mcpServers: { s1: { command: "echo" } } };
		const fail = { at: Date.now() - 7200000, count: 1 };
		const result = formatStatus(conns, cfg, new Map(), (n) => n === "s1" ? fail : undefined);
		expect(result).toContain("2h ago");
	});
	it("shows failed server with seconds ago", () => {
		const conns = new Map([["s1", makeConn("s1", "failed")]]);
		const cfg = { mcpServers: { s1: { command: "echo" } } };
		const fail = { at: Date.now() - 30000, count: 1 };
		const result = formatStatus(conns, cfg, new Map(), (n) => n === "s1" ? fail : undefined);
		expect(result).toContain("30s ago");
	});
	it("shows failed server without failure record", () => {
		const conns = new Map([["s1", makeConn("s1", "failed")]]);
		const cfg = { mcpServers: { s1: { command: "echo" } } };
		const result = formatStatus(conns, cfg, new Map(), () => undefined);
		expect(result).toContain("\u2717");
		expect(result).toContain("failed");
	});
	it("shows unconfigured server with circle", () => {
		const conns = new Map<string, unknown>();
		const cfg = { mcpServers: { s1: { command: "echo" } } };
		const result = formatStatus(conns, cfg, new Map(), () => undefined);
		expect(result).toContain("\u25CB");
	});
	it("shows tool count per server", () => {
		const conns = new Map([["s1", makeConn("s1", "connected")]]);
		const cfg = { mcpServers: { s1: { command: "echo" } } };
		const meta = new Map<string, ToolMetadata[]>([["s1", [
			{ name: "t1", originalName: "t1", serverName: "s1", description: "d" },
		]]]);
		const result = formatStatus(conns, cfg, meta, () => undefined);
		expect(result).toContain("1 tool");
	});
	it("returns message when no servers configured", () => {
		const result = formatStatus(new Map(), { mcpServers: {} }, new Map(), () => undefined);
		expect(result).toContain("No servers");
	});
});

describe("formatTools", () => {
	it("lists tools for a specific server", () => {
		const meta = new Map<string, ToolMetadata[]>([["s1", [
			{ name: "s1_echo", originalName: "echo", serverName: "s1", description: "Echo text" },
		]]]);
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
	it("returns message when server has no tools", () => {
		const result = formatTools(new Map(), "s1");
		expect(result).toContain("No tools");
	});
	it("returns no-tools message when all metadata empty and no filter", () => {
		const result = formatTools(new Map(), undefined);
		expect(result).toContain("No tools available");
	});
});
