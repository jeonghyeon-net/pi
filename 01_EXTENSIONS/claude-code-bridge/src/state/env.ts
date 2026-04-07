import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha } from "../core/pathing.js";

export async function ensureEnvFile(projectRoot: string): Promise<string> {
	const dir = join(tmpdir(), "pi-claude-code-bridge", sha(projectRoot));
	await mkdir(dir, { recursive: true });
	const path = join(dir, "claude-env.sh");
	if (!existsSync(path)) await writeFile(path, "", "utf8");
	return path;
}

export function mergeStringArrays(base: string[] | undefined, next: string[] | undefined) {
	if (!base && !next) return undefined;
	return [...new Set([...(base || []), ...(next || [])])];
}
