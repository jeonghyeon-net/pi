function formatPreviousSummary(summary: readonly string[]): string {
	return summary.length > 0 ? summary.join("\n\n") : "(none)";
}

function buildCompactionNote(previous?: { summary: readonly string[] }): string {
	const length = previous?.summary.join("\n\n").length ?? 0;
	return length > 700
		? `The stored summary is already ${length} characters long. Compact it noticeably while preserving only durable context.`
		: "Keep the summary compact enough to scan quickly, and compress older context instead of appending more prose each turn.";
}

export function buildOverviewPrompt(recentText: string, previous?: { title: string; summary: readonly string[] }): string {
	const previousSection = previous
		? [`Previous title: ${previous.title}`, "Previous summary (older versions may contain legacy line breaks; rewrite them into clean scan-friendly bullets if needed):", formatPreviousSummary(previous.summary)].join("\n")
		: "Previous summary: (none)";
	return [
		"Update the previous summary into a cohesive current-state brief, not a turn-by-turn log.",
		"Write it for quick future recall by the user, so prioritize what they would want to remember when resuming later.",
		"Preserve still-relevant goals, decisions, constraints, blockers, and completed work unless recent updates clearly replace them.",
		"Fold recent updates into the current state instead of listing events in order.",
		"Ignore routine greetings, acknowledgements, current-branch checks, shell state, raw tool chatter, toy/demo exchanges, and the fact that the assistant replied unless they materially changed the task.",
		"If the recent updates contain no durable change, keep the previous title and summary unchanged.",
		"Write SUMMARY as 2-5 short `- ` bullets when durable state exists. One bullet per durable point.",
		"Make the user's current request or goal obvious, but do not restate the same point in both TITLE and the first bullet.",
		"Keep bullets scan-friendly: prioritize current goal, finished work, constraints, blockers, or next important step. Do not collapse everything into one long paragraph.",
		"If there is still no durable task or state yet, do not invent one; leave SUMMARY blank.",
		buildCompactionNote(previous),
		previousSection,
		"",
		"Recent conversation updates below are raw chronological notes, not the desired output format:",
		recentText,
	].join("\n");
}
