import { defineTool, createEditToolDefinition, type AgentToolResult, type EditToolDetails, type EditToolInput, type Theme } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { branchBlock, inlineSuffix, toolPrefix } from "./tool-utils.js";

type EditResult = AgentToolResult<EditToolDetails | undefined>;
type RenderOptions = { expanded: boolean; isPartial: boolean };
type RenderState = { summary?: string };

function setSummary(context: { state: RenderState; invalidate: () => void }, summary: string) {
	if (context.state.summary === summary) return;
	context.state.summary = summary;
	context.invalidate();
}

export function renderDiffLine(theme: Theme, line: string) {
	if (line.startsWith("+") && !line.startsWith("+++")) return theme.fg("toolDiffAdded", line);
	if (line.startsWith("-") && !line.startsWith("---")) return theme.fg("toolDiffRemoved", line);
	return theme.fg("toolDiffContext", line);
}

export function createClaudeEditTool(cwd: string) {
	const base = createEditToolDefinition(cwd);
	return defineTool({
		...base,
		renderShell: "self",
		renderCall(args: EditToolInput, theme: Theme, context) {
			const text = context.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0);
			text.setText(`${toolPrefix(theme, "Edit")} ${theme.fg("muted", args.path)}${inlineSuffix(theme, context.state.summary)}`);
			return text;
		},
		renderResult(result: EditResult, { expanded, isPartial }: RenderOptions, theme: Theme, context) {
			const content = result.content[0];
			const diffLines = result.details?.diff?.split("\n") ?? [];
			const additions = diffLines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
			const removals = diffLines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
			const summary = isPartial ? theme.fg("warning", "editing…") : content?.type === "text" && content.text.startsWith("Error") ? theme.fg("error", content.text.split("\n")[0]) : result.details?.diff ? `${theme.fg("success", `+${additions}`)}${theme.fg("dim", " · ")}${theme.fg("error", `-${removals}`)}` : theme.fg("success", "applied");
			setSummary(context, summary);
			if (!expanded || !result.details?.diff) return context.lastComponent instanceof Container ? context.lastComponent : new Container();
			const preview = diffLines.slice(0, 24).map((line) => renderDiffLine(theme, line));
			if (diffLines.length > 24) preview.push(theme.fg("dim", `… ${diffLines.length - 24} more diff lines`));
			return new Text(branchBlock(theme, preview.join("\n")), 0, 0);
		},
	});
}
