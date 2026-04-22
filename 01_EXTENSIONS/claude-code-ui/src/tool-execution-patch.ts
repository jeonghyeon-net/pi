import type { Theme } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { resolveFromModule } from "./internal-module.js";
import { branchBlock, inlineSuffix, summarizeArgs, summarizeTextPreview, toolLabel, toolPrefix } from "./tool-utils.js";

type ToolExecutionPrototype = {
	createCallFallback(): object;
	createResultFallback(): object | undefined;
	getRenderShell(): string;
	getTextOutput(): string | undefined;
	toolName: string;
	args: unknown;
	expanded: boolean;
	isPartial: boolean;
	result?: { isError?: boolean; details?: { truncation?: { truncated?: boolean } } };
	rendererState: { summary?: string };
	toolDefinition?: { renderCall?: object; renderResult?: object };
	builtInToolDefinition?: object;
	__claudeCodeUiPatched?: boolean;
};

type ToolExecutionModule = { ToolExecutionComponent?: { prototype?: ToolExecutionPrototype }; theme?: Theme };
type ToolExecutionLoader = () => Promise<ToolExecutionModule>;

function isGenericTool(tool: ToolExecutionPrototype) {
	return !!tool.toolDefinition && !tool.builtInToolDefinition && !tool.toolDefinition.renderCall && !tool.toolDefinition.renderResult;
}

export function patchToolExecutionPrototype(prototype?: ToolExecutionPrototype, theme?: Theme) {
	if (!prototype || !theme || prototype.__claudeCodeUiPatched) return false;
	const shell = prototype.getRenderShell;
	const call = prototype.createCallFallback;
	const result = prototype.createResultFallback;
	prototype.getRenderShell = function getRenderShellPatched() { return isGenericTool(this) ? "self" : shell.call(this); };
	prototype.createCallFallback = function createCallFallbackPatched() {
		if (!isGenericTool(this)) return call.call(this);
		const args = summarizeArgs(this.args);
		return new Text(`${toolPrefix(theme, toolLabel(this.toolName))}${args ? ` ${theme.fg("muted", args)}` : ""}${inlineSuffix(theme, this.rendererState.summary)}`, 0, 0);
	};
	prototype.createResultFallback = function createResultFallbackPatched() {
		if (!isGenericTool(this)) return result.call(this);
		const output = this.getTextOutput() ?? "";
		const lines = output.split("\n").filter((line) => line.trim()).length;
		const status = this.isPartial ? theme.fg("warning", "running…") : this.result?.isError ? theme.fg("error", "error") : theme.fg("success", "done");
		this.rendererState.summary = `${status}${lines ? theme.fg("dim", ` · ${lines} lines`) : ""}${this.result?.details?.truncation?.truncated ? theme.fg("dim", " · truncated") : ""}`;
		if (!this.expanded || !output.trim()) return new Container();
		return new Text(branchBlock(theme, summarizeTextPreview(theme, output, 18)), 0, 0);
	};
	prototype.__claudeCodeUiPatched = true;
	return true;
}

/* v8 ignore next 8 */
async function loadToolExecutionModule() {
	const main = import.meta.resolve("@mariozechner/pi-coding-agent");
	const [toolExecution, interactiveTheme] = await Promise.all([
		import(resolveFromModule(main, "modes/interactive/components/tool-execution.js")),
		import(resolveFromModule(main, "modes/interactive/theme/theme.js")),
	]);
	return { ToolExecutionComponent: toolExecution.ToolExecutionComponent, theme: interactiveTheme.theme };
}

export async function applyToolExecutionPatch(load: ToolExecutionLoader = loadToolExecutionModule) {
	const module = await load();
	patchToolExecutionPrototype(module.ToolExecutionComponent?.prototype, module.theme);
}
