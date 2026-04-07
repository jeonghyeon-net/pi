import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectSettings, loadState } from "../src/test-api.js";

const makeTempTree = () => mkdtemp(join(tmpdir(), "claude-code-bridge-test-"));

describe("claude bridge settings safety", () => {
	it("ignores project disableAllHooks and if-filtered hooks", async () => {
		const root = await makeTempTree();
		const repo = join(root, "repo");
		await mkdir(join(repo, ".claude"), { recursive: true });
		await writeFile(join(repo, ".claude", "settings.json"), JSON.stringify({ disableAllHooks: true, hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo ok", if: "Bash(git *)" }] }] } }), "utf8");
		const state = await loadState(repo);
		expect(state.disableAllHooks).toBe(false);
		expect(state.hooksByEvent.get("PreToolUse") || []).toHaveLength(0);
		expect(state.warnings.join("\n")).toContain("Ignoring project/local disableAllHooks");
		expect(state.warnings.join("\n")).toContain("Ignoring Claude hook with unsupported 'if' filter");
	});

	it("parses ConfigChange and FileChanged hooks plus user-only allowlists", async () => {
		const root = await makeTempTree();
		const home = join(root, "home");
		const repo = join(root, "repo");
		process.env.HOME = home;
		await mkdir(join(home, ".claude"), { recursive: true });
		await mkdir(join(repo, ".claude"), { recursive: true });
		await mkdir(join(repo, "src", "nested"), { recursive: true });
		await writeFile(join(home, ".claude", "settings.local.json"), JSON.stringify({ allowedHttpHookUrls: ["https://hooks.example.com/*"], claudeMdExcludes: ["**/skip/**"] }), "utf8");
		await writeFile(join(repo, ".claude", "settings.team.json"), JSON.stringify({ hooks: { ConfigChange: [{ matcher: "project_settings", hooks: [{ type: "command", command: "echo cfg" }] }], FileChanged: [{ matcher: ".env|.envrc", hooks: [{ type: "http", url: "https://hooks.example.com/file" }] }] } }), "utf8");
		const state = await loadState(join(repo, "src", "nested"));
		expect(state.allowedHttpHookUrls).toEqual(["https://hooks.example.com/*"]);
		expect(state.claudeMdExcludes).toEqual(["**/skip/**"]);
		expect(state.hooksByEvent.get("ConfigChange")?.[0]?.matcher).toBe("project_settings");
		expect(state.hooksByEvent.get("FileChanged")?.[0]?.type).toBe("http");
		expect(state.fileWatchBasenames).toEqual([".env", ".envrc"]);
	});

	it("ignores project-only claudeMdExcludes", async () => {
		const root = await makeTempTree();
		const home = join(root, "home");
		const repo = join(root, "repo");
		process.env.HOME = home;
		await mkdir(join(home, ".claude"), { recursive: true });
		await mkdir(join(repo, ".claude", "rules", "skip"), { recursive: true });
		await writeFile(join(repo, ".claude", "settings.local.json"), JSON.stringify({ claudeMdExcludes: ["**/skip/**"] }), "utf8");
		await writeFile(join(repo, ".claude", "rules", "keep.md"), "Keep this", "utf8");
		await writeFile(join(repo, ".claude", "rules", "skip", "drop.md"), "Drop this", "utf8");
		const state = await loadState(repo);
		expect(state.unconditionalPromptText).toContain("Keep this");
		expect(state.unconditionalPromptText).toContain("Drop this");
		expect(state.warnings.join("\n")).toContain("Ignoring project/local claudeMdExcludes");
	});

	it("ignores ancestor settings and instructions above the detected project root", async () => {
		const root = await makeTempTree();
		const outer = join(root, "outer");
		const repo = join(outer, "inner");
		await mkdir(join(outer, ".claude"), { recursive: true });
		await mkdir(join(repo, ".git"), { recursive: true });
		await writeFile(join(outer, "CLAUDE.md"), "outer instructions", "utf8");
		await writeFile(join(outer, ".claude", "settings.json"), JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo outer" }] }] } }), "utf8");
		const state = await loadState(repo);
		expect(state.hooksByEvent.get("PreToolUse") || []).toHaveLength(0);
		expect(state.unconditionalPromptText).not.toContain("outer instructions");
	});

	it("keeps only supported prompt and agent hook combinations", async () => {
		const root = await makeTempTree();
		const repo = join(root, "repo");
		await mkdir(join(repo, ".claude"), { recursive: true });
		await writeFile(join(repo, ".claude", "settings.json"), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "prompt", prompt: "check $ARGUMENTS" }] }], PreToolUse: [{ matcher: "Read", hooks: [{ type: "agent", prompt: "verify $ARGUMENTS" }] }], ConfigChange: [{ hooks: [{ type: "prompt", prompt: "nope" }] }], SessionStart: [{ hooks: [{ type: "agent", prompt: "never" }] }] } }), "utf8");
		const settings = collectSettings(repo);
		expect(settings.hooksByEvent.get("Stop")?.[0]?.type).toBe("prompt");
		expect(settings.hooksByEvent.get("PreToolUse")?.[0]?.type).toBe("agent");
		expect(settings.hooksByEvent.get("ConfigChange") || []).toHaveLength(0);
		expect(settings.warnings.join("\n")).toContain("Claude prompt hooks are not supported for ConfigChange");
		expect(settings.warnings.join("\n")).toContain("Claude agent hooks are not supported for SessionStart");
	});
});
