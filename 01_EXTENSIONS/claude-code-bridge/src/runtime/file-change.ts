import { basename } from "node:path";
import type { Ctx, PiBridge, Scope } from "../core/types.js";
import { buildClaudeInputBase } from "../hooks/tools.js";
import { runHandlers } from "./handlers.js";
import { getState } from "./store.js";
import { getDynamicWatchPaths, setDynamicWatchPaths } from "./watch-store.js";
import { replaceDynamicWatchPaths } from "./watch-config.js";

export async function handleFileChanges(pi: PiBridge, ctx: Ctx, changes: Array<{ path: string; event: string }>) {
	const state = getState();
	if (!state?.enabled || (state.hooksByEvent.get("FileChanged") || []).length === 0) return;
	for (const change of changes) {
		const results = await runHandlers(pi, "FileChanged", basename(change.path), { ...buildClaudeInputBase(ctx, "FileChanged"), file_path: change.path, event: change.event }, ctx);
		applyDynamicWatchPaths(results, ctx.cwd);
	}
}

function applyDynamicWatchPaths(results: Array<{ code: number; stdout: string; stderr: string; parsedJson?: any; scope?: Scope }>, cwd: string) {
	const user = replaceDynamicWatchPaths(results.filter((item) => item.scope === "user"), cwd);
	const repo = replaceDynamicWatchPaths(results.filter((item) => item.scope !== "user"), cwd);
	if (user) setDynamicWatchPaths(user, "user");
	if (repo) setDynamicWatchPaths(repo, "repo");
}

export function currentWatchedPaths() {
	return getDynamicWatchPaths();
}
