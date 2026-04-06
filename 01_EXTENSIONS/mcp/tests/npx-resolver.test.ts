import { describe, expect, it, vi } from "vitest";
import { resolveNpxCommand } from "../src/npx-resolver.js";
import type { ExecSync, NpxCacheOps } from "../src/npx-resolver.js";

describe("resolveNpxCommand", () => {
	const NOW = 1_000_000;
	const mc = (entries: Record<string, { path: string; at: number }> = {}): NpxCacheOps => {
		const s = new Map(Object.entries(entries));
		return { get: (k: string) => s.get(k), set: vi.fn((k, v) => { s.set(k, v); }) };
	};
	const ok = (v: string): ExecSync => vi.fn().mockReturnValue(v);

	it("returns original command when not npx/npm", () => {
		const exec: ExecSync = vi.fn();
		expect(resolveNpxCommand("node", ["server.js"], exec, mc(), NOW))
			.toEqual({ command: "node", args: ["server.js"] });
		expect(exec).not.toHaveBeenCalled();
	});

	it("resolves npx package to binary path", () => {
		const exec = ok("/usr/local/bin/server\n");
		const r = resolveNpxCommand("npx", ["@org/server"], exec, mc(), NOW);
		expect(r.command).toBe("/usr/local/bin/server");
		expect(r.args).toEqual([]);
		expect(exec).toHaveBeenCalled();
	});

	it("uses cache for recent resolution", () => {
		const exec: ExecSync = vi.fn();
		const r = resolveNpxCommand("npx", ["@org/server"], exec,
			mc({ "@org/server": { path: "/cached/bin", at: NOW - 1000 } }), NOW);
		expect(r.command).toBe("/cached/bin");
		expect(exec).not.toHaveBeenCalled();
	});

	it("bypasses stale cache (>24h)", () => {
		const r = resolveNpxCommand("npx", ["pkg"], ok("/new/bin\n"),
			mc({ pkg: { path: "/old/bin", at: NOW - 25 * 60 * 60 * 1000 } }), NOW);
		expect(r.command).toBe("/new/bin");
	});

	it("handles npm exec --", () => {
		const r = resolveNpxCommand("npm", ["exec", "--", "tool"], ok("/bin/tool\n"), mc(), NOW);
		expect(r.command).toBe("/bin/tool");
	});

	it("passes extra args through after package", () => {
		const r = resolveNpxCommand("npx", ["@org/server", "--port", "3000"], ok("/bin/srv\n"), mc(), NOW);
		expect(r.command).toBe("/bin/srv");
		expect(r.args).toEqual(["--port", "3000"]);
	});

	it("falls back to original on exec failure", () => {
		const exec: ExecSync = vi.fn().mockImplementation(() => { throw new Error("not found"); });
		expect(resolveNpxCommand("npx", ["pkg"], exec, mc(), NOW))
			.toEqual({ command: "npx", args: ["pkg"] });
	});

	it("handles npx -y flag", () => {
		const r = resolveNpxCommand("npx", ["-y", "pkg"], ok("/bin/pkg\n"), mc(), NOW);
		expect(r.command).toBe("/bin/pkg");
		expect(r.args).toEqual([]);
	});

	it("handles -p flag with value", () => {
		const r = resolveNpxCommand("npx", ["-p", "@scope/dep", "tool"], ok("/bin/tool\n"), mc(), NOW);
		expect(r.command).toBe("/bin/tool");
	});

	it("handles --package flag with value", () => {
		const r = resolveNpxCommand("npx", ["--package", "dep", "tool"], ok("/bin/tool\n"), mc(), NOW);
		expect(r.command).toBe("/bin/tool");
	});

	it("returns original when exec returns empty string", () => {
		expect(resolveNpxCommand("npx", ["pkg"], ok(""), mc(), NOW))
			.toEqual({ command: "npx", args: ["pkg"] });
	});

	it("returns original for npx with no args", () => {
		const exec: ExecSync = vi.fn();
		expect(resolveNpxCommand("npx", [], exec, mc(), NOW))
			.toEqual({ command: "npx", args: [] });
	});

	it("handles npm exec without -- separator", () => {
		const r = resolveNpxCommand("npm", ["exec", "tool"], ok("/bin/tool\n"), mc(), NOW);
		expect(r.command).toBe("/bin/tool");
	});
});
