import type { AgentToolResult, ReadToolDetails } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { createClaudeReadTool } from "../src/read-tool.ts";
import { createClaudeWriteTool } from "../src/write-tool.ts";
import { emptyComponent, render, theme, toolContext } from "./helpers.ts";

describe("read and write tool renderers", () => {
	it("renders read tool as a single collapsed line with optional preview", () => {
		const tool = createClaudeReadTool(process.cwd());
		const args = { path: "a.ts" };
		const state = {};
		expect(tool.renderShell).toBe("self");
		const call = tool.renderCall?.(args, theme, toolContext(args, state))!;
		expect(render(call)).toContain("a.ts");
		expect(tool.renderCall?.(args, theme, toolContext(args, state, false, call))).toBe(call);
		const partial = render(tool.renderResult?.({ content: [], details: undefined } as AgentToolResult<ReadToolDetails | undefined>, { expanded: false, isPartial: true, showImages: false, isError: false }, theme, toolContext(args, state, false, emptyComponent()))!);
		expect(partial).toBe("");
		expect(render(tool.renderCall?.(args, theme, toolContext(args, state))!)).toContain("reading…");
		const textResult = { content: [{ type: "text", text: "a\nb\nc" }], details: { truncation: { truncated: true, totalLines: 9 } } } as AgentToolResult<ReadToolDetails | undefined>;
		render(tool.renderResult?.(textResult, { expanded: false, isPartial: false, showImages: false, isError: false }, theme, toolContext(args, state))!);
		render(tool.renderResult?.(textResult, { expanded: false, isPartial: false, showImages: false, isError: false }, theme, toolContext(args, state))!);
		expect(render(tool.renderCall?.(args, theme, toolContext(args, state))!)).toContain("truncated from 9");
		expect(render(tool.renderResult?.(textResult, { expanded: true, isPartial: false, showImages: false, isError: false }, theme, toolContext(args, state, true))!)).toContain("└");
		const plain = { content: [{ type: "text", text: "a\nb\nc" }], details: undefined } as AgentToolResult<ReadToolDetails | undefined>;
		render(tool.renderResult?.(plain, { expanded: false, isPartial: false, showImages: false, isError: false }, theme, toolContext(args, state, false, emptyComponent()))!);
		expect(render(tool.renderCall?.(args, theme, toolContext(args, state))!)).toContain("3 lines");
		const image = { content: [{ type: "image" }], details: undefined } as AgentToolResult<ReadToolDetails | undefined>;
		render(tool.renderResult?.(image, { expanded: false, isPartial: false, showImages: false, isError: false }, theme, toolContext(args, state))!);
		expect(render(tool.renderCall?.(args, theme, toolContext(args, state))!)).toContain("loaded");
	});

	it("renders write tool inline and keeps collapsed results hidden", () => {
		const tool = createClaudeWriteTool(process.cwd());
		const args = { path: "a.ts", content: "a\nb" };
		const state = {};
		expect(tool.renderShell).toBe("self");
		const call = tool.renderCall?.(args, theme, toolContext(args, state))!;
		expect(render(call)).toContain("2 lines");
		expect(tool.renderCall?.(args, theme, toolContext(args, state, false, call))).toBe(call);
		render(tool.renderResult?.({ content: [] } as AgentToolResult<undefined>, { expanded: false, isPartial: true, showImages: false, isError: false }, theme, toolContext(args, state, false, emptyComponent()))!);
		expect(render(tool.renderCall?.(args, theme, toolContext(args, state))!)).toContain("writing…");
		const errorResult = { content: [{ type: "text", text: "Error: nope" }] } as AgentToolResult<undefined>;
		render(tool.renderResult?.(errorResult, { expanded: false, isPartial: false, showImages: false, isError: true }, theme, toolContext(args, state))!);
		const errorLine = render(tool.renderCall?.(args, theme, toolContext(args, state))!);
		expect(errorLine).toContain("Error:");
		expect(errorLine).toContain("nope");
		render(tool.renderResult?.({ content: [] } as AgentToolResult<undefined>, { expanded: false, isPartial: false, showImages: false, isError: false }, theme, toolContext(args, state, false, emptyComponent()))!);
		render(tool.renderResult?.({ content: [] } as AgentToolResult<undefined>, { expanded: false, isPartial: false, showImages: false, isError: false }, theme, toolContext(args, state))!);
		expect(render(tool.renderCall?.(args, theme, toolContext(args, state))!)).toContain("written");
	});
});
