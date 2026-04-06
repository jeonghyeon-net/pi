import { NPX_CACHE_TTL_MS } from "./constants.js";

export type ExecSync = (cmd: string, opts?: { timeout?: number }) => string;

export interface NpxCacheOps {
	get(key: string): { path: string; at: number } | undefined;
	set(key: string, value: { path: string; at: number }): void;
}

interface ResolvedCommand {
	command: string;
	args: string[];
}

const NPX_FLAGS = new Set(["-y", "--yes", "-p", "--package"]);

function parseNpxArgs(args: string[]): { pkg: string; rest: string[] } | null {
	let i = 0;
	if (args[0] === "exec") { i = 1; if (args[i] === "--") i++; }
	while (i < args.length && NPX_FLAGS.has(args[i])) {
		i++;
		if (args[i - 1] === "-p" || args[i - 1] === "--package") i++;
	}
	if (i >= args.length) return null;
	return { pkg: args[i], rest: args.slice(i + 1) };
}

function lookupBinary(pkg: string, exec: ExecSync): string | null {
	try {
		return exec(`which ${pkg.split("/").pop()}`, { timeout: 5000 }).trim() || null;
	} catch {
		return null;
	}
}

export function resolveNpxCommand(
	command: string,
	args: string[],
	exec: ExecSync,
	cache: NpxCacheOps,
	now: number,
): ResolvedCommand {
	if (command !== "npx" && command !== "npm") return { command, args };
	const parsed = parseNpxArgs(args);
	if (!parsed) return { command, args };
	const cached = cache.get(parsed.pkg);
	if (cached && now - cached.at < NPX_CACHE_TTL_MS) {
		return { command: cached.path, args: parsed.rest };
	}
	const resolved = lookupBinary(parsed.pkg, exec);
	if (!resolved) return { command, args };
	cache.set(parsed.pkg, { path: resolved, at: now });
	return { command: resolved, args: parsed.rest };
}
