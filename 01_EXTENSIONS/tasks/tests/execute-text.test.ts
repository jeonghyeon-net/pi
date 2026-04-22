import { describe, expect, it } from "vitest";
import { rememberLaunchedTasks, rewriteExecuteMessage } from "../src/execute-text.ts";
import { readTextContent, replaceTextContent } from "../src/results.ts";

describe("task execute message helpers", () => {
  it("rewrites launch output and remembers runtime ids", () => {
    const launches = new Map<string, string>();
    const text = [
      "Launched 2 agent(s):",
      "#4 → agent 22f074fe-aaaa",
      "#5 → agent 4689526a-bbbb",
      "",
      "Use TaskOutput to check progress.",
      "",
      "Skipped:\n#9: blocked",
    ].join("\n");
    rememberLaunchedTasks(text, launches);
    expect(launches.get("22f074fe-aaaa")).toBe("4");
    expect(rewriteExecuteMessage(text)).toContain("task_id=4 (stable), agent_id=22f074fe-aaaa");
    expect(rewriteExecuteMessage(text)).toContain("Skipped:\n#9: blocked");
    expect(rewriteExecuteMessage("#7 → agent plain")).not.toContain("Skipped:");
    expect(rewriteExecuteMessage("plain text")).toBe("plain text");
  });

  it("reads and replaces text content without losing other items", () => {
    expect(readTextContent({})).toBe("");
    expect(replaceTextContent({}, "added").content).toHaveLength(1);
    const none = { content: [{ type: "image", url: "x" }] };
    expect(readTextContent(none)).toBe("");
    expect(replaceTextContent(none, "added").content).toHaveLength(2);
    const texty = { content: [{ type: "text", text: "old" }, { type: "image", url: "x" }] };
    const emptyText = { content: [{ type: "text" }] };
    expect(readTextContent(texty)).toBe("old");
    expect(readTextContent(emptyText)).toBe("");
    expect(replaceTextContent(texty, "new").content?.[0]).toEqual({ type: "text", text: "new" });
  });
});
