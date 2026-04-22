export function isReviewablePath(path: string): boolean {
	const lower = path.toLowerCase();
	return !lower.endsWith(".min.js") && !lower.endsWith(".min.css");
}
