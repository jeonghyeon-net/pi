import { isReviewablePath } from "./git-filter.js";
import type { ChangeStatus, ReviewFileComparison } from "../src/types.js";

export interface ChangedPath {
	status: ChangeStatus;
	oldPath: string | null;
	newPath: string | null;
	displayPath: string;
}

function toStatus(code: string): ChangeStatus | null {
	if (code === "M") return "modified";
	if (code === "A") return "added";
	if (code === "D") return "deleted";
	if (code === "R") return "renamed";
	return null;
}

export function parseChangedPaths(output: string): ChangedPath[] {
	return output.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).flatMap((line) => {
		const [rawCode, first, second] = line.split("\t");
		const status = toStatus((rawCode ?? "")[0] ?? "");
		const oldPath = status === "added" ? null : first ?? null;
		const newPath = status === "deleted" ? null : status === "renamed" ? second ?? null : first ?? null;
		const path = newPath ?? oldPath ?? "";
		if (!status || !path || !isReviewablePath(path)) return [];
		const displayPath = status === "renamed" ? `${oldPath ?? ""} -> ${newPath ?? ""}` : path;
		return [{ status, oldPath, newPath, displayPath } satisfies ChangedPath];
	}).sort((a, b) => a.displayPath.localeCompare(b.displayPath));
}

export function toComparison(change: ChangedPath): ReviewFileComparison {
	return { ...change, hasOriginal: change.oldPath != null, hasModified: change.newPath != null };
}
