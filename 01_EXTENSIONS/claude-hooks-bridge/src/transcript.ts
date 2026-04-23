import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TRANSCRIPT_TMP_DIR } from "./constants.js";
import { extractTextFromBlocks } from "./text.js";
import type { JsonRecord, RuntimeContextLike, SessionEntryLike } from "./types.js";

export function getLastAssistantMessage(ctx: RuntimeContextLike): string | undefined {
  const entries = ctx.sessionManager.getEntries();
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry?.type === "message" && entry.message.role === "assistant") {
      const text = extractTextFromBlocks(entry.message.content);
      if (text) return text;
    }
  }
}
function mapAssistant(content: Array<JsonRecord>): JsonRecord[] {
  return content.flatMap((block): JsonRecord[] => {
    if (block.type === "text") return [{ type: "text", text: block.text }];
    if (block.type === "toolCall") return [{ type: "tool_use", id: block.id, name: block.name, input: block.arguments }];
    return [];
  });
}
function mapUser(content: unknown): JsonRecord[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((block): JsonRecord[] => block?.type === "text" ? [{ type: "text", text: block.text }] : []);
}
function mapTranscriptLine(entry: SessionEntryLike): string | null {
  const message = entry.message;
  if (message.role === "assistant") {
    const content = Array.isArray(message.content) ? mapAssistant(message.content as Array<JsonRecord>) : [];
    return content.length ? JSON.stringify({ type: "assistant", message: { content } }) : null;
  }
  if (message.role === "user") {
    const content = mapUser(message.content);
    return content.length ? JSON.stringify({ type: "user", message: { content } }) : null;
  }
  if (message.role !== "toolResult") return null;
  return JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: message.toolCallId, content: [{ type: "text", text: extractTextFromBlocks(message.content) }] }] } });
}
export function createTranscriptFile(ctx: RuntimeContextLike, sessionId: string): string | undefined {
  try {
    const lines = ctx.sessionManager.getEntries().flatMap((entry) => entry?.type === "message" ? [mapTranscriptLine(entry)] : []).filter(Boolean) as string[];
    mkdirSync(TRANSCRIPT_TMP_DIR, { recursive: true });
    const file = path.join(TRANSCRIPT_TMP_DIR, `${sessionId.replace(/[^a-zA-Z0-9_-]/g, "_")}.jsonl`);
    writeFileSync(file, lines.length ? `${lines.join("\n")}\n` : "", "utf8");
    return file;
  } catch { return undefined; }
}
