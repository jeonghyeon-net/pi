export interface Entry {
	type: string;
	message?: { role: string; content: Array<{ type: string; text?: string }> };
	summary?: string;
}

function extractText(entry: Entry): string {
	if (!entry.message?.content) return "";
	return entry.message.content
		.filter((c) => c.type === "text")
		.map((c) => c.text ?? "")
		.join("\n");
}

export function extractMainContext(
	entries: Entry[],
	maxMessages: number,
): string {
	const typed = entries;
	const parts: string[] = [];
	const compaction = typed.find((e) => e.type === "compaction");
	if (compaction?.summary) parts.push(`[Context Summary]\n${compaction.summary}`);

	const messages = typed.filter((e) => e.type === "message" && e.message);
	const recent = messages.slice(-maxMessages);
	for (const entry of recent) {
		const role = entry.message?.role ?? "unknown";
		const text = extractText(entry);
		if (text) parts.push(`[${role}] ${text}`);
	}
	return parts.join("\n\n");
}
