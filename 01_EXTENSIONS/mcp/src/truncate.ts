export function truncateAtWord(text: string, target: number): string {
	if (text.length <= target) return text;
	const lastSpace = text.lastIndexOf(" ", target);
	if (lastSpace > target * 0.6) return `${text.slice(0, lastSpace)}...`;
	return `${text.slice(0, target)}...`;
}
