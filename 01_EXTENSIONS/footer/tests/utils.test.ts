import { describe, it, expect } from "vitest";
import { clamp, getFolderName, sanitizeStatusText, styleStatus, getRepoName, hasUncommittedChanges } from "../src/utils.js";
import { NAME_STATUS_KEY } from "../src/types.js";
import { mockTheme, mockExec } from "./helpers.js";

describe("clamp", () => {
	it("returns value when within range", () => { expect(clamp(5, 0, 10)).toBe(5); });
	it("clamps to min", () => { expect(clamp(-1, 0, 10)).toBe(0); });
	it("clamps to max", () => { expect(clamp(15, 0, 10)).toBe(10); });
	it("handles equal min and max", () => { expect(clamp(5, 3, 3)).toBe(3); });
});

describe("getFolderName", () => {
	it("extracts last segment from unix path", () => { expect(getFolderName("/home/user/project")).toBe("project"); });
	it("extracts last segment from windows path", () => { expect(getFolderName("C:\\Users\\user\\project")).toBe("project"); });
	it("handles single segment", () => { expect(getFolderName("project")).toBe("project"); });
	it("handles trailing slash", () => { expect(getFolderName("/home/user/project/")).toBe("project"); });
	it("returns 'unknown' for empty string", () => { expect(getFolderName("")).toBe("unknown"); });
});

describe("sanitizeStatusText", () => {
	it("replaces tabs and newlines with spaces", () => { expect(sanitizeStatusText("hello\tworld\nfoo")).toBe("hello world foo"); });
	it("collapses multiple spaces", () => { expect(sanitizeStatusText("hello    world")).toBe("hello world"); });
	it("trims whitespace", () => { expect(sanitizeStatusText("  hello  ")).toBe("hello"); });
	it("handles carriage return", () => { expect(sanitizeStatusText("hello\rworld")).toBe("hello world"); });
});

describe("styleStatus", () => {
	const theme = mockTheme();
	it("returns text as-is for unknown keys", () => { expect(styleStatus(theme, "unknown", "hello")).toBe("hello"); });
	it("applies style for known key", () => { expect(styleStatus(theme, NAME_STATUS_KEY, "s")).toContain("s"); });
});

describe("getRepoName", () => {
	it("extracts from https URL", async () => {
		const exec = mockExec({ stdout: "https://github.com/user/my-repo.git\n", code: 0 });
		expect(await getRepoName("/tmp", exec)).toBe("my-repo");
		expect(exec).toHaveBeenCalledWith("git", ["remote", "get-url", "origin"], { cwd: "/tmp" });
	});
	it("extracts without .git suffix", async () => { expect(await getRepoName("/t", mockExec({ stdout: "https://g.com/u/r\n", code: 0 }))).toBe("r"); });
	it("extracts from ssh URL", async () => { expect(await getRepoName("/t", mockExec({ stdout: "git@g.com:u/r.git\n", code: 0 }))).toBe("r"); });
	it("returns null for non-matching URL", async () => { expect(await getRepoName("/t", mockExec({ stdout: "x\n", code: 0 }))).toBeNull(); });
	it("returns null on error code", async () => { expect(await getRepoName("/t", mockExec({ stdout: "", code: 128 }))).toBeNull(); });
	it("returns null on empty stdout", async () => { expect(await getRepoName("/t", mockExec({ stdout: "", code: 0 }))).toBeNull(); });
});

describe("hasUncommittedChanges", () => {
	it("returns true when non-empty", async () => { expect(await hasUncommittedChanges("/t", mockExec({ stdout: " M f\n", code: 0 }))).toBe(true); });
	it("returns false when empty", async () => { expect(await hasUncommittedChanges("/t", mockExec({ stdout: "", code: 0 }))).toBe(false); });
	it("returns false on error", async () => { expect(await hasUncommittedChanges("/t", mockExec({ stdout: "x", code: 128 }))).toBe(false); });
});
