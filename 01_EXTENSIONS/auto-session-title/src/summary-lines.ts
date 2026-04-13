const BULLET_PREFIX = /^(?:[-*•]+|\d+[.)])\s*/u;

function collapseWhitespace(text: string): string {
	return text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeSummaryLine(line: string): string {
	return line.replace(BULLET_PREFIX, "").trim();
}

export function extractSummaryLines(raw: string): string[] {
	const summary: string[] = [];
	let current: string[] = [];
	const flush = () => {
		const text = collapseWhitespace(current.join(" "));
		if (text) summary.push(text);
		current = [];
	};
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) {
			flush();
			continue;
		}
		if (BULLET_PREFIX.test(trimmed)) {
			flush();
			current = [normalizeSummaryLine(trimmed)];
			continue;
		}
		current.push(trimmed);
	}
	flush();
	return summary;
}
