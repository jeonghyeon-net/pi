import { createHash } from "node:crypto";
import type { McpConfig, ServerEntry } from "./types-config.js";
import { HASH_EXCLUDE_FIELDS } from "./constants.js";

function stripExcluded(entry: ServerEntry): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(entry)) {
		if (!HASH_EXCLUDE_FIELDS.has(key)) {
			result[key] = value;
		}
	}
	return result;
}

function stableStringify(config: McpConfig): string {
	const sorted: Record<string, Record<string, unknown>> = {};
	for (const name of Object.keys(config.mcpServers).sort()) {
		sorted[name] = stripExcluded(config.mcpServers[name]);
	}
	return JSON.stringify(sorted);
}

export function computeConfigHash(config: McpConfig): string {
	return createHash("sha256").update(stableStringify(config)).digest("hex");
}
