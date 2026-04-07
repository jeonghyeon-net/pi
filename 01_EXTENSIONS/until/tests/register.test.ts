import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/state.js", () => ({
	getTasks: vi.fn(),
	addTask: vi.fn(),
	allocateId: vi.fn(),
	updateFooter: vi.fn(),
}));
vi.mock("../src/runner.js", () => ({
	executeRun: vi.fn(),
}));

import { registerTask } from "../src/register.js";
import { getTasks, addTask, allocateId, updateFooter } from "../src/state.js";
import { executeRun } from "../src/runner.js";

const notifyFn = vi.fn();

beforeEach(() => {
	vi.clearAllMocks();
	vi.useRealTimers();
});

describe("registerTask", () => {
	it("returns false when MAX_TASKS reached", () => {
		const bigMap = new Map([[1, {}], [2, {}], [3, {}]]);
		vi.mocked(getTasks).mockReturnValue(bigMap as ReturnType<typeof getTasks>);
		const result = registerTask(60_000, "1분", "do stuff", notifyFn);
		expect(result).toBe(false);
		expect(notifyFn).toHaveBeenCalledWith(expect.stringContaining("최대"), "error");
		expect(addTask).not.toHaveBeenCalled();
	});

	it("returns false when interval below MIN_INTERVAL_MS", () => {
		vi.mocked(getTasks).mockReturnValue(new Map() as ReturnType<typeof getTasks>);
		const result = registerTask(5_000, "5초", "do stuff", notifyFn);
		expect(result).toBe(false);
		expect(notifyFn).toHaveBeenCalledWith(expect.stringContaining("최소"), "error");
		expect(addTask).not.toHaveBeenCalled();
	});

	it("registers task successfully", () => {
		vi.mocked(getTasks).mockReturnValue(new Map() as ReturnType<typeof getTasks>);
		vi.mocked(allocateId).mockReturnValue(7);
		vi.useFakeTimers();
		const result = registerTask(120_000, "2분", "check it", notifyFn);
		expect(result).toBe(true);
		expect(allocateId).toHaveBeenCalledOnce();
		expect(addTask).toHaveBeenCalledOnce();
		const task = vi.mocked(addTask).mock.calls[0][0];
		expect(task.id).toBe(7);
		expect(task.prompt).toBe("check it");
		expect(task.intervalMs).toBe(120_000);
		expect(task.intervalLabel).toBe("2분");
		expect(task.runCount).toBe(0);
		expect(task.inFlight).toBe(false);
		expect(notifyFn).toHaveBeenCalledWith(expect.stringContaining("#7"), "info");
		expect(updateFooter).toHaveBeenCalledOnce();
		clearTimeout(task.timer);
		vi.useRealTimers();
	});

	it("timer calls executeRun with task id", () => {
		vi.mocked(getTasks).mockReturnValue(new Map() as ReturnType<typeof getTasks>);
		vi.mocked(allocateId).mockReturnValue(5);
		vi.useFakeTimers();
		registerTask(60_000, "1분", "run", notifyFn);
		expect(executeRun).not.toHaveBeenCalled();
		vi.advanceTimersByTime(0);
		expect(executeRun).toHaveBeenCalledWith(5);
		vi.useRealTimers();
	});
});
