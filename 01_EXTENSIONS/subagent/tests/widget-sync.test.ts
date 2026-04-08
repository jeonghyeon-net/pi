import { visibleWidth } from "@mariozechner/pi-tui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildWidgetLines, rememberCompletedWidget, resetWidgetState, setCurrentTool, setNestedRuns, syncWidget, stopWidgetTimer } from "../src/widget.js";

beforeEach(() => resetWidgetState());
afterEach(() => stopWidgetTimer());

describe("buildWidgetLines", () => {
	it("scrolls root runs instead of truncating with an overflow summary", () => {
		const now = Date.now(), lines = buildWidgetLines([{ id: 1, agent: "a", startedAt: now - 1_000 }, { id: 2, agent: "b", startedAt: now - 2_000 }, { id: 3, agent: "c", startedAt: now - 3_000 }, { id: 4, agent: "d", startedAt: now - 4_000 }], now);
		expect(lines).toHaveLength(4);
		expect(lines[0]).toContain("a #1");
		expect(lines[2]).toContain("c #3");
		expect(lines[3]).toContain("roots 1,2,3 / 4");
	});
});

describe("syncWidget", () => {
	it("sets themed widget when runs exist", () => {
		const setWidget = vi.fn(), ctx = { hasUI: true, ui: { setWidget } };
		syncWidget(ctx, [{ id: 1, agent: "scout", startedAt: Date.now() }]);
		expect(setWidget).toHaveBeenCalledWith("subagent-status", expect.any(Function), { placement: "belowEditor" });
		const widget = setWidget.mock.calls[0][1](undefined, { fg: (_color: string, text: string) => `[${text}]` });
		expect(widget.render(80)[0]).toContain("scout");
		expect(visibleWidth(widget.render(12)[0] ?? "")).toBeLessThanOrEqual(12);
		widget.invalidate();
	});

	it("applies tones for idle, nested, and meta lines", () => {
		const setWidget = vi.fn(), ctx = { hasUI: true, ui: { setWidget } };
		vi.spyOn(Date, "now").mockReturnValue(200_000);
		setCurrentTool(2, "Bash");
		setNestedRuns(2, [{ id: 3, agent: "worker", startedAt: 199_000, depth: 1, activity: "edit" }, { id: 4, agent: "verifier", startedAt: 0, depth: 2 }, { id: 7, agent: "reviewer", startedAt: 199_000, depth: 2 }]);
		syncWidget(ctx, [{ id: 1, agent: "idle", startedAt: 0 }, { id: 2, agent: "root", startedAt: 199_000 }, { id: 5, agent: "other", startedAt: 199_000 }, { id: 6, agent: "more", startedAt: 199_000 }]);
		const widget = setWidget.mock.calls[0][1](undefined, { fg: (color: string, text: string) => `<${color}>${text}</${color}>` });
		vi.restoreAllMocks();
		const lines = widget.render(80);
		expect(lines.some((line: string) => line.startsWith("<warning>⏸ idle #1"))).toBe(true);
		expect(lines.some((line: string) => line.startsWith("<accent>") && line.includes("root #2"))).toBe(true);
		expect(lines.some((line: string) => line.startsWith("<muted>") && line.includes("worker #3"))).toBe(true);
		expect(lines.some((line: string) => line.startsWith("<dim>") && line.includes("verifier #4"))).toBe(true);
		expect(lines.some((line: string) => line.startsWith("<dim>") && line.includes("reviewer #7"))).toBe(true);
		expect(lines.some((line: string) => line.startsWith("<dim>") && line.includes("roots 1,2,3 / 4"))).toBe(true);
	});

	it("clears widget when no runs and skips without UI", () => {
		const setWidget = vi.fn();
		syncWidget({ hasUI: true, ui: { setWidget } }, []);
		expect(setWidget).toHaveBeenCalledWith("subagent-status", undefined, undefined);
		syncWidget({ hasUI: false, ui: { setWidget } }, [{ id: 1, agent: "w", startedAt: 0 }]);
		expect(setWidget).toHaveBeenCalledTimes(1);
	});

	it("keeps the last completed widget visible after runs finish", () => {
		const setWidget = vi.fn(), ctx = { hasUI: true, ui: { setWidget } };
		rememberCompletedWidget([]);
		setCurrentTool(1, "Bash");
		rememberCompletedWidget([{ id: 1, agent: "scout", startedAt: Date.now() - 1_000 }]);
		syncWidget(ctx, []);
		expect(setWidget).toHaveBeenCalledWith("subagent-status", expect.any(Function), { placement: "belowEditor" });
		const widget = setWidget.mock.calls[0][1](undefined, { fg: (_color: string, text: string) => text });
		expect(widget.render(80)[0]).toContain("scout #1");
		expect(widget.render(80)[0]).toContain("→ Bash");
		syncWidget(ctx, [{ id: 2, agent: "worker", startedAt: Date.now() }]);
		const nextWidget = setWidget.mock.calls[1][1](undefined, { fg: (_color: string, text: string) => text });
		expect(nextWidget.render(80)[0]).toContain("worker #2");
	});
});
