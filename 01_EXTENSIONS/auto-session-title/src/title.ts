export const DEFAULT_MAX_TITLE_LENGTH = 48;

function collapseWhitespace(text: string): string {
	return text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function stripMarkdownNoise(text: string): string {
	return text.replace(/```[\s\S]*?```/g, " ").replace(/`+/g, " ");
}

function stripListPrefix(text: string): string {
	return text.replace(/^(?:[#>*-]+|\d+[.)])\s+/, "");
}

function stripWrappingPunctuation(text: string): string {
	return text.replace(/^["'`“”‘’([{]+/, "").replace(/["'`“”‘’)}\].,!?;:]+$/u, "").trim();
}

export function truncateTitle(text: string, maxLength: number = DEFAULT_MAX_TITLE_LENGTH): string {
	if (text.length <= maxLength) return text;
	const clipped = text.slice(0, maxLength + 1);
	const lastWordBreak = Math.max(clipped.lastIndexOf(" "), clipped.lastIndexOf(":"), clipped.lastIndexOf("-"), clipped.lastIndexOf("—"), clipped.lastIndexOf(","));
	const cutoff = lastWordBreak >= Math.floor(maxLength * 0.6) ? lastWordBreak : maxLength;
	return `${clipped.slice(0, cutoff).trimEnd()}…`;
}

export function normalizeTitle(text: string, maxLength: number = DEFAULT_MAX_TITLE_LENGTH): string | undefined {
	const cleaned = collapseWhitespace(stripListPrefix(stripMarkdownNoise(text)));
	if (!cleaned) return undefined;
	const title = truncateTitle(stripWrappingPunctuation(cleaned), maxLength).trim();
	return title || undefined;
}
