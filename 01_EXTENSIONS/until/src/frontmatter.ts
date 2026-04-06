export function parseFrontmatter(
	content: string,
): { meta: Record<string, string>; body: string } {
	const cleaned = content.replace(/^\uFEFF/, "");
	const match = cleaned.match(
		/^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n([\s\S]*))?$/,
	);
	if (!match) return { meta: {}, body: cleaned.trim() };

	const meta: Record<string, string> = {};
	for (const line of match[1].split("\n")) {
		const idx = line.indexOf(":");
		if (idx === -1) continue;
		const key = line.slice(0, idx).trim();
		const value = line.slice(idx + 1).trim();
		if (key && value) meta[key] = value;
	}
	return { meta, body: (match[2] ?? "").trim() };
}
