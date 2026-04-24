import type { Theme } from "@mariozechner/pi-coding-agent";
import { resolveFromModule } from "./internal-module.js";
import { createCallRenderer, createResultRenderer, renderCallFallback, renderResultFallback, type ResultDetails } from "./generic-tool-renderer.js";

type ToolExecutionPrototype = {
	createCallFallback(): object;
	createResultFallback(): object | undefined;
	getCallRenderer(): object | undefined;
	getResultRenderer(): object | undefined;
	getRenderShell(): string;
	getTextOutput(): string | undefined;
	toolName: string;
	args: unknown;
	expanded: boolean;
	isPartial: boolean;
	result?: { isError?: boolean; details?: ResultDetails };
	rendererState: { summary?: string };
	toolDefinition?: { renderCall?: object; renderResult?: object };
	builtInToolDefinition?: object;
	__claudeCodeUiPatched?: boolean;
};

type ToolExecutionModule = { ToolExecutionComponent?: { prototype?: ToolExecutionPrototype }; theme?: Theme };
type ToolExecutionLoader = () => Promise<ToolExecutionModule>;

function isGenericTool(tool: ToolExecutionPrototype) {
	return !!tool.toolDefinition && !tool.builtInToolDefinition;
}

export function patchToolExecutionPrototype(prototype?: ToolExecutionPrototype, theme?: Theme) {
	if (!prototype || !theme || prototype.__claudeCodeUiPatched) return false;
	const shell = prototype.getRenderShell;
	const getCallRenderer = prototype.getCallRenderer;
	const getResultRenderer = prototype.getResultRenderer;
	const call = prototype.createCallFallback;
	const result = prototype.createResultFallback;
	prototype.getCallRenderer = function getCallRendererPatched() { return isGenericTool(this) ? createCallRenderer(this.toolName) : getCallRenderer.call(this); };
	prototype.getResultRenderer = function getResultRendererPatched() { return isGenericTool(this) ? createResultRenderer(() => this.result?.isError) : getResultRenderer.call(this); };
	prototype.getRenderShell = function getRenderShellPatched() { return isGenericTool(this) ? "self" : shell.call(this); };
	prototype.createCallFallback = function createCallFallbackPatched() {
		return isGenericTool(this) ? renderCallFallback(this.toolName, this.args, this.rendererState.summary, theme) : call.call(this);
	};
	prototype.createResultFallback = function createResultFallbackPatched() {
		if (!isGenericTool(this)) return result.call(this);
		const rendered = renderResultFallback(this.getTextOutput() ?? "", this.isPartial, this.result?.isError, this.result?.details, this.expanded, theme);
		this.rendererState.summary = rendered.summary;
		return rendered.component;
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
