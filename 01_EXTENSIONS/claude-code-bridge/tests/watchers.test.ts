import { describe, expect, it } from "vitest";
import { classifyConfigSource, diffSnapshots, extractFileWatchBasenames } from "../src/test-api.js";

describe("claude bridge watcher helpers", () => {
	it("classifies config change sources", () => {
		expect(classifyConfigSource("/Users/me/.claude/settings.json")).toBe("user_settings");
		expect(classifyConfigSource("/Users/me/.claude/settings.local.json")).toBe("user_settings");
		expect(classifyConfigSource("/repo/.claude/settings.json")).toBe("project_settings");
		expect(classifyConfigSource("/repo/.claude/settings.local.json")).toBe("local_settings");
		expect(classifyConfigSource("/repo/.claude/skills/review.md")).toBe("skills");
	});

	it("detects add, change, and unlink transitions", () => {
		const before = new Map([["/a", "1"], ["/b", "1"]]);
		const after = new Map([["/a", "2"], ["/c", "1"]]);
		expect(diffSnapshots(before, after)).toEqual([{ path: "/a", event: "change" }, { path: "/b", event: "unlink" }, { path: "/c", event: "add" }]);
	});

	it("falls back to wildcard file watching for regex matchers", () => {
		const hooks = [{ matcher: ".env|.envrc" }, { matcher: "config-.*" }];
		expect(extractFileWatchBasenames(hooks)).toEqual([".env", ".envrc", "*"]);
	});
});
