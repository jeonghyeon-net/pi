export type ChangeStatus = "modified" | "added" | "deleted" | "renamed";
export type ReviewFileKind = "text" | "image" | "binary";

export interface ReviewFileComparison {
	status: ChangeStatus;
	oldPath: string | null;
	newPath: string | null;
	displayPath: string;
	hasOriginal: boolean;
	hasModified: boolean;
}

export interface ReviewFile {
	id: string;
	path: string;
	worktreeStatus: ChangeStatus | null;
	hasWorkingTreeFile: boolean;
	inGitDiff: boolean;
	gitDiff: ReviewFileComparison | null;
	kind: ReviewFileKind;
	mimeType: string | null;
}

export interface ReviewFileContents {
	originalContent: string;
	modifiedContent: string;
	kind: ReviewFileKind;
	mimeType: string | null;
	originalExists: boolean;
	modifiedExists: boolean;
	originalPreviewUrl: string | null;
	modifiedPreviewUrl: string | null;
}
