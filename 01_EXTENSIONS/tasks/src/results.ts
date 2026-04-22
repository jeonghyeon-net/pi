import type { ToolResult } from "./types.js";

function textIndex(result: ToolResult): number {
  return result.content?.findIndex((item) => item.type === "text" && typeof item.text === "string") ?? -1;
}

export function readTextContent(result: ToolResult): string {
  const index = textIndex(result);
  if (index < 0) return "";
  return String(result.content![index]!.text);
}

export function replaceTextContent(result: ToolResult, text: string): ToolResult {
  const content = result.content ?? [];
  const index = textIndex(result);
  if (index < 0) return { ...result, content: [...content, { type: "text", text }] };
  return {
    ...result,
    content: content.map((item, itemIndex) => itemIndex === index ? { ...item, text } : item),
  };
}
