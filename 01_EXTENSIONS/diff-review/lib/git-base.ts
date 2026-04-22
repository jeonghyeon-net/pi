import { runGitAllowFailure } from "./git-read.js";
import type { ReviewCommandApi } from "../src/types.js";

async function currentBranch(pi: Pick<ReviewCommandApi, "exec">, cwd: string): Promise<string> {
	return (await runGitAllowFailure(pi, cwd, ["branch", "--show-current"])).trim() || "HEAD";
}

export async function getRepoRoot(pi: Pick<ReviewCommandApi, "exec">, cwd: string): Promise<string> {
	const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd });
	if (result.code !== 0) throw new Error("Not inside a git repository.");
	return result.stdout.trim();
}

export async function hasHead(pi: Pick<ReviewCommandApi, "exec">, cwd: string): Promise<boolean> {
	return (await pi.exec("git", ["rev-parse", "--verify", "HEAD"], { cwd })).code === 0;
}

export async function getCommitParent(pi: Pick<ReviewCommandApi, "exec">, cwd: string, sha: string): Promise<string | null> {
	return (await runGitAllowFailure(pi, cwd, ["rev-parse", `${sha}^`])).trim() || null;
}

export async function findReviewBase(pi: Pick<ReviewCommandApi, "exec">, cwd: string): Promise<{ baseRef: string; mergeBase: string } | null> {
	const branch = await currentBranch(pi, cwd);
	const upstream = (await runGitAllowFailure(pi, cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])).trim();
	const originHead = (await runGitAllowFailure(pi, cwd, ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"])).trim();
	for (const candidate of new Set([upstream, originHead, "origin/main", "origin/master", "origin/develop", "main", "master", "develop"].filter(Boolean))) {
		if (candidate === branch || candidate.endsWith(`/${branch}`)) continue;
		const mergeBase = (await runGitAllowFailure(pi, cwd, ["merge-base", "HEAD", candidate])).trim();
		if (mergeBase) return { baseRef: candidate, mergeBase };
	}
	return null;
}

export async function listCommits(pi: Pick<ReviewCommandApi, "exec">, cwd: string, range: string): Promise<string> {
	return runGitAllowFailure(pi, cwd, ["log", "-100", "--format=%H%x1f%h%x1f%s%x1f%an%x1f%aI", range]);
}
