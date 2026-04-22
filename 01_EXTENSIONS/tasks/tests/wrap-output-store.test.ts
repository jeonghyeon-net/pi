import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { wrapTaskOutput } from "../src/wrap-output.ts";
import { tempDir, textResult } from "./helpers.ts";

describe("TaskOutput persisted runtime ids", () => {
  it("resolves a completed runtime agent id through the task store", async () => {
    const cwd = tempDir();
    const dir = join(cwd, ".pi", "tasks");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "tasks-session.json"), JSON.stringify({
      tasks: [{ id: "4", status: "completed", metadata: { agentId: "4689526a-bbbb" } }],
    }));
    const seen: string[] = [];
    const tool = wrapTaskOutput({
      name: "TaskOutput",
      execute: async (_id: string, params: { task_id: string }) => {
        seen.push(params.task_id);
        return textResult(`Task #${params.task_id}`);
      },
    }, new Map());
    const ctx = { cwd, sessionManager: { getSessionId: () => "session" } };
    await tool.execute?.("x", { task_id: "4689526a" }, undefined, undefined, ctx);
    expect(seen).toEqual(["4"]);
  });
});
