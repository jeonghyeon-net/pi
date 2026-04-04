// @ts-nocheck — forked from Jonghakseo/my-pi
/**
 * Disk I/O — escalation IPC and group-pending completions.
 * Merges: escalation.ts + group-pending.ts
 */
/**
 * Exit code used by the 'escalate' tool to signal that the
 * subagent wants to escalate to the master.
 */
export const ESCALATION_EXIT_CODE = 42;
const ESCALATIONS_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? "/tmp",
  ".pi",
  "agent",
  "escalations",
);
export interface EscalationRecord {
  sessionFile: string;
  message: string;
  context?: string;
  timestamp: string;
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
    const record = parseYaml(content) as EscalationRecord;
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

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { PendingCompletion } from "./types.js";

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
