export function buildOverviewPrompt(recentText: string, previous?: { title: string; summary: readonly string[] }): string {
	const previousSection = previous ? [`Previous title: ${previous.title}`, "Previous summary:", ...previous.summary].join("\n") : "Previous summary: (none)";
	return [
		"Update the previous summary instead of rewriting from scratch.",
		"Preserve still-relevant goals, decisions, constraints, blockers, and completed work unless recent updates clearly replace them.",
		"Do not artificially limit the number of summary lines if more context is still relevant.",
		previousSection,
		"",
		"Recent conversation updates:",
		recentText,
	].join("\n");
}
