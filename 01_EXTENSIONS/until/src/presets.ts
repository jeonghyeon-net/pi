import { readdir, readFile } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { UntilPreset } from "./types.js";
import { parseInterval } from "./interval.js";
import { parseFrontmatter } from "./frontmatter.js";

function tryLoadPreset(
	dir: string,
	file: string,
): [string, UntilPreset] | null {
	let raw: string | null;
	try {
		raw = readFileSync(join(dir, file), "utf-8");
	} catch {
		raw = null;
	}
	if (!raw) return null;

	const { meta, body } = parseFrontmatter(raw);
	if (!body) return null;

	const interval = parseInterval(meta.interval ?? "5m");
	if (!interval) return null;

	const key = file.slice(0, -3).toUpperCase();
	return [
		key,
		{
			defaultInterval: interval,
			description: meta.description ?? key,
			prompt: body,
		},
	];
}

export async function loadPresets(
	dir: string,
): Promise<Record<string, UntilPreset>> {
	const presets: Record<string, UntilPreset> = {};
	let files: string[];
	try {
		files = await readdir(dir);
	} catch {
		return presets;
	}
	for (const file of files) {
		if (!file.endsWith(".md")) continue;
		const result = tryLoadPreset(dir, file);
		if (result) presets[result[0]] = result[1];
	}
	return presets;
}

export function getPresetCompletions(
	dir: string,
	prefix: string,
): { value: string; label: string }[] | null {
	let files: string[];
	try {
		files = readdirSync(dir);
	} catch {
		return null;
	}
	const upper = prefix.toUpperCase();
	const items: { value: string; label: string }[] = [];
	for (const f of files) {
		if (!f.endsWith(".md")) continue;
		const result = tryLoadPreset(dir, f);
		if (!result) continue;
		const [key, preset] = result;
		if (!key.startsWith(upper)) continue;
		items.push({
			value: key,
			label: `${key} — ${preset.description} (${preset.defaultInterval.label})`,
		});
	}
	return items.length > 0 ? items : null;
}
