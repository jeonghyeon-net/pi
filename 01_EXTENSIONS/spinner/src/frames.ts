const GHOSTTY = ["·", "✢", "✳", "✶", "✻", "*"];
const DARWIN = ["·", "✢", "✳", "✶", "✻", "✽"];
const OTHER = ["·", "✢", "*", "✶", "✻", "✽"];

export const SPINNER_INTERVAL_MS = 120;

export function getSpinnerFrames(term = process.env.TERM, platform = process.platform) {
	const chars = term === "xterm-ghostty" ? GHOSTTY : platform === "darwin" ? DARWIN : OTHER;
	return [...chars, ...[...chars].reverse()];
}
