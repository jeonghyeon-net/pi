import { defineTool, createBashToolDefinition, type AgentToolResult, type BashToolDetails, type BashToolInput, type Theme } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { branchBlock, inlineSuffix, summarizeTextPreview, toolPrefix } from "./tool-utils.js";

type BashResult = AgentToolResult<BashToolDetails | undefined>;
type RenderOptions = { expanded: boolean; isPartial: boolean };
type RenderState = { summary?: string };

function setSummary(context: { state: RenderState; invalidate: () => void }, summary: string) {
	if (context.state.summary === summary) return;
	context.state.summary = summary;
	context.invalidate();
}

export function createClaudeBashTool(cwd: string) {
	const base = createBashToolDefinition(cwd);
	return defineTool({
		...base,
		renderShell: "self",
		renderCall(args: BashToolInput, theme: Theme, context) {
			const command = args.command.length > 88 ? `${args.command.slice(0, 85)}…` : args.command;
			const text = context.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0);
			text.setText(`${toolPrefix(theme, "Bash")} ${theme.fg("muted", command)}${inlineSuffix(theme, context.state.summary)}`);
			return text;
		},
		renderResult(result: BashResult, { expanded, isPartial }: RenderOptions, theme: Theme, context) {
			const output = result.content[0]?.type === "text" ? result.content[0].text : "";
			const exitCode = output.match(/exit code: (\d+)/)?.[1];
			const status = isPartial ? theme.fg("warning", "running…") : exitCode && exitCode !== "0" ? theme.fg("error", `exit ${exitCode}`) : theme.fg("success", "done");
			const summary = `${status}${theme.fg("dim", ` · ${output.split("\n").filter((line) => line.trim()).length} lines`)}${result.details?.truncation?.truncated ? theme.fg("dim", " · truncated") : ""}`;
			setSummary(context, summary);
			if (!expanded || !output.trim()) return context.lastComponent instanceof Container ? context.lastComponent : new Container();
			return new Text(branchBlock(theme, summarizeTextPreview(theme, output, 18)), 0, 0);
		},
	});
}
