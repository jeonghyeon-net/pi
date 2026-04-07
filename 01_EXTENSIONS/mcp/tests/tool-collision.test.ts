import { describe, expect, it, vi } from "vitest";
import { checkCollision, applyPrefix } from "../src/tool-collision.js";

describe("applyPrefix", () => {
	it("server prefix: servername_toolname", () => {
		expect(applyPrefix("myserver", "mytool", "server")).toBe("myserver_mytool");
	});
	it("short prefix: first 2 chars + _toolname", () => {
		expect(applyPrefix("myserver", "mytool", "short")).toBe("my_mytool");
	});
	it("none prefix: toolname only", () => {
		expect(applyPrefix("myserver", "mytool", "none")).toBe("mytool");
	});
	it("short prefix with 1-char server name", () => {
		expect(applyPrefix("s", "tool", "short")).toBe("s_tool");
	});
});

describe("checkCollision", () => {
	it("no collision for new name", () => {
		const result = checkCollision("newtool", new Set(), vi.fn());
		expect(result).toEqual({ collision: false });
	});
	it("detects builtin collision", () => {
		const warn = vi.fn();
		const result = checkCollision("read", new Set(), warn);
		expect(result).toEqual({ collision: true, reason: "builtin" });
		expect(warn).toHaveBeenCalled();
	});
	it("detects all builtin names", () => {
		const builtins = ["read", "bash", "edit", "write", "grep", "find", "ls", "mcp"];
		for (const name of builtins) {
			const r = checkCollision(name, new Set(), vi.fn());
			expect(r.collision).toBe(true);
		}
	});
	it("detects cross-server collision", () => {
		const warn = vi.fn();
		const registered = new Set(["mytool"]);
		const result = checkCollision("mytool", registered, warn);
		expect(result).toEqual({ collision: true, reason: "duplicate" });
		expect(warn).toHaveBeenCalled();
	});
	it("no collision if name not in registered set", () => {
		const result = checkCollision("unique", new Set(["other"]), vi.fn());
		expect(result).toEqual({ collision: false });
	});
});
