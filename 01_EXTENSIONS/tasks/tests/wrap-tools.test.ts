import { describe, expect, it } from "vitest";
import { wrapTaskExecute } from "../src/wrap-execute.ts";
import { wrapTaskOutput } from "../src/wrap-output.ts";
import { textResult } from "./helpers.ts";

describe("task tool wrappers", () => {
  it("updates descriptions, rewrites TaskExecute output, and resolves runtime ids", async () => {
    const launches = new Map<string, string>();
    const execute = wrapTaskExecute({ name: "TaskExecute", execute: async () => textResult("#4 → agent 22f074fe-aaaa") }, launches);
    const outputCalls: string[] = [];
    const output = wrapTaskOutput({
      name: "TaskOutput",
      execute: async (_id: string, params: { task_id: string }) => {
        outputCalls.push(params.task_id);
        return textResult(`Task #${params.task_id}`);
      },
    }, launches);
    expect(execute.description).toContain("stable task_id");
    expect(output.description).toContain("runtime agent_id");
    expect((await execute.execute?.("x", {}, undefined, undefined, {}))?.content?.[0]?.text).toContain("agent_id=22f074fe-aaaa");
    await output.execute?.("x", { task_id: "22f074fe" }, undefined, undefined, { cwd: process.cwd() });
    expect(outputCalls).toEqual(["4"]);
  });

  it("handles tools without execute and rewrites missing runtime errors", async () => {
    expect(wrapTaskExecute({ name: "TaskExecute" }, new Map()).description).toContain("runtime agent_id");
    const output = wrapTaskOutput({
      name: "TaskOutput",
      execute: async (_id: string, params: { task_id: string }) => {
        if (params.task_id === "4") throw new Error("boom");
        throw new Error("No task found");
      },
    }, new Map([["22f074fe-aaaa", "4"]]));
    expect(wrapTaskOutput({ name: "TaskOutput" }, new Map()).description).toContain("stable task_id");
    await expect(output.execute?.("x", { task_id: "22f074fe-aaaa" }, undefined, undefined, {})).rejects.toThrow("boom");
    await expect(output.execute?.("x", undefined, undefined, undefined, undefined)).rejects.toThrow("No task found");
    await expect(output.execute?.("x", { task_id: "deadbeef-aaaa" }, undefined, undefined, {})).rejects.toThrow("runtime agent ID");
  });
});
