import { defineTool, createWriteToolDefinition, type AgentToolResult, type Theme, type WriteToolInput } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { inlineSuffix, toolPrefix } from "./tool-utils.js";

type WriteResult = AgentToolResult<undefined>;
type RenderOptions = { isPartial: boolean };
type RenderState = { summary?: string };

function setSummary(context: { state: RenderState; invalidate: () => void }, summary: string) {
	if (context.state.summary === summary) return;
	context.state.summary = summary;
	context.invalidate();
}

export function createClaudeWriteTool(cwd: string) {
	const base = createWriteToolDefinition(cwd);
	return defineTool({
		...base,
		renderShell: "self",
		renderCall(args: WriteToolInput, theme: Theme, context) {
			const suffix = theme.fg("dim", ` · ${args.content.split("\n").length} lines`);
			const text = context.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0);
			text.setText(`${toolPrefix(theme, "Write")} ${theme.fg("muted", args.path)}${suffix}${inlineSuffix(theme, context.state.summary)}`);
			return text;
		},
		renderResult(result: WriteResult, { isPartial }: RenderOptions, theme: Theme, context) {
			const content = result.content[0];
			const summary = isPartial ? theme.fg("warning", "writing…") : content?.type === "text" && content.text.startsWith("Error") ? theme.fg("error", content.text.split("\n")[0]) : theme.fg("success", "written");
			setSummary(context, summary);
			return context.lastComponent instanceof Container ? context.lastComponent : new Container();
		},
	});
}
