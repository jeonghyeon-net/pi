import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jitter, scheduleNext, executeRun } from "../src/runner.js";
import { getTask, deleteTask, isAgentRunning, sendMessage, sendUserMessage, notify, updateFooter } from "../src/state.js";
import type { UntilTask } from "../src/types.js";

vi.mock("../src/state.js", () => ({ getTask: vi.fn(), deleteTask: vi.fn(), isAgentRunning: vi.fn(),
	sendMessage: vi.fn(), sendUserMessage: vi.fn(), notify: vi.fn(), updateFooter: vi.fn() }));
function makeTask(o: Partial<UntilTask> = {}): UntilTask {
	return { id: 1, prompt: "test", intervalMs: 120000, intervalLabel: "2분", createdAt: Date.now() - 60000,
		expiresAt: Date.now() + 86400000, nextRunAt: Date.now() + 120000, runCount: 0,
		inFlight: false, lastSummary: undefined, timer: setTimeout(() => {}, 0), ...o };
}
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("jitter", () => {
	it("returns ms when offset=0, clamps small values, applies ±10%", () => {
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		expect(jitter(120000)).toBe(120000);
		vi.spyOn(Math, "random").mockReturnValue(0);
		expect(jitter(60000)).toBeGreaterThanOrEqual(60000);
		vi.spyOn(Math, "random").mockReturnValue(1);
		expect(jitter(200000)).toBe(220000);
	});
});

describe("scheduleNext", () => {
	it("returns early when task not found", () => {
		vi.mocked(getTask).mockReturnValue(undefined);
		scheduleNext(99);
		expect(updateFooter).not.toHaveBeenCalled();
	});
	it("clears timeout, sets nextRunAt/timer, calls updateFooter", () => {
		const task = makeTask();
		vi.mocked(getTask).mockReturnValue(task);
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		scheduleNext(1);
		expect(task.nextRunAt).toBeGreaterThan(0);
		expect(task.timer).toBeDefined();
		expect(updateFooter).toHaveBeenCalled();
	});
});

describe("executeRun", () => {
	it("returns immediately when task not found", () => {
		vi.mocked(getTask).mockReturnValue(undefined);
		executeRun(99);
		expect(notify).not.toHaveBeenCalled();
	});
	it("handles expiration with lastSummary", () => {
		vi.mocked(getTask).mockReturnValue(makeTask({ expiresAt: Date.now() - 1, lastSummary: "done" }));
		executeRun(1);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("만료"), "warning");
		expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("done") }));
		expect(deleteTask).toHaveBeenCalledWith(1);
	});
	it("handles expiration without lastSummary (nullish coalescing)", () => {
		vi.mocked(getTask).mockReturnValue(makeTask({ expiresAt: Date.now() - 1 }));
		executeRun(1);
		expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("없음") }));
	});
	it("reschedules when inFlight without incrementing runCount", () => {
		const task = makeTask({ inFlight: true });
		vi.mocked(getTask).mockReturnValue(task);
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		executeRun(1);
		expect(task.runCount).toBe(0);
		expect(updateFooter).toHaveBeenCalled();
	});
	it("normal run with agent running uses followUp", () => {
		const task = makeTask();
		vi.mocked(getTask).mockReturnValue(task);
		vi.mocked(isAgentRunning).mockReturnValue(true);
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		executeRun(1);
		expect(task.runCount).toBe(1);
		expect(task.inFlight).toBe(true);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("1회차"), "info");
		expect(sendUserMessage).toHaveBeenCalledWith(expect.stringContaining("until_report"), { deliverAs: "followUp" });
	});
	it("normal run without agent running sends plain message", () => {
		vi.mocked(getTask).mockReturnValue(makeTask());
		vi.mocked(isAgentRunning).mockReturnValue(false);
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		executeRun(1);
		expect(sendUserMessage).toHaveBeenCalledWith(expect.stringContaining("until_report"));
		expect(sendUserMessage).toHaveBeenCalledTimes(1);
	});
	it("resets inFlight when sendUserMessage throws", () => {
		const task = makeTask();
		vi.mocked(getTask).mockReturnValue(task);
		vi.mocked(isAgentRunning).mockReturnValue(false);
		vi.mocked(sendUserMessage).mockImplementation(() => { throw new Error("fail"); });
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		executeRun(1);
		expect(task.inFlight).toBe(false);
		expect(updateFooter).toHaveBeenCalled();
	});
});
