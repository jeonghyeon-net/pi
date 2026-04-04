/**
 * Disk I/O — escalation IPC and group-pending completions.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { PendingCompletion } from "../core/types.js";

// ━━━ Escalation IPC ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ESCALATIONS_DIR = path.join(os.homedir(), ".pi", "agent", "escalations");

export interface EscalationRecord {
  sessionFile: string;
  message: string;
  context?: string | undefined;
  timestamp: string;
}

/**
 * Minimal YAML parser for simple key-value escalation records.
 * Handles `key: value` lines and basic multiline continuation (indented lines
 * following a key are appended to that key's value).
 */
function parseSimpleYaml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  let lastKey = "";
  for (const line of content.split("\n")) {
    // Continuation line: starts with whitespace and follows a key
    if (lastKey && line.length > 0 && (line[0] === " " || line[0] === "\t")) {
      result[lastKey] += `\n${line.trimEnd()}`;
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      lastKey = "";
      continue;
    }
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex <= 0) {
      lastKey = "";
      continue;
    }
    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();
    // Strip surrounding quotes if present
    result[key] = value.replace(/^["'](.*)["']$/, "$1");
    lastKey = key;
  }
  return result;
}

/**
 * Derive the escalation IPC file path from a subagent session file.
 */
export function getEscalationFilePath(sessionFile: string): string {
  const basename = path.basename(sessionFile, ".jsonl");
  return path.join(ESCALATIONS_DIR, `${basename}.yaml`);
}

/**
 * Read the escalation IPC file and delete it immediately (consume-once pattern).
 * Returns null if the file does not exist or cannot be parsed.
 */
export function readAndConsumeEscalation(sessionFile: string): EscalationRecord | null {
  try {
    const filePath = getEscalationFilePath(sessionFile);
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf-8");
    const raw = parseSimpleYaml(content);
    // Validate required fields before treating as EscalationRecord
    if (typeof raw.sessionFile !== "string" || typeof raw.message !== "string") return null;
    const record: EscalationRecord = {
      sessionFile: raw.sessionFile,
      message: raw.message,
      context: raw.context,
      timestamp: raw.timestamp ?? "",
    };
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ignore deletion errors */
    }
    return record;
  } catch {
    return null;
  }
}

export type PendingGroupScope = "batch" | "chain";

export interface PersistedPendingGroupCompletion {
  scope: PendingGroupScope;
  groupId: string;
  originSessionFile: string;
  runIds: number[];
  pendingCompletion: PendingCompletion;
}

const SUBAGENT_STATE_DIR = path.join(os.homedir(), ".pi", "agent", "state");
const PENDING_GROUPS_FILE = path.join(SUBAGENT_STATE_DIR, "subagent-pending-groups.json");

function ensureStateDir(): void {
  fs.mkdirSync(SUBAGENT_STATE_DIR, { recursive: true });
}

function readPersistedEntries(): PersistedPendingGroupCompletion[] {
  try {
    if (!fs.existsSync(PENDING_GROUPS_FILE)) return [];
    const raw = fs.readFileSync(PENDING_GROUPS_FILE, "utf-8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is PersistedPendingGroupCompletion => {
      return Boolean(
        entry &&
          (entry.scope === "batch" || entry.scope === "chain") &&
          typeof entry.groupId === "string" &&
          typeof entry.originSessionFile === "string" &&
          Array.isArray(entry.runIds) &&
          entry.pendingCompletion &&
          typeof entry.pendingCompletion.createdAt === "number",
      );
    });
  } catch {
    return [];
  }
}

function writePersistedEntries(entries: PersistedPendingGroupCompletion[]): void {
  ensureStateDir();
  fs.writeFileSync(PENDING_GROUPS_FILE, `${JSON.stringify(entries, null, 2)}\n`, "utf-8");
}

export function upsertPendingGroupCompletion(entry: PersistedPendingGroupCompletion): void {
  const entries = readPersistedEntries().filter(
    (item) => !(item.scope === entry.scope && item.groupId === entry.groupId),
  );
  entries.push(entry);
  writePersistedEntries(entries);
}

export function clearPendingGroupCompletion(scope: PendingGroupScope, groupId: string): void {
  const entries = readPersistedEntries().filter(
    (entry) => !(entry.scope === scope && entry.groupId === groupId),
  );
  writePersistedEntries(entries);
}

export function consumePendingGroupCompletionsForSession(
  sessionFile: string,
): PersistedPendingGroupCompletion[] {
  const entries = readPersistedEntries();
  const matched = entries.filter((entry) => entry.originSessionFile === sessionFile);
  if (matched.length === 0) return [];
  const remaining = entries.filter((entry) => entry.originSessionFile !== sessionFile);
  writePersistedEntries(remaining);
  return matched;
}

export function evictStalePendingGroupCompletions(maxAgeMs: number): void {
  const now = Date.now();
  const entries = readPersistedEntries().filter(
    (entry) => now - entry.pendingCompletion.createdAt <= maxAgeMs,
  );
  writePersistedEntries(entries);
}
