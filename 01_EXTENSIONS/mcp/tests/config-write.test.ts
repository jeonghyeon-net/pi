import { describe, expect, it, vi } from "vitest";
import { writeConfigAtomic } from "../src/config-write.js";

const mockFs = (overrides = {}) => ({
	writeFile: vi.fn(), rename: vi.fn(), unlink: vi.fn(),
	readFile: vi.fn(() => "{}"), getPid: () => 1, ...overrides,
});

describe("writeConfigAtomic", () => {
	it("writes via temp file then rename", () => {
		const fs = mockFs({ getPid: () => 1234 });
		writeConfigAtomic("/path/mcp.json", { mcpServers: { s1: { command: "echo" } } }, fs);
		expect(fs.writeFile).toHaveBeenCalledTimes(1);
		expect(fs.writeFile.mock.calls[0][0]).toContain("1234");
		expect(fs.writeFile.mock.calls[0][0]).toContain(".tmp");
		expect(fs.rename.mock.calls[0][1]).toBe("/path/mcp.json");
	});

	it("temp file name includes PID", () => {
		const fs = mockFs({ getPid: () => 5678 });
		writeConfigAtomic("/a/b.json", { mcpServers: {} }, fs);
		expect(fs.writeFile.mock.calls[0][0]).toContain("5678");
	});

	it("writes formatted JSON with 2-space indent", () => {
		let writtenData = "";
		const fs = mockFs({ writeFile: (_p: string, d: string) => { writtenData = d; } });
		writeConfigAtomic("/a.json", { mcpServers: { s: { command: "x" } } }, fs);
		expect(writtenData).toContain("\n");
		expect(writtenData).toContain("  ");
		expect(JSON.parse(writtenData).mcpServers.s.command).toBe("x");
	});

	it("cleans up temp file on rename failure", () => {
		const fs = mockFs({ rename: () => { throw new Error("rename failed"); } });
		expect(() => writeConfigAtomic("/a.json", { mcpServers: {} }, fs)).toThrow("rename failed");
		expect(fs.unlink).toHaveBeenCalled();
	});

	it("still throws rename error when unlink also fails", () => {
		const fs = mockFs({
			rename: () => { throw new Error("rename failed"); },
			unlink: () => { throw new Error("unlink failed"); },
		});
		expect(() => writeConfigAtomic("/a.json", { mcpServers: {} }, fs)).toThrow("rename failed");
	});

	it("writes trailing newline", () => {
		let writtenData = "";
		const fs = mockFs({ writeFile: (_p: string, d: string) => { writtenData = d; } });
		writeConfigAtomic("/a.json", { mcpServers: {} }, fs);
		expect(writtenData.endsWith("\n")).toBe(true);
	});
});
