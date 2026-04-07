import { normalizePath, relativePosix } from "./pathing.js";

export function braceExpand(pattern: string): string[] {
	const match = pattern.match(/\{([^{}]+)\}/);
	if (!match) return [pattern];
	const start = match.index ?? 0;
	const before = pattern.slice(0, start);
	const after = pattern.slice(start + match[0].length);
	return match[1].split(",").flatMap((option) => braceExpand(`${before}${option}${after}`));
}

function escapeRegex(text: string): string {
	return text.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegex(glob: string): RegExp {
	let re = "^";
	for (let i = 0; i < glob.length; i++) {
		const char = glob[i];
		if (char === "*" && glob[i + 1] === "*") {
			re += glob[i + 2] === "/" ? "(?:.*/)?" : ".*";
			i += glob[i + 2] === "/" ? 2 : 1;
		} else if (char === "*") re += "[^/]*";
		else if (char === "?") re += ".";
		else re += escapeRegex(char);
	}
	return new RegExp(`${re}$`);
}

function matchesGlobs(value: string, globs: string[]): boolean {
	return globs.some((glob) => braceExpand(glob).some((item) => matchesGlobValue(item, value)));
}

function matchesGlobValue(glob: string, value: string): boolean {
	return hasGlobMeta(value) ? globsOverlap(glob, value) : globToRegex(glob).test(value);
}

function hasGlobMeta(value: string): boolean {
	return /[?*{[]/u.test(value);
}

function globsOverlap(left: string, right: string): boolean {
	if (left === right) return true;
	const a = globShape(left);
	const b = globShape(right);
	const sameTree = a.root === b.root || a.root.startsWith(`${b.root}/`) || b.root.startsWith(`${a.root}/`);
	return sameTree && (!a.ext || !b.ext || a.ext === b.ext);
}

function globShape(value: string) {
	const normalized = normalizePath(value);
	const root = normalized.split(/[?*{[]/u)[0].replace(/\/+$/u, "") || ".";
	const ext = normalized.match(/\.[A-Za-z0-9]+$/u)?.[0] || "";
	return { root, ext };
}

export function matchesAnyGlob(ownerRoot: string, targetPath: string, globs: string[]): boolean {
	const rel = relativePosix(ownerRoot, targetPath);
	if (!rel || rel.startsWith("..")) return false;
	return matchesGlobs(rel, globs);
}

export function matchesAbsoluteGlobs(targetPath: string, globs: string[]): boolean {
	return matchesGlobs(normalizePath(targetPath), globs.map(normalizePath));
}
