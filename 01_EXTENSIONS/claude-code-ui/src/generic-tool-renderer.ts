import type { Theme } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { branchBlock, inlineSuffix, summarizeArgs, summarizeTextPreview, toolLabel, toolPrefix } from "./tool-utils.js";

export type ResultDetails = {
	truncation?: { truncated?: boolean };
	totalResults?: number;
	successful?: number;
	urlCount?: number;
	totalChars?: number;
};

export type RenderContext = { state: { summary?: string }; invalidate: () => void; lastComponent?: object };
type ToolResult = { content?: Array<{ type?: string; text?: string }>; details?: ResultDetails };

function summarize(details?: ResultDetails) {
	if (typeof details?.totalResults === "number") return `${details.totalResults} sources`;
	if (typeof details?.successful === "number" && typeof details?.urlCount === "number") return `${details.successful}/${details.urlCount} URLs`;
	if (typeof details?.totalChars === "number") return `${details.totalChars} chars`;
}

function status(theme: Theme, isPartial: boolean, isError: boolean | undefined, details?: ResultDetails) {
	if (isPartial) return theme.fg("warning", "running…");
	if (isError) return theme.fg("error", "error");
	return theme.fg("success", summarize(details) ?? "done");
}

function outputOf(result: ToolResult) {
	return result.content?.filter((item) => item.type === "text" && !!item.text).map((item) => item.text).join("\n") ?? "";
}

function setSummary(context: RenderContext, summary: string) {
	if (context.state.summary === summary) return;
	context.state.summary = summary;
	context.invalidate();
}

export function createCallRenderer(name: string) {
	return (args: unknown, theme: Theme, context: RenderContext) => {
		const text = context.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0);
		const suffix = inlineSuffix(theme, context.state.summary);
		const preview = summarizeArgs(args);
		text.setText(`${toolPrefix(theme, toolLabel(name))}${preview ? ` ${theme.fg("muted", preview)}` : ""}${suffix}`);
		return text;
	};
}

export function createResultRenderer(isError: () => boolean | undefined) {
	return (result: ToolResult, options: { expanded: boolean; isPartial: boolean }, theme: Theme, context: RenderContext) => {
		const output = outputOf(result);
		setSummary(context, `${status(theme, options.isPartial, isError(), result.details)}${result.details?.truncation?.truncated ? theme.fg("dim", " · truncated") : ""}`);
		if (!options.expanded || !output.trim()) return context.lastComponent instanceof Container ? context.lastComponent : new Container();
		return new Text(branchBlock(theme, summarizeTextPreview(theme, output, 4)), 0, 0);
	};
}

export function renderCallFallback(name: string, args: unknown, summary: string | undefined, theme: Theme) {
	const preview = summarizeArgs(args);
	return new Text(`${toolPrefix(theme, toolLabel(name))}${preview ? ` ${theme.fg("muted", preview)}` : ""}${inlineSuffix(theme, summary)}`, 0, 0);
}

export function renderResultFallback(output: string, isPartial: boolean, isError: boolean | undefined, details: ResultDetails | undefined, expanded: boolean, theme: Theme) {
	const summary = `${status(theme, isPartial, isError, details)}${details?.truncation?.truncated ? theme.fg("dim", " · truncated") : ""}`;
	return { summary, component: !expanded || !output.trim() ? new Container() : new Text(branchBlock(theme, summarizeTextPreview(theme, output, 4)), 0, 0) };
}
