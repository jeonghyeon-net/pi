const PHRASES = ["Thinking", "Reasoning", "Planning", "Working"];

export function pickWorkingPhrase(random: () => number = Math.random) {
	const index = Math.min(PHRASES.length - 1, Math.floor(random() * PHRASES.length));
	return `${PHRASES[index] ?? "Working"}...`;
}

export function formatElapsed(elapsedMs: number) {
	const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
}

export function formatWorkingLine(parts: Array<string | undefined>) {
	return parts.filter(Boolean).join(" · ");
}
