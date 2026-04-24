import { Container, Text } from "@mariozechner/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { applyToolExecutionPatch, patchToolExecutionPrototype } from "../src/tool-execution-patch.ts";
import { render, theme } from "./helpers.ts";

describe("tool execution patch", () => {
	it("renders extension tools compactly and updates summaries after completion", async () => {
		const transcript = 'fetch https://www.google.com/search?q=x\n  prompt: "summarize it"\nsearch (383 chars)\n**페이지 정보**\nGoogle의 시스템이 비정상적인 트래픽을 감지했습니다.';
		class GenericToolExecution {
			toolName = "mcp"; args = { action: "call", tool: "fetch_content", server: "creatrip-internal" }; expanded = false; isPartial = false;
			result = { isError: false, details: { truncation: { truncated: true } } }; rendererState: { summary?: string } = {}; toolDefinition = {};
			getCallRenderer() { return undefined; } getResultRenderer() { return undefined; } getRenderShell() { return "default"; }
			createCallFallback() { return new Text("fallback", 0, 0); } createResultFallback() { return new Text("result", 0, 0); } getTextOutput() { return transcript; }
		}
		expect(patchToolExecutionPrototype()).toBe(false); expect(patchToolExecutionPrototype(GenericToolExecution.prototype)).toBe(false); expect(patchToolExecutionPrototype(GenericToolExecution.prototype, theme)).toBe(true);
		const execution = new GenericToolExecution(); const callRenderer = execution.getCallRenderer(); const resultRenderer = execution.getResultRenderer(); const invalidate = vi.fn();
		expect(typeof callRenderer).toBe("function"); expect(typeof resultRenderer).toBe("function"); expect(execution.getRenderShell()).toBe("self");
		const state: { summary?: string } = {}; const ctx = { state, invalidate, lastComponent: undefined };
		expect(render(callRenderer?.(execution.args, theme, ctx) as { render(width: number): string[] })).toContain("Fetch Content");
		expect(resultRenderer?.({ content: [{ type: "text", text: transcript }], details: execution.result.details }, { expanded: false, isPartial: false }, theme, ctx)).toBeInstanceOf(Container);
		expect(state.summary).toContain("done"); expect(state.summary).toContain("truncated"); expect(invalidate).toHaveBeenCalledTimes(1);
		const call = render(callRenderer?.(execution.args, theme, ctx) as { render(width: number): string[] });
		expect(call).toContain("MCP"); expect(call).toContain("done"); expect(call).toContain("truncated");
		expect(render(execution.createCallFallback() as { render(width: number): string[] })).toContain("Fetch Content");
		expect(execution.createResultFallback()).toBeInstanceOf(Container); execution.expanded = true;
		const fallbackPreview = render(execution.createResultFallback() as { render(width: number): string[] });
		expect(fallbackPreview).toContain("페이지 정보 — Google의 시스템이");
		class EmptyGenericExecution extends GenericToolExecution { getTextOutput() { return undefined; } }
		expect(new EmptyGenericExecution().createResultFallback()).toBeInstanceOf(Container);
		const preview = render(resultRenderer?.({ content: [{ type: "text", text: transcript }], details: execution.result.details }, { expanded: true, isPartial: false }, theme, ctx) as { render(width: number): string[] });
		expect(preview).toContain("└"); expect(preview).toContain("search · 383 chars"); expect(preview).toContain("페이지 정보 — Google의 시스템이"); expect(preview).not.toContain("prompt");
		expect(patchToolExecutionPrototype(GenericToolExecution.prototype, theme)).toBe(false); await applyToolExecutionPatch(async () => ({})); class LoadedExecution extends GenericToolExecution {}
		await applyToolExecutionPatch(async () => ({ ToolExecutionComponent: LoadedExecution, theme })); expect(new LoadedExecution().getRenderShell()).toBe("self");
	});

	it("suppresses external tool boxes and reports result summaries", () => {
		class WebToolExecution {
			toolName = "web_search"; args = { query: "크리에이트립" }; expanded = false; isPartial = false; result = { isError: false, details: { totalResults: 5 } }; rendererState: { summary?: string } = {}; toolDefinition = { renderCall: {}, renderResult: {} };
			getCallRenderer() { return "renderer"; } getResultRenderer() { return "renderer"; } getRenderShell() { return "default"; } createCallFallback() { return new Text("fallback", 0, 0); } createResultFallback() { return new Text("result", 0, 0); } getTextOutput() { return "공식 사이트\n앱 정보\n회사 정보"; }
		}
		expect(patchToolExecutionPrototype(WebToolExecution.prototype, theme)).toBe(true);
		const execution = new WebToolExecution(); const callRenderer = execution.getCallRenderer(); const resultRenderer = execution.getResultRenderer(); const ctx = { state: {}, invalidate: vi.fn(), lastComponent: undefined };
		expect(typeof callRenderer).toBe("function"); expect(typeof resultRenderer).toBe("function"); expect(execution.getRenderShell()).toBe("self"); expect(render(callRenderer?.(execution.args, theme, ctx) as { render(width: number): string[] })).toContain("크리에이트립");
		resultRenderer?.({ content: [], details: execution.result.details }, { expanded: false, isPartial: false }, theme, ctx); expect(`${ctx.state.summary ?? ""}`).toContain("5 sources");
		resultRenderer?.({ content: [], details: { successful: 1, urlCount: 2 } }, { expanded: false, isPartial: false }, theme, ctx); expect(`${ctx.state.summary ?? ""}`).toContain("1/2 URLs");
		resultRenderer?.({ content: [], details: { totalChars: 451 } }, { expanded: false, isPartial: false }, theme, ctx); expect(`${ctx.state.summary ?? ""}`).toContain("451 chars");
	});

	it("keeps built-in renderers and handles running or error states", () => {
		class BuiltInExecution {
			toolName = "read"; args = {}; expanded = false; isPartial = false; result = { isError: false, details: {} }; rendererState = {}; toolDefinition = { renderCall: {} }; builtInToolDefinition = {};
			getCallRenderer() { return "renderer"; } getResultRenderer() { return "renderer"; } getRenderShell() { return "default"; } createCallFallback() { return new Text("fallback", 0, 0); } createResultFallback() { return new Text("result", 0, 0); } getTextOutput() { return ""; }
		}
		class RunningExecution {
			toolName = "status-check"; args = {}; expanded = true; isPartial = true; result = { isError: true, details: {} }; rendererState = {}; toolDefinition = {};
			getCallRenderer() { return undefined; } getResultRenderer() { return undefined; } getRenderShell() { return "default"; } createCallFallback() { return new Text("fallback", 0, 0); } createResultFallback() { return new Text("result", 0, 0); } getTextOutput() { return ""; }
		}
		expect(patchToolExecutionPrototype(BuiltInExecution.prototype, theme)).toBe(true); expect(patchToolExecutionPrototype(RunningExecution.prototype, theme)).toBe(true);
		const builtIn = new BuiltInExecution(); expect(builtIn.getCallRenderer()).toBe("renderer"); expect(builtIn.getResultRenderer()).toBe("renderer"); expect(builtIn.getRenderShell()).toBe("default"); expect(render(builtIn.createCallFallback() as { render(width: number): string[] })).toContain("fallback"); expect(render(builtIn.createResultFallback() as { render(width: number): string[] })).toContain("result");
		const running = new RunningExecution(); const resultRenderer = running.getResultRenderer(); const ctx = { state: {}, invalidate: vi.fn(), lastComponent: undefined };
		expect(render(running.getCallRenderer()?.({}, theme, ctx) as { render(width: number): string[] })).toContain("Status Check"); resultRenderer?.({ content: [], details: {} }, { expanded: false, isPartial: true }, theme, ctx); expect(`${ctx.state.summary ?? ""}`).toContain("running…");
		running.isPartial = false; running.result = { isError: true, details: {} }; resultRenderer?.({ content: [], details: {} }, { expanded: false, isPartial: false }, theme, ctx); expect(`${ctx.state.summary ?? ""}`).toContain("error");
	});
});
