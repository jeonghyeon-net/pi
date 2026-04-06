import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/state.js", () => ({
	getTasks: vi.fn(),
	sendMessage: vi.fn(),
}));
vi.mock("../src/time-utils.js", () => ({
	formatKoreanDuration: vi.fn((ms: number) => `${Math.round(ms / 1000)}초`),
}));

import { createUntilsCommand } from "../src/cmd-untils.js";
import { getTasks, sendMessage } from "../src/state.js";

const ctx = { ui: { notify: vi.fn() } };
const sendMsg = vi.fn();

beforeEach(() => vi.clearAllMocks());

function makeTask(id: number, nextRunAt: number, lastSummary?: string) {
	return {
		id, intervalLabel: "5분", runCount: 1,
		createdAt: 1000, nextRunAt, lastSummary, prompt: `task-${id}`,
	};
}

describe("createUntilsCommand", () => {
	it("returns description and handler", () => {
		const cmd = createUntilsCommand(sendMsg);
		expect(cmd.description).toBeTruthy();
		expect(typeof cmd.handler).toBe("function");
	});

	it("empty tasks shows no active tasks", async () => {
		vi.mocked(getTasks).mockReturnValue(new Map());
		await createUntilsCommand(sendMsg).handler("", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("없어"),
			"info",
		);
	});

	it("with tasks sends formatted message sorted by nextRunAt", async () => {
		const map = new Map([
			[2, makeTask(2, 3000)],
			[1, makeTask(1, 2000)],
		]);
		vi.mocked(getTasks).mockReturnValue(map);
		await createUntilsCommand(sendMsg).handler("", ctx);
		expect(sendMessage).toHaveBeenCalledTimes(1);
		const content = vi.mocked(sendMessage).mock.calls[0][0].content;
		expect(content).toContain("2개");
		const idx1 = content.indexOf("#1");
		const idx2 = content.indexOf("#2");
		expect(idx1).toBeLessThan(idx2);
	});

	it("tasks with lastSummary include summary in output", async () => {
		const map = new Map([
			[1, makeTask(1, 2000, "진행중")],
		]);
		vi.mocked(getTasks).mockReturnValue(map);
		await createUntilsCommand(sendMsg).handler("", ctx);
		const content = vi.mocked(sendMessage).mock.calls[0][0].content;
		expect(content).toContain("최근: 진행중");
	});

	it("tasks without lastSummary omit summary line", async () => {
		const map = new Map([[1, makeTask(1, 2000)]]);
		vi.mocked(getTasks).mockReturnValue(map);
		await createUntilsCommand(sendMsg).handler("", ctx);
		const content = vi.mocked(sendMessage).mock.calls[0][0].content;
		expect(content).not.toContain("최근:");
	});

	it("message includes prompt text", async () => {
		const map = new Map([[1, makeTask(1, 2000)]]);
		vi.mocked(getTasks).mockReturnValue(map);
		await createUntilsCommand(sendMsg).handler("", ctx);
		const content = vi.mocked(sendMessage).mock.calls[0][0].content;
		expect(content).toContain("task-1");
	});
});
