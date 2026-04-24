import { Container, Text } from "@mariozechner/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { createCallRenderer, createResultRenderer, renderCallFallback, renderResultFallback } from "../src/generic-tool-renderer.ts";
import { render, theme } from "./helpers.ts";

describe("generic tool renderer", () => {
	it("reuses call components and handles missing previews", () => {
		const call = createCallRenderer("web_search");
		const first = call({}, theme, { state: {}, invalidate: vi.fn(), lastComponent: undefined });
		expect(first).toBeInstanceOf(Text);
		expect(render(first as { render(width: number): string[] })).toContain("Web Search");
		const second = call({ query: "크리에이트립" }, theme, { state: { summary: "done" }, invalidate: vi.fn(), lastComponent: first });
		expect(second).toBe(first);
		expect(render(second as { render(width: number): string[] })).toContain("크리에이트립");
	});

	it("reuses empty result containers and avoids duplicate invalidates", () => {
		const state: { summary?: string } = {};
		const invalidate = vi.fn();
		const result = createResultRenderer(() => false);
		const empty = new Container();
		expect(result({}, { expanded: false, isPartial: false }, theme, { state, invalidate, lastComponent: empty })).toBe(empty);
		expect(`${state.summary ?? ""}`).toContain("done");
		expect(invalidate).toHaveBeenCalledTimes(1);
		result({}, { expanded: false, isPartial: false }, theme, { state, invalidate, lastComponent: empty });
		expect(invalidate).toHaveBeenCalledTimes(1);
		const preview = result({ content: [{ type: "text", text: "a\nb" }] }, { expanded: true, isPartial: true }, theme, { state: {}, invalidate: vi.fn(), lastComponent: undefined });
		expect(render(preview as { render(width: number): string[] })).toContain("└");
	});

	it("renders fallback summaries for call and result states", () => {
		expect(render(renderCallFallback("mcp", {}, undefined, theme))).toContain("MCP");
		const success = renderResultFallback("hello", false, false, undefined, true, theme);
		expect(success.summary).toContain("done");
		expect(render(success.component as { render(width: number): string[] })).toContain("hello");
		const failure = renderResultFallback("", false, true, { truncation: { truncated: true } }, false, theme);
		expect(failure.summary).toContain("error");
		expect(failure.summary).toContain("truncated");
		expect(failure.component).toBeInstanceOf(Container);
	});
});
