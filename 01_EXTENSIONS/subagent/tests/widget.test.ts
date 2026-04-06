import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	buildWidgetLines, syncWidget, setCurrentTool, clearToolState, resetWidgetState,
	startWidgetTimer, stopWidgetTimer,
} from "../src/widget.js";

const SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

beforeEach(() => resetWidgetState());
afterEach(() => stopWidgetTimer());

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
	});
	it("hides tool after clearToolState", () => {
		setCurrentTool(1, "Read");
		clearToolState(1);
		const lines = buildWidgetLines([{ id: 1, agent: "scout", startedAt: 0 }], Date.now());
		expect(lines[0]).not.toContain("→");
	});
	it("increments spinner frame each call", () => {
		const run = [{ id: 1, agent: "a", startedAt: Date.now() }];
		const now = Date.now();
		const frames = Array.from({ length: SPINNER.length }, () => buildWidgetLines(run, now)[0][0]);
		expect(new Set(frames).size).toBeGreaterThan(1);
	});
	it("cycles through all braille spinner characters", () => {
		const run = [{ id: 1, agent: "a", startedAt: Date.now() }];
		const now = Date.now();
		const frames = Array.from({ length: SPINNER.length }, () => buildWidgetLines(run, now)[0][0]);
		for (const ch of SPINNER) expect(frames).toContain(ch);
	});
	it("shows idle warning when no event for >120s", () => {
		const startedAt = 0;
		const now = 200_000;
		const lines = buildWidgetLines([{ id: 42, agent: "worker", startedAt }], now);
		expect(lines[0]).toContain("⚠");
		expect(lines[0]).toContain("idle");
	});
	it("shows spinner when idle is within threshold", () => {
		const now = Date.now();
		setCurrentTool(1, "Bash");
		const lines = buildWidgetLines([{ id: 1, agent: "a", startedAt: now - 1000 }], now);
		expect(lines[0]).not.toContain("⚠");
		expect(SPINNER).toContain(lines[0][0]);
	});
});

describe("setCurrentTool", () => {
	it("sets and clears tool name", () => {
		setCurrentTool(1, "Edit");
		expect(buildWidgetLines([{ id: 1, agent: "a", startedAt: 0 }], Date.now())[0]).toContain("Edit");
		setCurrentTool(1, undefined);
		expect(buildWidgetLines([{ id: 1, agent: "a", startedAt: 0 }], Date.now())[0]).not.toContain("Edit");
	});
	it("stores preview when provided", () => {
		setCurrentTool(1, "bash", "git status");
		const lines = buildWidgetLines([{ id: 1, agent: "a", startedAt: Date.now() }], Date.now());
		expect(lines[0]).toContain("bash: git status");
	});
	it("truncates preview to 30 chars", () => {
		const long = "a".repeat(50);
		setCurrentTool(1, "read", long);
		const lines = buildWidgetLines([{ id: 1, agent: "a", startedAt: Date.now() }], Date.now());
		expect(lines[0]).toContain("read: " + "a".repeat(30));
		expect(lines[0]).not.toContain("a".repeat(31));
	});
	it("updates lastEventTime so idle resets", () => {
		const startedAt = 0;
		const midway = 60_000;
		setCurrentTool(5, "Bash");
		vi.spyOn(Date, "now").mockReturnValue(midway);
		setCurrentTool(5, "Read");
		vi.restoreAllMocks();
		const lines = buildWidgetLines([{ id: 5, agent: "a", startedAt }], midway + 60_000);
		expect(lines[0]).not.toContain("⚠");
	});
});

describe("clearToolState", () => {
	it("removes both tool and lastEventTime", () => {
		setCurrentTool(3, "Bash");
		clearToolState(3);
		const now = 250_000;
		const lines = buildWidgetLines([{ id: 3, agent: "a", startedAt: 0 }], now);
		expect(lines[0]).toContain("⚠");
		expect(lines[0]).not.toContain("→");
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
	it("resets frame counter", () => {
		const run = [{ id: 1, agent: "a", startedAt: Date.now() }];
		const now = Date.now();
		const first = buildWidgetLines(run, now)[0][0];
		resetWidgetState();
		const second = buildWidgetLines(run, now)[0][0];
		expect(first).toBe(second);
	});
	it("stops any running timer", () => {
		const ctx = { hasUI: true, ui: { setWidget: vi.fn() } };
		startWidgetTimer(ctx, () => []);
		resetWidgetState();
		const calls = (ctx.ui.setWidget as ReturnType<typeof vi.fn>).mock.calls.length;
		vi.useFakeTimers();
		vi.advanceTimersByTime(500);
		vi.useRealTimers();
		expect((ctx.ui.setWidget as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
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

describe("startWidgetTimer / stopWidgetTimer", () => {
	it("calls syncWidget on interval", async () => {
		const setWidget = vi.fn();
		const ctx = { hasUI: true, ui: { setWidget } };
		startWidgetTimer(ctx, () => [{ id: 1, agent: "a", startedAt: Date.now() }]);
		await new Promise((r) => setTimeout(r, 200));
		stopWidgetTimer();
		expect(setWidget.mock.calls.length).toBeGreaterThan(0);
	});
	it("stopWidgetTimer stops the interval", async () => {
		const setWidget = vi.fn();
		const ctx = { hasUI: true, ui: { setWidget } };
		startWidgetTimer(ctx, () => [{ id: 1, agent: "a", startedAt: Date.now() }]);
		stopWidgetTimer();
		const before = setWidget.mock.calls.length;
		await new Promise((r) => setTimeout(r, 200));
		expect(setWidget.mock.calls.length).toBe(before);
	});
	it("startWidgetTimer replaces existing timer", () => {
		const ctx = { hasUI: true, ui: { setWidget: vi.fn() } };
		startWidgetTimer(ctx, () => []);
		startWidgetTimer(ctx, () => []);
		stopWidgetTimer();
	});
	it("stopWidgetTimer is safe to call without a timer", () => {
		expect(() => stopWidgetTimer()).not.toThrow();
	});
});
