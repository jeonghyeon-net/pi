import { ensureEnvFile } from "./env.js";
import { collectInstructions } from "./instructions.js";
import { collectSettings } from "./settings.js";
import { findProjectRoot } from "../core/instructions.js";
import { extractFileWatchBasenames } from "../runtime/watch-config.js";
import type { BridgeState } from "../core/types.js";

export async function loadState(cwd: string): Promise<BridgeState> {
	const settings = collectSettings(cwd);
	const projectRoot = findProjectRoot(cwd);
	const instructionState = collectInstructions(cwd, settings.claudeMdExcludes);
	const enabled = instructionState.instructions.length > 0 || settings.hooksByEvent.size > 0 || Object.keys(settings.mergedEnv).length > 0;
	return {
		cwd,
		projectRoot,
		enabled,
		instructionFiles: instructionState.instructionFiles,
		settingsFiles: settings.settingsFiles,
		instructions: instructionState.instructions,
		eagerLoads: instructionState.eagerLoads,
		unconditionalPromptText: instructionState.unconditionalPromptText,
		conditionalRules: instructionState.conditionalRules,
		activeConditionalRuleIds: new Set<string>(),
		hooksByEvent: settings.hooksByEvent,
		mergedEnv: settings.mergedEnv,
		httpHookAllowedEnvVars: settings.httpHookAllowedEnvVars,
		allowedHttpHookUrls: settings.allowedHttpHookUrls,
		claudeMdExcludes: settings.claudeMdExcludes,
		fileWatchBasenames: extractFileWatchBasenames(settings.hooksByEvent.get("FileChanged") || []),
		disableAllHooks: settings.disableAllHooks,
		hasRepoScopedHooks: Array.from(settings.hooksByEvent.values()).some((items) => items.some((item) => item.scope !== "user")),
		envFilePath: enabled ? await ensureEnvFile(projectRoot) : undefined,
		warnings: settings.warnings,
	};
}
