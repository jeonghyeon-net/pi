import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolLike } from "../src/types.ts";

export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "pi-tasks-test-"));
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

export function makePi(tools: ToolLike[]) {
  return { registerTool: (tool: ToolLike) => tools.push(tool) };
}

export function textResult(text: string) {
  return { content: [{ type: "text", text }], details: undefined };
}
