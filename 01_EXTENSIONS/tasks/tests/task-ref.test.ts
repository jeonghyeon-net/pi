import { describe, expect, it } from "vitest";
import { looksLikeRuntimeId, missingTaskIdMessage, resolveTaskId } from "../src/task-ref.ts";
import { TASKS_WRAP_TYPES } from "../src/types.ts";

describe("task id resolution", () => {
  it("prefers stable task ids and resolves runtime ids from memory or stored metadata", () => {
    expect(TASKS_WRAP_TYPES).toBe("tasks-wrap-types");
    const launches = new Map<string, string>([["22f074fe-aaaa", "4"]]);
    const tasks = [{ id: "5", owner: "4689526a-bbbb" }, { id: "6", metadata: { agentId: "b467cc01-cccc" } }];
    expect(resolveTaskId("4", launches, tasks)).toBe("4");
    expect(resolveTaskId("22f074fe", launches, tasks)).toBe("4");
    expect(resolveTaskId("4689526a", launches, tasks)).toBe("5");
    expect(resolveTaskId("b467cc01", launches, tasks)).toBe("6");
  });

  it("keeps unknown ids unchanged and reports ambiguity clearly", () => {
    const launches = new Map<string, string>([["abc-111", "4"], ["abc-222", "5"]]);
    expect(resolveTaskId("missing-id", launches, [])).toBe("missing-id");
    expect(looksLikeRuntimeId("22f074fe-aaaa")).toBe(true);
    expect(looksLikeRuntimeId("deadbeef")).toBe(true);
    expect(looksLikeRuntimeId("4")).toBe(false);
    expect(missingTaskIdMessage("22f")).toContain("stable task_id");
    expect(() => resolveTaskId("abc", launches, [])).toThrow("matches multiple tasks");
  });
});
