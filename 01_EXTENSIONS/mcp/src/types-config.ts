export type LifecycleMode = "lazy" | "eager" | "keep-alive";
export type ImportKind = "cursor" | "claude-code" | "claude-desktop" | "codex" | "windsurf" | "vscode";
export type ToolPrefix = "server" | "short" | "none";
export type ConsentMode = "never" | "once-per-server" | "always";

export interface ServerEntry {
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
	url?: string;
	headers?: Record<string, string>;
	auth?: "oauth" | "bearer";
	bearerToken?: string;
	bearerTokenEnv?: string;
	lifecycle?: LifecycleMode;
	idleTimeout?: number;
	directTools?: boolean | string[];
	exposeResources?: boolean;
	debug?: boolean;
}

export interface McpSettings {
	toolPrefix?: ToolPrefix;
	idleTimeout?: number;
	directTools?: boolean;
	consent?: ConsentMode;
}

export interface McpConfig {
	mcpServers: Record<string, ServerEntry>;
	imports?: ImportKind[];
	settings?: McpSettings;
}

export interface ServerProvenance {
	path: string;
	kind: "user" | "project" | "import";
	importKind?: ImportKind;
}
