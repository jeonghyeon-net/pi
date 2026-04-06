import { describe, it, expect, beforeEach } from "vitest";
import {
	sessionPath,
	buildRunsEntry,
	restoreRuns,
	getRunHistory,
	resetSession,
	addToHistory,
} from "../src/session.js";

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

	it("buildRunsEntry captures history", () => {
		addToHistory({ id: 1, agent: "scout" });
		const entry = buildRunsEntry();
		expect(entry.runs).toHaveLength(1);
		expect(entry.updatedAt).toBeGreaterThan(0);
	});

	it("restoreRuns from custom entries", () => {
		const entries = [
			{
				type: "custom",
				customType: "subagent-runs",
				data: {
					runs: [{ id: 1, agent: "scout", output: "ok", sessionFile: "/tmp/1.json" }],
					updatedAt: 0,
				},
			},
		];
		restoreRuns(entries);
		expect(getRunHistory()).toHaveLength(1);
		expect(getRunHistory()[0].agent).toBe("scout");
	});

	it("takes last entry", () => {
		const entries = [
			{
				type: "custom",
				customType: "subagent-runs",
				data: { runs: [{ id: 1, agent: "a" }], updatedAt: 0 },
			},
			{
				type: "custom",
				customType: "subagent-runs",
				data: { runs: [{ id: 2, agent: "b" }], updatedAt: 1 },
			},
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
});
