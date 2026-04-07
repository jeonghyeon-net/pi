import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/state.js", () => ({
	initApi: vi.fn(),
	getTask: vi.fn(),
	deleteTask: vi.fn(),
}));

import { createReportTool } from "../src/tool.js";
import { initApi, getTask, deleteTask } from "../src/state.js";

const sendMsg = vi.fn();
const sendUserMsg = vi.fn();

function makeTask(overrides: Record<string, unknown> = {}) {
	return {
		id: 1, prompt: "p", intervalMs: 60_000, intervalLabel: "1분",
		createdAt: Date.now() - 5000, expiresAt: Date.now() + 86_400_000,
		nextRunAt: Date.now() + 60_000, runCount: 3, inFlight: true,
		lastSummary: undefined, timer: setTimeout(() => {}, 0),
		...overrides,
	};
}

beforeEach(() => vi.clearAllMocks());

describe("createReportTool", () => {
	it("calls initApi with callbacks", () => {
		createReportTool(sendMsg, sendUserMsg);
		expect(initApi).toHaveBeenCalledWith(sendMsg, sendUserMsg);
	});

	it("returns tool with correct metadata", () => {
		const tool = createReportTool(sendMsg, sendUserMsg);
		expect(tool.name).toBe("until_report");
		expect(tool.label).toBe("Until Report");
		expect(tool.description).toContain("until");
		expect(tool.promptSnippet).toBeDefined();
		expect(tool.promptGuidelines).toHaveLength(1);
		expect(tool.parameters).toBeDefined();
	});

	it("execute throws when task not found", () => {
		vi.mocked(getTask).mockReturnValue(undefined);
		const tool = createReportTool(sendMsg, sendUserMsg);
		expect(() => tool.execute("call-1", { taskId: 99, done: false, summary: "s" }))
			.toThrow("until #99 작업을 찾을 수 없습니다. 이미 완료/취소/만료되었을 수 있습니다.");
	});

	it("execute with done=true deletes task and returns done", async () => {
		const task = makeTask();
		vi.mocked(getTask).mockReturnValue(task);
		const tool = createReportTool(sendMsg, sendUserMsg);
		const result = await tool.execute("call-2", { taskId: 1, done: true, summary: "ok" });
		expect(task.inFlight).toBe(false);
		expect(task.lastSummary).toBe("ok");
		expect(deleteTask).toHaveBeenCalledWith(1);
		expect(result.details.done).toBe(true);
		expect(result.details.elapsed).toBeDefined();
		expect(result.details.runCount).toBe(3);
	});

	it("execute with done=false returns continue with nextRunAt", async () => {
		const task = makeTask({ nextRunAt: 999 });
		vi.mocked(getTask).mockReturnValue(task);
		const tool = createReportTool(sendMsg, sendUserMsg);
		const result = await tool.execute("call-3", { taskId: 1, done: false, summary: "wip" });
		expect(task.inFlight).toBe(false);
		expect(task.lastSummary).toBe("wip");
		expect(deleteTask).not.toHaveBeenCalled();
		expect(result.details.done).toBe(false);
		expect(result.details.nextRunAt).toBe(999);
	});
});
