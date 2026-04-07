import type { ToolPrefix } from "./types-config.js";
import type { ToolMetadata, DirectToolSpec } from "./types-tool.js";
import { applyPrefix, checkCollision } from "./tool-collision.js";

type WarnFn = (msg: string) => void;

function makeResourceName(
	serverName: string,
	resourceName: string,
	prefix: ToolPrefix,
): string {
	const getN = `get_${resourceName}`;
	return applyPrefix(serverName, getN, prefix);
}

function tryRegister(
	name: string,
	serverFallback: string,
	resourceName: string,
	prefix: ToolPrefix,
	registered: Set<string>,
	warn: WarnFn,
): string | null {
	const check = checkCollision(name, registered, warn);
	if (!check.collision) return name;
	if (prefix === "none") {
		const fallback = applyPrefix(
			serverFallback, `get_${resourceName}`, "server",
		);
		const recheck = checkCollision(fallback, registered, warn);
		if (!recheck.collision) return fallback;
	}
	return null;
}

export function buildResourceToolSpecs(
	resources: ToolMetadata[],
	prefix: ToolPrefix,
	exposeResources: boolean | undefined,
	registered: Set<string>,
	warn: WarnFn,
): DirectToolSpec[] {
	if (exposeResources === false) return [];
	const result: DirectToolSpec[] = [];
	for (const res of resources) {
		if (!res.resourceUri) continue;
		const name = makeResourceName(res.serverName, res.originalName, prefix);
		const resolved = tryRegister(
			name, res.serverName, res.originalName, prefix, registered, warn,
		);
		if (!resolved) continue;
		registered.add(resolved);
		result.push({
			serverName: res.serverName,
			originalName: res.originalName,
			prefixedName: resolved,
			description: res.description,
			resourceUri: res.resourceUri,
		});
	}
	return result;
}
