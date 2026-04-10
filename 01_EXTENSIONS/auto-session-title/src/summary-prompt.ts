function formatPreviousSummary(summary: readonly string[]): string {
	return summary.length > 0 ? summary.join("\n\n") : "(none)";
}

export function buildOverviewPrompt(recentText: string, previous?: { title: string; summary: readonly string[] }): string {
	const previousSection = previous
		? [`Previous title: ${previous.title}`, "Previous summary (older versions may contain legacy line breaks; rewrite them into cohesive prose if needed):", formatPreviousSummary(previous.summary)].join("\n")
		: "Previous summary: (none)";
	return [
		"Update the previous summary into a cohesive current-state brief, not a turn-by-turn log.",
		"Preserve still-relevant goals, decisions, constraints, blockers, and completed work unless recent updates clearly replace them.",
		"Fold recent updates into the current state instead of listing events in order.",
		"Prefer one dense paragraph. Use multiple paragraphs only for clearly separate concerns.",
		previousSection,
		"",
		"Recent conversation updates below are raw chronological notes, not the desired output format:",
		recentText,
	].join("\n");
}
