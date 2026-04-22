import { defineTool, createReadToolDefinition, type AgentToolResult, type ReadToolDetails, type ReadToolInput, type Theme } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { branchBlock, inlineSuffix, summarizeTextPreview, toolPrefix } from "./tool-utils.js";

type ReadResult = AgentToolResult<ReadToolDetails | undefined>;
type RenderOptions = { expanded: boolean; isPartial: boolean };
type RenderState = { summary?: string };

function setSummary(context: { state: RenderState; invalidate: () => void }, summary: string) {
	if (context.state.summary === summary) return;
	context.state.summary = summary;
	context.invalidate();
}

export function createClaudeReadTool(cwd: string) {
	const base = createReadToolDefinition(cwd);
	return defineTool({
		...base,
		renderShell: "self",
		renderCall(args: ReadToolInput, theme: Theme, context) {
			const text = context.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0);
			text.setText(`${toolPrefix(theme, "Read")} ${theme.fg("muted", args.path)}${inlineSuffix(theme, context.state.summary)}`);
			return text;
		},
		renderResult(result: ReadResult, { expanded, isPartial }: RenderOptions, theme: Theme, context) {
			const content = result.content[0];
			const summary = isPartial ? theme.fg("warning", "reading…") : content?.type !== "text" ? theme.fg("success", "loaded") : `${theme.fg("success", `${content.text.split("\n").length} lines`)}${result.details?.truncation?.truncated ? theme.fg("dim", ` · truncated from ${result.details.truncation.totalLines}`) : ""}`;
			setSummary(context, summary);
			if (!expanded || content?.type !== "text") return context.lastComponent instanceof Container ? context.lastComponent : new Container();
			return new Text(branchBlock(theme, summarizeTextPreview(theme, content.text, 14)), 0, 0);
		},
	});
}
