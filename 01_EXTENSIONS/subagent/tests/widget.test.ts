import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildWidgetLines, syncWidget, setCurrentTool, clearToolState, resetWidgetState } from "../src/widget.js";

describe("buildWidgetLines", () => {
	it("shows running agents", () => {
		const runs = [
			{ id: 1, agent: "scout", startedAt: Date.now() - 5000 },
			{ id: 2, agent: "worker", startedAt: Date.now() - 10000 },
		];
		const lines = buildWidgetLines(runs, Date.now());
		expect(lines).toHaveLength(2);
		expect(lines[0]).toContain("scout");
		expect(lines[0]).toContain("#1");
	});
	it("returns empty for no runs", () => {
		expect(buildWidgetLines([], Date.now())).toEqual([]);
	});
	it("limits to 3 visible", () => {
		const runs = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, agent: "w", startedAt: 0 }));
		expect(buildWidgetLines(runs, Date.now())).toHaveLength(3);
	});
	it("shows current tool in widget line", () => {
		setCurrentTool(1, "Bash");
		const lines = buildWidgetLines([{ id: 1, agent: "scout", startedAt: Date.now() - 1000 }], Date.now());
		expect(lines[0]).toContain("→ Bash");
		clearToolState(1);
	});
	it("hides tool after clearToolState", () => {
		setCurrentTool(1, "Read");
		clearToolState(1);
		const lines = buildWidgetLines([{ id: 1, agent: "scout", startedAt: 0 }], Date.now());
		expect(lines[0]).not.toContain("→");
	});
});

describe("setCurrentTool", () => {
	beforeEach(() => resetWidgetState());
	it("sets and clears tool name", () => {
		setCurrentTool(1, "Edit");
		expect(buildWidgetLines([{ id: 1, agent: "a", startedAt: 0 }], Date.now())[0]).toContain("Edit");
		setCurrentTool(1, undefined);
		expect(buildWidgetLines([{ id: 1, agent: "a", startedAt: 0 }], Date.now())[0]).not.toContain("Edit");
	});
});

describe("resetWidgetState", () => {
	it("clears all tool state", () => {
		setCurrentTool(1, "Bash");
		setCurrentTool(2, "Read");
		resetWidgetState();
		const lines = buildWidgetLines([{ id: 1, agent: "a", startedAt: 0 }], Date.now());
		expect(lines[0]).not.toContain("→");
	});
});

describe("syncWidget", () => {
	it("sets widget when runs exist", () => {
		const setWidget = vi.fn();
		const ctx = { hasUI: true, ui: { setWidget } };
		syncWidget(ctx, [{ id: 1, agent: "scout", startedAt: Date.now() }]);
		expect(setWidget).toHaveBeenCalledWith("subagent-status", expect.any(Array), { placement: "belowEditor" });
	});
	it("clears widget when no runs", () => {
		const setWidget = vi.fn();
		syncWidget({ hasUI: true, ui: { setWidget } }, []);
		expect(setWidget).toHaveBeenCalledWith("subagent-status", undefined);
	});
	it("skips when no UI", () => {
		const setWidget = vi.fn();
		syncWidget({ hasUI: false, ui: { setWidget } }, [{ id: 1, agent: "w", startedAt: 0 }]);
		expect(setWidget).not.toHaveBeenCalled();
	});
});
