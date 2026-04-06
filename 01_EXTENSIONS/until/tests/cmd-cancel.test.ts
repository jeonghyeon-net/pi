import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/state.js", () => ({
	getTasks: vi.fn(),
	getTask: vi.fn(),
	deleteTask: vi.fn(),
	clearAllTasks: vi.fn(),
}));

import { createCancelCommand } from "../src/cmd-cancel.js";
import { getTasks, getTask, deleteTask, clearAllTasks } from "../src/state.js";

const ctx = { ui: { notify: vi.fn() } };

beforeEach(() => vi.clearAllMocks());

describe("createCancelCommand", () => {
	it("returns description and handler", () => {
		const cmd = createCancelCommand();
		expect(cmd.description).toContain("until");
		expect(typeof cmd.handler).toBe("function");
	});

	it("empty args shows usage", async () => {
		await createCancelCommand().handler("", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("사용법"),
			"info",
		);
	});

	it('"all" clears all tasks and shows count', async () => {
		vi.mocked(getTasks).mockReturnValue(new Map([[1, {}], [2, {}]]) as ReturnType<typeof getTasks>);
		await createCancelCommand().handler("all", ctx);
		expect(clearAllTasks).toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith("until 2개 취소됨", "info");
	});

	it("non-integer id shows warning", async () => {
		await createCancelCommand().handler("abc", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("숫자"),
			"warning",
		);
	});

	it("unknown id shows warning", async () => {
		vi.mocked(getTask).mockReturnValue(undefined);
		await createCancelCommand().handler("99", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith("until #99 없음", "warning");
	});

	it("valid id deletes task and confirms", async () => {
		vi.mocked(getTask).mockReturnValue({} as ReturnType<typeof getTask>);
		await createCancelCommand().handler("3", ctx);
		expect(deleteTask).toHaveBeenCalledWith(3);
		expect(ctx.ui.notify).toHaveBeenCalledWith("until #3 취소됨", "info");
	});

	it('"ALL" (uppercase) also clears', async () => {
		vi.mocked(getTasks).mockReturnValue(new Map() as ReturnType<typeof getTasks>);
		await createCancelCommand().handler("  ALL  ", ctx);
		expect(clearAllTasks).toHaveBeenCalled();
	});

	it("float id shows warning", async () => {
		await createCancelCommand().handler("3.5", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("숫자"),
			"warning",
		);
	});
});
