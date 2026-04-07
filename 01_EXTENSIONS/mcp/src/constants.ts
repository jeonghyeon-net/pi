export const METADATA_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const NPX_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
export const KEEPALIVE_INTERVAL_MS = 30 * 1000;
export const MAX_CONCURRENCY = 10;

export const BUILTIN_TOOL_NAMES = new Set([
	"read", "bash", "edit", "write", "grep", "find", "ls", "mcp",
]);

export const MCP_CONFIG_FLAG = {
	description: "Path to MCP config file",
	type: "string" as const,
};

export const DEFAULT_USER_CONFIG = "~/.pi/agent/mcp.json";
export const DEFAULT_PROJECT_CONFIG = ".pi/mcp.json";
export const CACHE_FILE_PATH = "~/.pi/agent/mcp-cache.json";
export const NPX_CACHE_FILE_PATH = "~/.pi/agent/mcp-npx-cache.json";
export const OAUTH_TOKEN_DIR = "~/.pi/agent/mcp-oauth";

export const STATUS_KEY = "mcp";
export const HASH_EXCLUDE_FIELDS = new Set(["lifecycle", "idleTimeout", "debug"]);
export const SERVER_NAME_SANITIZE_RE = /[\/\\.\x00-\x1f]/g;
