function shellQuote(value: string): string {
	return `'${value.replace(/'/gu, `'\\''`)}'`;
}

export function quotePath(path: string | null): string {
	return path ? ` -- ${shellQuote(path)}` : " --";
}

export function snapshotNameStatusScript(base: string | null): string {
	return [
		"set -euo pipefail",
		'tmp=$(mktemp "/tmp/pi-diff-review-index.XXXXXX")',
		"trap 'rm -f \"$tmp\"' EXIT",
		'export GIT_INDEX_FILE="$tmp"',
		...(base ? [`git read-tree ${shellQuote(base)}`] : ["rm -f \"$tmp\""]),
		"git add -A -- .",
		base ? `git diff --cached --find-renames -M --name-status ${shellQuote(base)} --` : "git diff --cached --find-renames -M --name-status --root --",
	].join("\n");
}

export function snapshotDiffScript(base: string | null, path: string | null): string {
	return [snapshotNameStatusScript(base).replace(/\ngit diff[^\n]+$/u, ""), base ? `git diff --cached --find-renames -M ${shellQuote(base)}${quotePath(path)}` : `git diff --cached --find-renames -M --root${quotePath(path)}`].join("\n");
}
