import type { ExecFn, PullRequestStatus } from "./types.js";
import { normalizePullRequest, type GitHubPullRequest } from "./pr-normalize.js";

const GH_PR_FIELDS = "number,title,url,isDraft,reviewDecision,mergeable,mergeStateStatus";

export async function getPullRequestStatus(cwd: string, branch: string | null, exec: ExecFn): Promise<PullRequestStatus | null> {
	if (!branch) return null;
	const result = await exec("gh", ["pr", "list", "--head", branch, "--state", "open", "--json", GH_PR_FIELDS, "--limit", "1"], { cwd });
	if (result.code !== 0 || !result.stdout?.trim()) return null;
	const prs = parsePullRequestList(result.stdout);
	if (!prs) return null;
	return prs[0] ? normalizePullRequest(prs[0]) : { exists: false, merge: "no-pr" };
}

function parsePullRequestList(stdout: string): GitHubPullRequest[] | null {
	try {
		const parsed = JSON.parse(stdout);
		return Array.isArray(parsed) ? parsed : null;
	} catch {
		return null;
	}
}
