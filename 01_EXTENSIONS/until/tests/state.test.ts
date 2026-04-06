import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	initApi, sendMessage, sendUserMessage, setUi, getUi, notify,
	setAgentRunning, isAgentRunning, getTasks, getTask, allocateId,
	addTask, deleteTask, clearAllTasks, updateFooter,
} from "../src/state.js";
import type { UntilTask } from "../src/types.js";

function makeTask(o: Partial<Pick<UntilTask, "id" | "nextRunAt" | "timer">> = {}): UntilTask {
	return { id: 1, prompt: "t", intervalMs: 60000, intervalLabel: "1m", createdAt: 0,
		expiresAt: 86400000, nextRunAt: o.nextRunAt ?? 60000, runCount: 0, inFlight: false,
		timer: o.timer ?? setTimeout(() => {}, 0), ...o };
}
const makeUi = () => ({
	notify: vi.fn(), setStatus: vi.fn(), theme: { fg: vi.fn((_: string, t: string) => t) },
	select: vi.fn(), confirm: vi.fn(), input: vi.fn(), onTerminalInput: vi.fn(),
	setWorkingMessage: vi.fn(), setHiddenThinkingLabel: vi.fn(), setWidget: vi.fn(),
	setFooter: vi.fn(), setHeader: vi.fn(), custom: vi.fn(), pasteToEditor: vi.fn(),
	setEditorText: vi.fn(), getEditorText: vi.fn(), editor: vi.fn(), setEditorComponent: vi.fn(),
	getAllThemes: vi.fn(), getTheme: vi.fn(), setTheme: vi.fn(),
	getToolsExpanded: vi.fn(), setToolsExpanded: vi.fn(),
});

beforeEach(() => { clearAllTasks(); initApi(vi.fn(), vi.fn()); setUi(undefined); setAgentRunning(false); });

describe("state", () => {
	it("initApi + sendMessage/sendUserMessage forward calls", () => {
		const s = vi.fn(), u = vi.fn();
		initApi(s, u);
		sendMessage({ customType: "t", content: "c", display: false });
		expect(s).toHaveBeenCalledWith({ customType: "t", content: "c", display: false });
		sendUserMessage("hi", { deliverAs: "followUp" });
		expect(u).toHaveBeenCalledWith("hi", { deliverAs: "followUp" });
	});
	it("setUi/getUi round-trips", () => {
		expect(getUi()).toBeUndefined();
		const u = makeUi(); setUi(u); expect(getUi()).toBe(u);
	});
	it("notify forwards to ui and is safe without ui", () => {
		expect(() => notify("msg")).not.toThrow();
		const u = makeUi(); setUi(u); notify("hello", "warning");
		expect(u.notify).toHaveBeenCalledWith("hello", "warning");
	});
	it("setAgentRunning/isAgentRunning", () => {
		expect(isAgentRunning()).toBe(false); setAgentRunning(true); expect(isAgentRunning()).toBe(true);
	});
	it("getTasks/getTask/allocateId/addTask", () => {
		const id = allocateId(); const task = makeTask({ id }); addTask(task);
		expect(getTask(id)).toBe(task); expect(getTasks().size).toBe(1);
		expect(getTask(999)).toBeUndefined();
	});
	it("allocateId increments", () => { const a = allocateId(); const b = allocateId(); expect(b).toBe(a + 1); });
	it("deleteTask clears timer and removes task", () => {
		addTask(makeTask({ id: 1, timer: setTimeout(() => {}, 100000) }));
		const u = makeUi(); setUi(u); deleteTask(1);
		expect(getTasks().size).toBe(0); expect(u.setStatus).toHaveBeenCalled();
	});
	it("deleteTask with nonexistent id does not crash", () => { expect(() => deleteTask(999)).not.toThrow(); });
	it("clearAllTasks clears tasks and timers", () => {
		addTask(makeTask({ id: allocateId(), timer: setTimeout(() => {}, 100000) }));
		clearAllTasks();
		expect(getTasks().size).toBe(0);
	});
	it("updateFooter sets status when tasks exist", () => {
		const u = makeUi(); setUi(u); addTask(makeTask({ id: 1 })); updateFooter();
		expect(u.setStatus.mock.calls.at(-1)![0]).toBe("until-footer");
		expect(u.setStatus.mock.calls.at(-1)![1]).toContain("until");
	});
	it("updateFooter shows dash when nextRunAt is Infinity", () => {
		const u = makeUi(); setUi(u);
		addTask(makeTask({ id: 1, nextRunAt: Number.POSITIVE_INFINITY })); updateFooter();
		expect(u.setStatus.mock.calls.at(-1)![1]).toContain("\u2014");
	});
	it("updateFooter clears status with no tasks", () => {
		const u = makeUi(); setUi(u); updateFooter();
		expect(u.setStatus).toHaveBeenCalledWith("until-footer", undefined);
	});
	it("updateFooter is no-op without ui", () => { expect(() => updateFooter()).not.toThrow(); });
});
