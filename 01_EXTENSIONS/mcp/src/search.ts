function normalize(s: string): string {
	return s.toLowerCase().replace(/[-_]/g, "");
}

function tryRegex(pattern: string): RegExp | null {
	try {
		return new RegExp(pattern, "i");
	} catch {
		return null;
	}
}

export function matchTool(toolName: string, query: string): boolean {
	if (!query) return false;
	if (query.startsWith("/") && query.endsWith("/") && query.length > 2) {
		const re = tryRegex(query.slice(1, -1));
		if (re) return re.test(toolName);
		return false;
	}
	return normalize(toolName).includes(normalize(query));
}
