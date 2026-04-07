import { describe, expect, it, vi } from "vitest";
import { writeConfigAtomic } from "../src/config-write.js";

describe("writeConfigAtomic", () => {
	it("writes via temp file then rename", () => {
		const written: Array<{ path: string; data: string }> = [];
		const renamed: Array<{ from: string; to: string }> = [];
		const fs = {
			writeFile: (p: string, d: string) => { written.push({ path: p, data: d }); },
			rename: (from: string, to: string) => { renamed.push({ from, to }); },
			unlink: vi.fn(),
			getPid: () => 1234,
		};
		const config = { mcpServers: { s1: { command: "echo" } } };
		writeConfigAtomic("/path/mcp.json", config, fs);
		expect(written).toHaveLength(1);
		expect(written[0].path).toContain("1234");
		expect(written[0].path).toContain(".tmp");
		expect(renamed).toHaveLength(1);
		expect(renamed[0].to).toBe("/path/mcp.json");
	});

	it("temp file name includes PID", () => {
		const written: Array<{ path: string }> = [];
		const fs = {
			writeFile: (p: string) => { written.push({ path: p }); },
			rename: vi.fn(),
			unlink: vi.fn(),
			getPid: () => 5678,
		};
		writeConfigAtomic("/a/b.json", { mcpServers: {} }, fs);
		expect(written[0].path).toContain("5678");
	});

	it("writes formatted JSON with 2-space indent", () => {
		let writtenData = "";
		const fs = {
			writeFile: (_p: string, d: string) => { writtenData = d; },
			rename: vi.fn(),
			unlink: vi.fn(),
			getPid: () => 1,
		};
		writeConfigAtomic("/a.json", { mcpServers: { s: { command: "x" } } }, fs);
		expect(writtenData).toContain("\n");
		expect(writtenData).toContain("  ");
		const parsed = JSON.parse(writtenData);
		expect(parsed.mcpServers.s.command).toBe("x");
	});

	it("cleans up temp file on rename failure", () => {
		const fs = {
			writeFile: vi.fn(),
			rename: () => { throw new Error("rename failed"); },
			unlink: vi.fn(),
			getPid: () => 1,
		};
		expect(() => writeConfigAtomic("/a.json", { mcpServers: {} }, fs)).toThrow("rename failed");
		expect(fs.unlink).toHaveBeenCalled();
	});

	it("still throws rename error when unlink also fails", () => {
		const fs = {
			writeFile: vi.fn(),
			rename: () => { throw new Error("rename failed"); },
			unlink: () => { throw new Error("unlink failed"); },
			getPid: () => 1,
		};
		expect(() => writeConfigAtomic("/a.json", { mcpServers: {} }, fs)).toThrow("rename failed");
	});

	it("writes trailing newline", () => {
		let writtenData = "";
		const fs = {
			writeFile: (_p: string, d: string) => { writtenData = d; },
			rename: vi.fn(),
			unlink: vi.fn(),
			getPid: () => 1,
		};
		writeConfigAtomic("/a.json", { mcpServers: {} }, fs);
		expect(writtenData.endsWith("\n")).toBe(true);
	});
});
