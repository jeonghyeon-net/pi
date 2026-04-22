export type ReviewCommitKind = "commit" | "working-tree";

export interface ReviewCommitInfo {
	sha: string;
	shortSha: string;
	subject: string;
	authorName: string;
	authorDate: string;
	kind: ReviewCommitKind;
}
