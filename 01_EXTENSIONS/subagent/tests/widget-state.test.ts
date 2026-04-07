import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	buildWidgetLines, setCurrentTool, setCurrentMessage, clearToolState, resetWidgetState,
	startWidgetTimer,
} from "../src/widget.js";

beforeEach(() => resetWidgetState());

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
		expect(lines[0]).toContain("read: " + "a".repeat(29) + "…");
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
		expect(lines[0]).not.toContain("⏸");
	});
	it("clears message preview when undefined", () => {
		setCurrentMessage(6, "draft");
		setCurrentMessage(6, undefined);
		const lines = buildWidgetLines([{ id: 6, agent: "a", startedAt: Date.now() }], Date.now());
		expect(lines[0]).not.toContain("reply:");
	});
});

describe("clearToolState", () => {
	it("removes both tool and lastEventTime", () => {
		setCurrentTool(3, "Bash");
		clearToolState(3);
		const now = 250_000;
		const lines = buildWidgetLines([{ id: 3, agent: "a", startedAt: 0 }], now);
		expect(lines[0]).toContain("⏸");
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
