import { describe, expect, it, vi } from "vitest";
import { resolveWritePath, writeServerConfig } from "../src/config-write.js";

const mockFs = (overrides = {}) => ({
	writeFile: vi.fn(), rename: vi.fn(), unlink: vi.fn(),
	readFile: vi.fn(() => "{}"), getPid: () => 1, ...overrides,
});

describe("resolveWritePath", () => {
	it("returns provenance path for known server", () => {
		const prov = { s1: { path: "/user/mcp.json", kind: "user" as const } };
		expect(resolveWritePath("s1", prov, "/fallback")).toBe("/user/mcp.json");
	});

	it("returns fallback for unknown server", () => {
		expect(resolveWritePath("s2", {}, "/fallback")).toBe("/fallback");
	});

	it("returns fallback when provenance path is empty", () => {
		const prov = { s1: { path: "", kind: "user" as const } };
		expect(resolveWritePath("s1", prov, "/fallback")).toBe("/fallback");
	});
});

describe("writeServerConfig", () => {
	it("writes updated server entry to correct file", () => {
		const existing = JSON.stringify({ mcpServers: { s1: { command: "old" } } });
		let writtenData = "";
		const fs = mockFs({
			readFile: () => existing,
			writeFile: (_p: string, d: string) => { writtenData = d; },
		});
		writeServerConfig("s1", { command: "new" }, { s1: { path: "/u.json", kind: "user" as const } }, "/fb", fs);
		expect(JSON.parse(writtenData).mcpServers.s1.command).toBe("new");
	});

	it("creates new config when file is unreadable", () => {
		let writtenData = "";
		const fs = mockFs({
			readFile: () => { throw new Error("not found"); },
			writeFile: (_p: string, d: string) => { writtenData = d; },
		});
		writeServerConfig("s1", { command: "x" }, {}, "/fallback", fs);
		expect(JSON.parse(writtenData).mcpServers.s1.command).toBe("x");
	});

	it("routes write to provenance path", () => {
		const fs = mockFs();
		const prov = { s1: { path: "/proj/mcp.json", kind: "project" as const } };
		writeServerConfig("s1", { command: "x" }, prov, "/user.json", fs);
		expect(fs.rename.mock.calls[0][1]).toBe("/proj/mcp.json");
	});
});
