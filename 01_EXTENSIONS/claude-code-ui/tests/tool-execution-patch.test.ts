import { Container, Text } from "@mariozechner/pi-tui";
import { describe, expect, it } from "vitest";
import { applyToolExecutionPatch, patchToolExecutionPrototype } from "../src/tool-execution-patch.ts";
import { render, theme } from "./helpers.ts";

describe("tool execution patch", () => {
	it("renders generic extension tools in the compact Claude style", async () => {
		class GenericToolExecution {
			toolName = "mcp";
			args = { action: "status", server: "creatrip-internal" };
			expanded = false;
			isPartial = false;
			result = { isError: false, details: { truncation: { truncated: true } } };
			rendererState: { summary?: string } = {};
			toolDefinition = {};
			getRenderShell() { return "default"; }
			createCallFallback() { return new Text("fallback", 0, 0); }
			createResultFallback() { return new Text("result", 0, 0); }
			getTextOutput() { return "line1\nline2"; }
		}
		expect(patchToolExecutionPrototype()).toBe(false);
		expect(patchToolExecutionPrototype(GenericToolExecution.prototype)).toBe(false);
		expect(patchToolExecutionPrototype(GenericToolExecution.prototype, theme)).toBe(true);
		const collapsed = new GenericToolExecution();
		expect(collapsed.getRenderShell()).toBe("self");
		expect(collapsed.createResultFallback()).toBeInstanceOf(Container);
		const call = render(collapsed.createCallFallback() as { render(width: number): string[] });
		expect(call).toContain("MCP");
		expect(call).toContain("status");
		expect(call).toContain("2 lines");
		expect(call).toContain("truncated");
		const expanded = new GenericToolExecution();
		expanded.expanded = true;
		const preview = render(expanded.createResultFallback() as { render(width: number): string[] });
		expect(preview).toContain("└");
		expect(preview).toContain("line1");
		expect(patchToolExecutionPrototype(GenericToolExecution.prototype, theme)).toBe(false);
		await applyToolExecutionPatch(async () => ({}));
		class LoadedExecution extends GenericToolExecution {}
		await applyToolExecutionPatch(async () => ({ ToolExecutionComponent: LoadedExecution, theme }));
		expect(new LoadedExecution().getRenderShell()).toBe("self");
	});

	it("handles running, error and empty generic tool results", () => {
		class RunningToolExecution {
			toolName = "status-check";
			args = { verbose: true };
			expanded = true;
			isPartial = true;
			result = { isError: true, details: {} };
			rendererState: { summary?: string } = {};
			toolDefinition = {};
			getRenderShell() { return "default"; }
			createCallFallback() { return new Text("fallback", 0, 0); }
			createResultFallback() { return new Text("result", 0, 0); }
			getTextOutput() { return ""; }
		}
		expect(patchToolExecutionPrototype(RunningToolExecution.prototype, theme)).toBe(true);
		const execution = new RunningToolExecution();
		expect(execution.createResultFallback()).toBeInstanceOf(Container);
		expect(render(execution.createCallFallback() as { render(width: number): string[] })).toContain("verbose=true");
		expect(execution.rendererState.summary).toContain("running…");
		execution.isPartial = false;
		execution.result = { isError: true, details: {} };
		execution.createResultFallback();
		expect(execution.rendererState.summary).toContain("error");
		class EmptyArgsTool extends RunningToolExecution {
			args = {};
			getTextOutput() { return undefined; }
		}
		const empty = new EmptyArgsTool();
		expect(render(empty.createCallFallback() as { render(width: number): string[] })).toContain("Status Check");
		expect(empty.createResultFallback()).toBeInstanceOf(Container);
	});

	it("leaves built-in and custom-rendered tools untouched", () => {
		class ExistingRenderers {
			toolName = "read";
			args = {};
			expanded = false;
			isPartial = false;
			rendererState = {};
			toolDefinition = { renderCall: {} };
			builtInToolDefinition = {};
			getRenderShell() { return "default"; }
			createCallFallback() { return new Text("fallback", 0, 0); }
			createResultFallback() { return new Text("result", 0, 0); }
			getTextOutput() { return ""; }
		}
		expect(patchToolExecutionPrototype(ExistingRenderers.prototype, theme)).toBe(true);
		const execution = new ExistingRenderers();
		expect(execution.getRenderShell()).toBe("default");
		expect(render(execution.createCallFallback() as { render(width: number): string[] })).toContain("fallback");
		expect(render(execution.createResultFallback() as { render(width: number): string[] })).toContain("result");
	});
});
