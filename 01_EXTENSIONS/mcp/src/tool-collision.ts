import type { ToolPrefix } from "./types-config.js";
import { BUILTIN_TOOL_NAMES } from "./constants.js";

export interface CollisionResult {
	collision: boolean;
	reason?: "builtin" | "duplicate";
}

type WarnFn = (msg: string) => void;

export function applyPrefix(
	serverName: string,
	toolName: string,
	strategy: ToolPrefix,
): string {
	switch (strategy) {
		case "server":
			return `${serverName}_${toolName}`;
		case "short":
			return `${serverName.slice(0, 2)}_${toolName}`;
		case "none":
			return toolName;
	}
}

export function checkCollision(
	name: string,
	registered: Set<string>,
	warn: WarnFn,
): CollisionResult {
	if (BUILTIN_TOOL_NAMES.has(name)) {
		warn(`Skipping tool "${name}": conflicts with builtin tool`);
		return { collision: true, reason: "builtin" };
	}
	if (registered.has(name)) {
		warn(`Tool "${name}" already registered by another server`);
		return { collision: true, reason: "duplicate" };
	}
	return { collision: false };
}
