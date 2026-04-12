import { getAgentDir, withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DEFAULT_ENABLED } from "./constants.js";

interface PersistedConfig {
	enabled: boolean;
}

export function getConfigPath(baseDir: string = getAgentDir()): string {
	return join(baseDir, "extensions", "terse-mode.json");
}

export async function loadGlobalState(path: string = getConfigPath()): Promise<boolean> {
	if (!existsSync(path)) return DEFAULT_ENABLED;
	try {
		const parsed = JSON.parse(await readFile(path, "utf8"));
		return isPersistedConfig(parsed) ? parsed.enabled : DEFAULT_ENABLED;
	} catch {
		return DEFAULT_ENABLED;
	}
}

export async function saveGlobalState(enabled: boolean, path: string = getConfigPath()): Promise<void> {
	await withFileMutationQueue(path, async () => {
		await mkdir(dirname(path), { recursive: true });
		const data: PersistedConfig = { enabled };
		const tempPath = `${path}.tmp`;
		await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
		await rename(tempPath, path);
	});
}

function isPersistedConfig(value: unknown): value is PersistedConfig {
	if (!isRecord(value)) return false;
	return typeof value.enabled === "boolean";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
