import { describe, expect, it } from "vitest";
import { extractTouchedPaths, interpolateHeaders, replaceDynamicWatchPaths, urlAllowed } from "../src/test-api.js";

describe("claude bridge hook runtime", () => {
	it("treats grep and find without explicit paths as cwd touches", () => {
		expect(extractTouchedPaths("grep", {}, "/workspace/repo")).toEqual(["/workspace/repo"]);
		expect(extractTouchedPaths("find", {}, "/workspace/repo")).toEqual(["/workspace/repo"]);
		expect(extractTouchedPaths("find", { pattern: "src/**/*.ts" }, "/workspace/repo")).toEqual([
			"/workspace/repo",
			"/workspace/repo/src/**/*.ts",
		]);
	});

	it("interpolates allowed headers from merged Claude env", () => {
		const headers = interpolateHeaders({ Authorization: "Bearer $API_TOKEN", Other: "$IGNORED" }, ["API_TOKEN", "IGNORED"], ["API_TOKEN"], { API_TOKEN: "from-claude-env" });
		expect(headers).toEqual({ Authorization: "Bearer from-claude-env", Other: "" });
	});

	it("applies allowedHttpHookUrls wildcard restrictions", () => {
		expect(urlAllowed("https://hooks.example.com/path", ["https://hooks.example.com/*"])).toBe(true);
		expect(urlAllowed("http://localhost:3000/hook", ["http://localhost:*"])).toBe(true);
		expect(urlAllowed("https://evil.example.com/hook", ["https://hooks.example.com/*"])).toBe(false);
	});

	it("replaces dynamic file watch paths from hook output", () => {
		const next = replaceDynamicWatchPaths([{ code: 0, stdout: "", stderr: "", parsedJson: { watchPaths: [".env.local", "/tmp/keep"] } }], "/repo");
		expect(next).toEqual(["/repo/.env.local", "/tmp/keep"]);
	});
});
