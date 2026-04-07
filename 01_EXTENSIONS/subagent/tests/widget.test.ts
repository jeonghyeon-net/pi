import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	buildWidgetLines, setCurrentTool, clearToolState, resetWidgetState, advanceFrame,
} from "../src/widget.js";

const SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

beforeEach(() => resetWidgetState());

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
	it("shows overflow summary when runs exceed the visible limit", () => {
		const runs = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, agent: "w", startedAt: 0 }));
		const lines = buildWidgetLines(runs, Date.now());
		expect(lines).toHaveLength(4);
		expect(lines[2]).toContain("#3");
		expect(lines[3]).toContain("+2 more");
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
	it("increments spinner frame via advanceFrame", () => {
		const run = [{ id: 1, agent: "a", startedAt: Date.now() }];
		const now = Date.now();
		const frames = Array.from({ length: SPINNER.length }, () => { advanceFrame(); return buildWidgetLines(run, now)[0][0]; });
		expect(new Set(frames).size).toBeGreaterThan(1);
	});
	it("cycles through all braille spinner characters", () => {
		const run = [{ id: 1, agent: "a", startedAt: Date.now() }];
		const now = Date.now();
		const frames = Array.from({ length: SPINNER.length }, () => { advanceFrame(); return buildWidgetLines(run, now)[0][0]; });
		for (const ch of SPINNER) expect(frames).toContain(ch);
	});
	it("shows idle pause indicator when no event for >120s", () => {
		const startedAt = 0;
		const now = 200_000;
		const lines = buildWidgetLines([{ id: 42, agent: "worker", startedAt }], now);
		expect(lines[0]).toContain("⏸");
		expect(lines[0]).toContain("idle");
	});
	it("shows spinner when idle is within threshold", () => {
		const now = Date.now();
		setCurrentTool(1, "Bash");
		const lines = buildWidgetLines([{ id: 1, agent: "a", startedAt: now - 1000 }], now);
		expect(lines[0]).not.toContain("⏸");
		expect(SPINNER).toContain(lines[0][0]);
	});
});
