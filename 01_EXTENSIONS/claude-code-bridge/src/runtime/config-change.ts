import type { Ctx, PiBridge } from "../core/types.js";
import { buildClaudeInputBase } from "../hooks/tools.js";
import { runHandlers } from "./handlers.js";
import { appendWarning, getState, refreshState } from "./store.js";
import { classifyConfigSource } from "./watch-scan.js";

export async function handleConfigChanges(pi: PiBridge, ctx: Ctx, paths: string[]) {
	for (const path of paths) {
		const source = classifyConfigSource(path);
		if (!source) continue;
		const state = getState();
		if (state?.enabled) {
			const results = await runHandlers(pi, "ConfigChange", source, { ...buildClaudeInputBase(ctx, "ConfigChange"), source, file_path: path }, ctx);
			if (isBlocked(results)) {
				appendWarning(ctx, `[claude-bridge] Blocked Claude config change for ${path}`);
				continue;
			}
		}
		await refreshState(ctx);
	}
}

function isBlocked(results: Array<{ code: number; parsedJson?: any }>) {
	return results.some((result) => result.code === 2 || result.parsedJson?.decision === "block");
}
