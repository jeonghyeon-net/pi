import { describe, it, expect, beforeEach } from "vitest";
import { sessionPath, buildRunsEntry, restoreRuns, getRunHistory, getSessionFile, resetSession, addToHistory, addPending, drainPending, resetPending } from "../src/session.js";

describe("sessionPath", () => {
	it("generates path from id", () => {
		const p = sessionPath(1, "/home/user");
		expect(p).toContain("subagents");
		expect(p).toContain("run-1");
		expect(p).toMatch(/\.json$/);
	});
});

describe("addToHistory", () => {
	beforeEach(() => resetSession());
	it("adds item to history", () => {
		addToHistory({ id: 1, agent: "scout" });
		expect(getRunHistory()).toHaveLength(1);
	});
});

describe("entry persistence", () => {
	beforeEach(() => resetSession());
	it("buildRunsEntry captures history and pending", () => {
		addToHistory({ id: 1, agent: "scout" });
		addPending({ id: 2, agent: "w", output: "done", usage: { inputTokens: 0, outputTokens: 0, turns: 0 } });
		const entry = buildRunsEntry();
		expect(entry.runs).toHaveLength(1);
		expect(entry.pending).toHaveLength(1);
		expect(entry.updatedAt).toBeGreaterThan(0);
	});
	it("restoreRuns from custom entries", () => {
		const entries = [{
			type: "custom", customType: "subagent-runs",
			data: { runs: [{ id: 1, agent: "scout", output: "ok", sessionFile: "/tmp/1.json" }], updatedAt: 0 },
		}];
		restoreRuns(entries);
		expect(getRunHistory()).toHaveLength(1);
		expect(getRunHistory()[0].agent).toBe("scout");
	});
	it("restores pending results", () => {
		const pend = [{ id: 3, agent: "w", output: "x", usage: { inputTokens: 0, outputTokens: 0, turns: 0 } }];
		restoreRuns([{ type: "custom", customType: "subagent-runs", data: { runs: [], pending: pend, updatedAt: 0 } }]);
		expect(drainPending()).toHaveLength(1);
	});
	it("takes last entry", () => {
		const entries = [
			{ type: "custom", customType: "subagent-runs", data: { runs: [{ id: 1, agent: "a" }], updatedAt: 0 } },
			{ type: "custom", customType: "subagent-runs", data: { runs: [{ id: 2, agent: "b" }], updatedAt: 1 } },
		];
		restoreRuns(entries);
		expect(getRunHistory()[0].agent).toBe("b");
	});
	it("skips non-subagent entries", () => {
		restoreRuns([{ type: "custom", customType: "other" }, { type: "message" }]);
		expect(getRunHistory()).toEqual([]);
	});
	it("handles missing data gracefully", () => {
		restoreRuns([{ type: "custom", customType: "subagent-runs" }]);
		expect(getRunHistory()).toEqual([]);
	});
	it("handles data object without runs array", () => {
		restoreRuns([{ type: "custom", customType: "subagent-runs", data: { other: true } }]);
		expect(getRunHistory()).toEqual([]);
	});
});

describe("pending results", () => {
	beforeEach(() => resetSession());
	it("addPending and drainPending", () => {
		addPending({ id: 1, agent: "a", output: "x", usage: { inputTokens: 0, outputTokens: 0, turns: 0 } });
		addPending({ id: 2, agent: "b", output: "y", usage: { inputTokens: 0, outputTokens: 0, turns: 0 } });
		const drained = drainPending();
		expect(drained).toHaveLength(2);
		expect(drainPending()).toHaveLength(0);
	});
	it("resetPending clears all", () => {
		addPending({ id: 1, agent: "a", output: "", usage: { inputTokens: 0, outputTokens: 0, turns: 0 } });
		resetPending();
		expect(drainPending()).toHaveLength(0);
	});
});

describe("getSessionFile", () => {
	beforeEach(() => resetSession());
	it("returns session file for existing run", () => {
		addToHistory({ id: 1, agent: "scout", sessionFile: "/tmp/s.json" });
		expect(getSessionFile(1)).toBe("/tmp/s.json");
	});
	it("returns undefined for missing run", () => {
		expect(getSessionFile(999)).toBeUndefined();
	});
	it("returns undefined when no session file", () => {
		addToHistory({ id: 2, agent: "scout" });
		expect(getSessionFile(2)).toBeUndefined();
	});
});
