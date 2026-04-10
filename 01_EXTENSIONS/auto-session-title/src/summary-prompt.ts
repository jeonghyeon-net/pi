export function buildOverviewPrompt(recentText: string, previous?: { title: string; summary: readonly string[] }): string {
	const previousSection = previous ? [`Previous title: ${previous.title}`, "Previous summary:", ...previous.summary].join("\n") : "Previous summary: (none)";
	return [
		"Update the previous summary instead of rewriting from scratch.",
		"Preserve still-relevant goals, decisions, constraints, and blockers unless the recent updates clearly replace them.",
		previousSection,
		"",
		"Recent conversation updates:",
		recentText,
	].join("\n");
}
