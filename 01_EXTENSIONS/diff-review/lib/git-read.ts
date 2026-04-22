import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReviewCommandApi } from "../src/types.js";

export async function runGitAllowFailure(pi: Pick<ReviewCommandApi, "exec">, cwd: string, args: string[]): Promise<string> {
	const result = await pi.exec("git", args, { cwd });
	return result.code === 0 ? result.stdout : "";
}

export async function runBashAllowFailure(pi: Pick<ReviewCommandApi, "exec">, cwd: string, script: string): Promise<string> {
	const result = await pi.exec("bash", ["-lc", script], { cwd });
	return result.code === 0 ? result.stdout : "";
}

export async function readWorkingTree(repoRoot: string, path: string | null): Promise<string> {
	if (!path) return "";
	return readFile(join(repoRoot, path), "utf8").catch(() => "");
}

export async function readRevision(pi: Pick<ReviewCommandApi, "exec">, repoRoot: string, revision: string | null, path: string | null): Promise<string> {
	return revision && path ? runGitAllowFailure(pi, repoRoot, ["show", `${revision}:${path}`]) : "";
}
