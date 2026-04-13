import type { AssistantMessage } from "@mariozechner/pi-ai";
import { normalizeTitle } from "./title.js";
import { normalizeOverviewSummary } from "./summary-normalize.js";
import { extractSummaryLines } from "./summary-text.js";
import type { SessionOverview } from "./overview-types.js";

export function parseOverviewResponse(response: string): SessionOverview | undefined {
	const lines = response.split(/\r?\n/);
	const titleLine = lines.find((line) => /^TITLE\s*:/i.test(line));
	const title = normalizeTitle(titleLine?.replace(/^TITLE\s*:/i, "").trim() ?? "");
	if (!title) return undefined;
	const summaryIndex = lines.findIndex((line) => /^SUMMARY\s*:/i.test(line));
	const inlineSummary = summaryIndex >= 0 ? lines[summaryIndex]!.replace(/^SUMMARY\s*:/i, "").trim() : "";
	const remainder = summaryIndex >= 0 ? lines.slice(summaryIndex + 1) : lines.filter((line) => !/^TITLE\s*:/i.test(line));
	const summary = extractSummaryLines([...(inlineSummary ? [inlineSummary] : []), ...remainder].join("\n"));
	if (summaryIndex < 0 && summary.length === 0) return undefined;
	return normalizeOverviewSummary({ title, summary });
}

export function extractAssistantText(message: AssistantMessage): string {
	return message.content.filter((part): part is { type: "text"; text: string } => part.type === "text").map((part) => part.text).join("\n").trim();
}
