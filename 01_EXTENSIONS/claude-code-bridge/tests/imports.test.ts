import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expandImports, loadState } from "../src/test-api.js";

const originalHome = process.env.HOME;
const makeTempTree = () => mkdtemp(join(tmpdir(), "claude-code-bridge-test-"));

afterEach(() => {
	if (originalHome === undefined) delete process.env.HOME;
	else process.env.HOME = originalHome;
	vi.restoreAllMocks();
});

describe("claude bridge imports and state", () => {
	it("blocks project imports that escape the repo root", async () => {
		const root = await makeTempTree();
		const repo = join(root, "repo");
		const claudeFile = join(repo, "CLAUDE.md");
		await mkdir(repo, { recursive: true });
		await writeFile(join(root, "secret.txt"), "TOP_SECRET", "utf8");
		await writeFile(claudeFile, "@../secret.txt", "utf8");
		const expanded = expandImports("@../secret.txt", claudeFile, "project", repo);
		expect(expanded).toContain("Blocked import outside allowed root");
		expect(expanded).not.toContain("TOP_SECRET");
	});

	it("blocks symlink imports that resolve outside the repo root", async () => {
		const root = await makeTempTree();
		const repo = join(root, "repo");
		await mkdir(join(repo, "docs"), { recursive: true });
		await writeFile(join(root, "secret.txt"), "TOP_SECRET", "utf8");
		await symlink(join(root, "secret.txt"), join(repo, "docs", "leak.md"));
		const expanded = expandImports("@docs/leak.md", join(repo, "CLAUDE.md"), "project", repo);
		expect(expanded).toContain("Blocked import outside allowed root");
	});

	it("tracks imported files for observability and allows repo-local imports", async () => {
		const root = await makeTempTree();
		const home = join(root, "home");
		const repo = join(root, "repo");
		const imported = join(repo, "docs", "extra.md");
		const claudeFile = join(repo, "packages", "app", "CLAUDE.md");
		process.env.HOME = home;
		await mkdir(join(home, ".claude"), { recursive: true });
		await mkdir(join(repo, ".git"), { recursive: true });
		await mkdir(join(repo, "docs"), { recursive: true });
		await mkdir(join(repo, "packages", "app"), { recursive: true });
		await writeFile(imported, "Extra guidance", "utf8");
		await writeFile(claudeFile, "@../../docs/extra.md", "utf8");
		const state = await loadState(join(repo, "packages", "app"));
		expect(state.projectRoot).toBe(repo);
		expect(state.unconditionalPromptText).toContain("Extra guidance");
		expect(state.eagerLoads.some((item) => item.parentFilePath === claudeFile)).toBe(true);
	});

	it("loads Claude state while ignoring project env and project http allowlists", async () => {
		const root = await makeTempTree();
		const home = join(root, "home");
		const repo = join(root, "repo");
		process.env.HOME = home;
		await mkdir(join(home, ".claude"), { recursive: true });
		await mkdir(join(repo, ".claude"), { recursive: true });
		await writeFile(join(home, ".claude", "CLAUDE.md"), "User instructions", "utf8");
		await writeFile(join(home, ".claude", "settings.json"), JSON.stringify({ env: { USER_ONLY: "yes" }, httpHookAllowedEnvVars: ["USER_TOKEN"] }), "utf8");
		await writeFile(join(repo, ".claude", "CLAUDE.md"), "Project instructions", "utf8");
		await writeFile(join(repo, ".claude", "settings.json"), JSON.stringify({ env: { PROJECT_BAD: "nope" }, httpHookAllowedEnvVars: ["SHOULD_IGNORE"] }), "utf8");
		const state = await loadState(repo);
		expect(state.enabled).toBe(true);
		expect(state.projectRoot).toBe(repo);
		expect(state.mergedEnv).toEqual({ USER_ONLY: "yes" });
		expect(state.httpHookAllowedEnvVars).toEqual(["USER_TOKEN"]);
		expect(state.unconditionalPromptText).toContain("User instructions");
		expect(state.unconditionalPromptText).toContain("Project instructions");
		expect(state.warnings.join("\n")).toContain("Ignoring project/local Claude env");
		expect(state.warnings.join("\n")).toContain("Ignoring project/local httpHookAllowedEnvVars");
	});
});
