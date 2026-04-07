import { accessSync, constants, existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function fileExists(path: string): boolean {
	try {
		accessSync(path, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

export function readText(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

export function readJson(path: string): any | undefined {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return undefined;
	}
}

export function resolveRealPath(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}

export function listMarkdownFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const out: string[] = [];
	const walk = (current: string) => {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const next = join(current, entry.name);
			if (entry.isDirectory()) walk(next);
			else if (entry.isFile() && entry.name.endsWith(".md")) out.push(next);
		}
	};
	walk(dir);
	return out.sort();
}

export function walkAncestors(start: string): string[] {
	const out: string[] = [];
	let current = resolve(start);
	while (true) {
		out.push(current);
		const parent = dirname(current);
		if (parent === current) return out.reverse();
		current = parent;
	}
}
