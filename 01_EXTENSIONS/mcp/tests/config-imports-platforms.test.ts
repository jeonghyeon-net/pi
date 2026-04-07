import { describe, expect, it } from "vitest";
import { getImportPath } from "../src/config-imports.js";

describe("config-imports platform paths", () => {
	const home = "/Users/me";
	const linuxHome = "/home/me";
	const winHome = "C:\\Users\\me";

	it("cursor darwin", () => {
		expect(getImportPath("cursor", "darwin", home)).toBe(`${home}/.cursor/mcp.json`);
	});
	it("cursor linux", () => {
		expect(getImportPath("cursor", "linux", linuxHome)).toBe(`${linuxHome}/.cursor/mcp.json`);
	});
	it("cursor win32", () => {
		expect(getImportPath("cursor", "win32", winHome)).toBe(`${winHome}\\.cursor\\mcp.json`);
	});

	it("claude-code darwin", () => {
		expect(getImportPath("claude-code", "darwin", home)).toBe(`${home}/.claude/mcp.json`);
	});
	it("claude-code linux", () => {
		expect(getImportPath("claude-code", "linux", linuxHome)).toBe(`${linuxHome}/.claude/mcp.json`);
	});

	it("claude-desktop darwin", () => {
		const p = getImportPath("claude-desktop", "darwin", home);
		expect(p).toBe(`${home}/Library/Application Support/Claude/claude_desktop_config.json`);
	});
	it("claude-desktop linux", () => {
		const p = getImportPath("claude-desktop", "linux", linuxHome);
		expect(p).toBe(`${linuxHome}/.config/Claude/claude_desktop_config.json`);
	});
	it("claude-desktop win32", () => {
		const p = getImportPath("claude-desktop", "win32", winHome);
		expect(p).toBe(`${winHome}\\AppData\\Roaming\\Claude\\claude_desktop_config.json`);
	});

	it("codex darwin", () => {
		expect(getImportPath("codex", "darwin", home)).toBe(`${home}/.codex/mcp.json`);
	});
	it("codex linux", () => {
		expect(getImportPath("codex", "linux", linuxHome)).toBe(`${linuxHome}/.codex/mcp.json`);
	});

	it("windsurf darwin", () => {
		const p = getImportPath("windsurf", "darwin", home);
		expect(p).toBe(`${home}/Library/Application Support/Windsurf/mcp.json`);
	});
	it("windsurf linux", () => {
		const p = getImportPath("windsurf", "linux", linuxHome);
		expect(p).toBe(`${linuxHome}/.config/Windsurf/mcp.json`);
	});
	it("windsurf win32", () => {
		const p = getImportPath("windsurf", "win32", winHome);
		expect(p).toBe(`${winHome}\\AppData\\Roaming\\Windsurf\\mcp.json`);
	});

	it("vscode darwin", () => {
		const p = getImportPath("vscode", "darwin", home);
		expect(p).toBe(`${home}/Library/Application Support/Code/User/mcp.json`);
	});
	it("vscode linux", () => {
		const p = getImportPath("vscode", "linux", linuxHome);
		expect(p).toBe(`${linuxHome}/.config/Code/User/mcp.json`);
	});
	it("vscode win32", () => {
		const p = getImportPath("vscode", "win32", winHome);
		expect(p).toBe(`${winHome}\\AppData\\Roaming\\Code\\User\\mcp.json`);
	});
});
