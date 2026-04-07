import { ESCALATION_MARKER } from "./constants.js";
import { previewText } from "./format.js";
import type { ParsedEvent } from "./parser.js";
import type { UsageStats } from "./types.js";

export interface CollectedOutput {
	output: string;
	usage: UsageStats;
	escalation?: string;
	stopReason?: string;
	source: "message" | "agent_end" | "stream" | "empty";
	lastToolName?: string;
	lastToolText?: string;
}

export function collectOutput(events: ParsedEvent[]): CollectedOutput {
	const finalTexts: string[] = [];
	const streamedTexts: string[] = [];
	const usage: UsageStats = { inputTokens: 0, outputTokens: 0, turns: 0 };
	let agentEndText = "", stopReason: string | undefined, lastToolName: string | undefined, lastToolText: string | undefined;
	for (const evt of events) {
		if (evt.type === "message" && evt.text !== undefined) {
			finalTexts.push(evt.text);
			usage.inputTokens += evt.usage?.inputTokens ?? 0;
			usage.outputTokens += evt.usage?.outputTokens ?? 0;
			usage.turns += evt.usage?.turns ?? 0;
			stopReason = evt.stopReason ?? stopReason;
		}
		if (evt.type === "message_delta" && evt.text) streamedTexts.push(evt.text);
		if ((evt.type === "tool_update" || evt.type === "tool_end") && evt.toolName) {
			lastToolName = evt.toolName;
			lastToolText = evt.text || lastToolText;
		}
		if (evt.type === "agent_end") {
			agentEndText = evt.text || agentEndText;
			stopReason = evt.stopReason ?? stopReason;
			if (usage.turns === 0) Object.assign(usage, {
				inputTokens: usage.inputTokens + (evt.usage?.inputTokens ?? 0),
				outputTokens: usage.outputTokens + (evt.usage?.outputTokens ?? 0),
				turns: usage.turns + (evt.usage?.turns ?? 0),
			});
		}
	}
	const finalOutput = finalTexts.join("\n");
	const streamOutput = streamedTexts.join("");
	const output = finalOutput || agentEndText || streamOutput;
	const source = finalOutput ? "message" : agentEndText ? "agent_end" : streamOutput ? "stream" : "empty";
	const escalation = output.includes(ESCALATION_MARKER) ? output.split(ESCALATION_MARKER)[1]?.trim() : undefined;
	return { output, usage, escalation, stopReason, source, lastToolName, lastToolText };
}

export function buildMissingOutputDiagnostic(data: Pick<CollectedOutput, "stopReason" | "source" | "lastToolName" | "lastToolText"> & { stderr?: string; exitCode: number | null }): string {
	const lines = ["Subagent finished without a visible assistant response.", `- source: ${data.source}`];
	if (data.stopReason) lines.push(`- stop reason: ${data.stopReason}`);
	if (data.exitCode !== null) lines.push(`- exit code: ${data.exitCode}`);
	if (data.lastToolName) lines.push(`- last tool: ${data.lastToolName}`);
	if (data.lastToolText) lines.push(`- last tool output: ${previewText(data.lastToolText, 160)}`);
	if (data.stderr) lines.push(`- stderr: ${previewText(data.stderr, 160)}`);
	return lines.join("\n");
}
