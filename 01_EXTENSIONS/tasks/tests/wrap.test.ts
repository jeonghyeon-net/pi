import { describe, expect, it, vi } from "vitest";
import type { ToolLike } from "../src/types.ts";
import { makePi } from "./helpers.ts";

vi.mock("@jeonghyeon.net/pi-tasks/dist/index.js", () => ({
  default: (pi: { registerTool: (tool: ToolLike) => void }) => {
    pi.registerTool({ name: "TaskExecute", execute: async () => ({ content: [{ type: "text", text: "#4 → agent 22f074fe-aaaa" }] }) });
    pi.registerTool({ name: "TaskOutput", execute: async (_id, params: { task_id: string }) => ({ content: [{ type: "text", text: params.task_id }] }) });
    pi.registerTool({ name: "OtherTool" });
  },
}));

describe("tasks extension wrapper", () => {
  it("wraps task tools while leaving other tools untouched", async () => {
    const { default: extension } = await import("../src/wrap.ts");
    const tools: ToolLike[] = [];
    await extension(makePi(tools));
    expect(tools.map((tool) => tool.name)).toEqual(["TaskExecute", "TaskOutput", "OtherTool"]);
    const executed = await tools[0]?.execute?.("x", {}, undefined, undefined, {});
    const output = await tools[1]?.execute?.("x", { task_id: "22f074fe" }, undefined, undefined, {});
    expect(executed.content?.[0]?.text).toContain("task_id=4");
    expect(output.content?.[0]?.text).toBe("4");
    expect(tools[2]).toEqual({ name: "OtherTool" });
  });
});
