import { describe, it, expect, beforeEach } from "vitest";
import { addRun, getRun, removeRun, listRuns, nextId, resetStore, completeRun, getCompleted, drainCompleted } from "../src/store.js";

describe("store", () => {
	beforeEach(() => resetStore());

	it("adds and retrieves run", () => {
		const id = nextId();
		addRun({ id, agent: "scout", startedAt: Date.now(), abort: () => {} });
		expect(getRun(id)?.agent).toBe("scout");
	});

	it("increments id", () => {
		expect(nextId()).toBe(1);
		expect(nextId()).toBe(2);
	});

	it("removes run", () => {
		const id = nextId();
		addRun({ id, agent: "scout", startedAt: 0, abort: () => {} });
		removeRun(id);
		expect(getRun(id)).toBeUndefined();
	});

	it("lists active runs", () => {
		addRun({ id: nextId(), agent: "a", startedAt: 0, abort: () => {} });
		addRun({ id: nextId(), agent: "b", startedAt: 0, abort: () => {} });
		expect(listRuns()).toHaveLength(2);
	});

	it("tracks completed results", () => {
		completeRun(1, { id: 1, agent: "scout", output: "done", usage: { inputTokens: 0, outputTokens: 0, turns: 0 } });
		expect(getCompleted()).toHaveLength(1);
	});

	it("drainCompleted returns and clears", () => {
		completeRun(1, { id: 1, agent: "w", output: "ok", usage: { inputTokens: 0, outputTokens: 0, turns: 0 } });
		expect(drainCompleted()).toHaveLength(1);
		expect(drainCompleted()).toHaveLength(0);
	});
});
