import type { ToolPrefix } from "./types-config.js";
import type { ToolMetadata, DirectToolSpec } from "./types-tool.js";
import { applyPrefix, checkCollision } from "./tool-collision.js";

type WarnFn = (msg: string) => void;

function shouldPromote(
	tool: ToolMetadata,
	directTools: true | string[],
): boolean {
	if (directTools === true) return true;
	return directTools.includes(tool.originalName);
}

function resolveOneTool(
	tool: ToolMetadata,
	prefix: ToolPrefix,
	registered: Set<string>,
	warn: WarnFn,
): DirectToolSpec | null {
	let prefixed = applyPrefix(tool.serverName, tool.originalName, prefix);
	const check = checkCollision(prefixed, registered, warn);
	if (check.collision) {
		if (prefix !== "none") return null;
		prefixed = applyPrefix(tool.serverName, tool.originalName, "server");
		const recheck = checkCollision(prefixed, registered, warn);
		if (recheck.collision) return null;
	}
	return {
		serverName: tool.serverName,
		originalName: tool.originalName,
		prefixedName: prefixed,
		description: tool.description,
		inputSchema: tool.inputSchema,
		resourceUri: tool.resourceUri,
	};
}

export function resolveDirectTools(
	tools: ToolMetadata[],
	directTools: boolean | string[],
	prefix: ToolPrefix,
	registered: Set<string>,
	warn: WarnFn,
): DirectToolSpec[] {
	if (directTools === false) return [];
	const result: DirectToolSpec[] = [];
	for (const tool of tools) {
		if (!shouldPromote(tool, directTools)) continue;
		const spec = resolveOneTool(tool, prefix, registered, warn);
		if (spec) {
			registered.add(spec.prefixedName);
			result.push(spec);
		}
	}
	return result;
}

export function parseDirectToolsEnv(
	envVal: string | undefined,
): false | Map<string, boolean | string[]> | undefined {
	if (!envVal || envVal.trim() === "") return undefined;
	if (envVal === "__none__") return false;
	const map = new Map<string, boolean | string[]>();
	for (const part of envVal.split(",")) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		const slashIdx = trimmed.indexOf("/");
		if (slashIdx === -1) {
			map.set(trimmed, true);
		} else {
			const server = trimmed.slice(0, slashIdx);
			const tool = trimmed.slice(slashIdx + 1);
			const existing = map.get(server);
			if (Array.isArray(existing)) {
				existing.push(tool);
			} else {
				map.set(server, [tool]);
			}
		}
	}
	return map;
}
