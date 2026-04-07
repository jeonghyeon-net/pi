import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

export type Scope = "user" | "project" | "local";
export type HookKind = "command" | "http" | "prompt" | "agent";
export type ConfigSource = "user_settings" | "project_settings" | "local_settings" | "skills";
export type LoadReason = "session_start" | "path_glob_match" | "include" | "compact";
export type EventName =
	| "SessionStart"
	| "UserPromptSubmit"
	| "InstructionsLoaded"
	| "PreToolUse"
	| "PostToolUse"
	| "PostToolUseFailure"
	| "PreCompact"
	| "PostCompact"
	| "SessionEnd"
	| "Stop"
	| "SubagentStart"
	| "SubagentStop"
	| "ConfigChange"
	| "FileChanged";

export interface IncludeRef {
	path: string;
	parentPath: string;
}

export interface InstructionLoad {
	filePath: string;
	scope: Scope;
	loadReason: LoadReason;
	globs?: string[];
	triggerFilePath?: string;
	parentFilePath?: string;
}

export interface Block {
	id: string;
	path: string;
	scope: Scope;
	kind: "claude" | "rule";
	ownerRoot: string;
	content: string;
	conditionalGlobs: string[];
	includes: IncludeRef[];
}

export interface HookDef {
	eventName: EventName;
	type: HookKind;
	scope: Scope;
	sourcePath: string;
	matcher?: string;
	timeoutSeconds: number;
	command?: string;
	url?: string;
	prompt?: string;
	model?: string;
	headers?: Record<string, string>;
	allowedEnvVars?: string[];
	async: boolean;
}

export interface BridgeState {
	cwd: string;
	projectRoot: string;
	enabled: boolean;
	instructionFiles: string[];
	settingsFiles: string[];
	instructions: Block[];
	eagerLoads: InstructionLoad[];
	unconditionalPromptText: string;
	conditionalRules: Block[];
	activeConditionalRuleIds: Set<string>;
	hooksByEvent: Map<EventName, HookDef[]>;
	mergedEnv: Record<string, string>;
	httpHookAllowedEnvVars?: string[];
	allowedHttpHookUrls?: string[];
	claudeMdExcludes?: string[];
	fileWatchBasenames: string[];
	disableAllHooks: boolean;
	hasRepoScopedHooks: boolean;
	envFilePath?: string;
	warnings: string[];
}

export interface HookRunResult {
	code: number;
	stdout: string;
	stderr: string;
	parsedJson?: any;
	scope?: Scope;
}

export interface PiBridge { sendMessage(message: any, options?: any): unknown; sendUserMessage(message: string): unknown; }

export type Ctx = ExtensionContext;
