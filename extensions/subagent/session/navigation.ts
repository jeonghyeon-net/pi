import * as fs from "node:fs";
import * as path from "node:path";
import type {
  CustomEntry,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  SessionEntry,
} from "@mariozechner/pi-coding-agent";
import { PARENT_ENTRY_TYPE } from "../core/constants.js";
import type { SubagentStore } from "../core/store.js";
import type { CommandRunState } from "../core/types.js";
import { getLatestRun } from "../execution/run.js";
import { updateCommandRunsWidget } from "../ui/widget.js";

/**
 * Capture switchSession from an ExtensionCommandContext into the shared store.
 * Command handlers receive ExtensionCommandContext (which has switchSession),
 * while input/event handlers only get ExtensionContext (no switchSession).
 * This allows input handlers (<>, ><) to use the captured function as fallback.
 */
export function captureSwitchSession(
  store: SubagentStore,
  ctx: ExtensionContext | ExtensionCommandContext,
): void {
  if ("switchSession" in ctx && typeof ctx.switchSession === "function" && !store.switchSessionFn) {
    store.switchSessionFn = (ctx as ExtensionCommandContext).switchSession.bind(ctx);
  }
}

/**
 * Resolve a working switchSession function from either the context or the store.
 * Returns null if neither is available (no command has been run yet).
 */
export function resolveSwitchSession(
  ctx: ExtensionContext | ExtensionCommandContext,
  store: SubagentStore,
): ((sessionPath: string) => Promise<{ cancelled: boolean }>) | null {
  if ("switchSession" in ctx && typeof ctx.switchSession === "function") {
    return (ctx as ExtensionCommandContext).switchSession.bind(ctx);
  }
  return store.switchSessionFn;
}

/**
 * Ensure the current session file exists on disk before switching away.
 */
export function ensureSessionFileMaterialized(
  ctx: ExtensionContext,
  sessionFile: string | null,
): void {
  if (!sessionFile) return;
  const normalized = normalizePath(sessionFile);
  if (!normalized || fs.existsSync(normalized)) return;

  try {
    const sm = ctx.sessionManager;
    const rawHeader = "getHeader" in sm ? (sm as { getHeader: () => unknown }).getHeader() : null;
    const header =
      rawHeader &&
      typeof rawHeader === "object" &&
      (rawHeader as { type?: string }).type === "session"
        ? rawHeader
        : {
            type: "session",
            version: 3,
            id:
              "getSessionId" in sm
                ? (sm as { getSessionId: () => string }).getSessionId()
                : `fallback-${Date.now()}`,
            timestamp: new Date().toISOString(),
            cwd: "getCwd" in sm ? (sm as { getCwd: () => string }).getCwd() : ctx.cwd,
          };
    const entries: SessionEntry[] =
      "getEntries" in sm ? (sm as { getEntries: () => SessionEntry[] }).getEntries() : [];
    const fileEntries = [header, ...entries];

    const parentDir = path.dirname(normalized);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    const content = `${fileEntries.map((e) => JSON.stringify(e)).join("\n")}\n`;
    fs.writeFileSync(normalized, content, "utf8");
  } catch (_e) {
    // Ignore materialization errors; fallback messaging will handle missing parent.
  }
}

/**
 * Stage A: normalize a path — trim outer whitespace, strip CR/LF/TAB only.
 * Preserves interior spaces (valid in macOS paths).
 */
export function normalizePath(raw: unknown): string | null {
  if (!raw || typeof raw !== "string") return null;
  const cleaned = raw.replace(/[\r\n\t]+/g, "").trim();
  return cleaned || null;
}

/**
 * Stage B: compact a path — strip ALL whitespace (repair wrap/corruption artifacts).
 * Only used as fallback when Stage A path does not exist on disk.
 */
export function compactPath(raw: unknown): string | null {
  if (!raw || typeof raw !== "string") return null;
  const cleaned = raw.replace(/\s+/g, "").trim();
  return cleaned || null;
}

/**
 * Try to resolve a valid on-disk path from a raw value using 2-stage strategy.
 * Returns null when neither stage yields an existing file.
 */
export function resolveValidPath(raw: unknown): string | null {
  const stageA = normalizePath(raw);
  if (stageA && fs.existsSync(stageA)) return stageA;
  const stageB = compactPath(raw);
  if (stageB && stageB !== stageA && fs.existsSync(stageB)) return stageB;
  return null;
}

/**
 * Resolve the best parent session path.
 */
export function resolveParentSessionFile(
  ctx: ExtensionContext,
  store: SubagentStore,
): string | null {
  // Primary: in-memory cached value.
  const cached = resolveValidPath(store.currentParentSessionFile);
  if (cached) return cached;

  // Fallback: rescan current session entries for the latest valid parent link.
  try {
    const sm = ctx.sessionManager;
    const entries: SessionEntry[] =
      "getEntries" in sm ? (sm as { getEntries: () => SessionEntry[] }).getEntries() : [];
    let best: string | null = null;
    for (const entry of entries) {
      if (entry.type === "custom" && (entry as CustomEntry).customType === PARENT_ENTRY_TYPE) {
        const data = (entry as CustomEntry).data as Record<string, unknown> | undefined;
        const candidate = resolveValidPath(data?.parentSessionFile);
        if (candidate) best = candidate;
      }
    }
    if (best) {
      store.currentParentSessionFile = best;
      return best;
    }
  } catch (_e) {
    // Ignore rescan errors; fall through to null.
  }

  return null;
}

/**
 * Shared handler for switching to a subagent session (used by both /sub:trans and <>).
 */
export async function subTransHandler(
  args: string,
  ctx: ExtensionContext | ExtensionCommandContext,
  store: SubagentStore,
  pi: ExtensionAPI,
): Promise<void> {
  const raw = (args ?? "").trim();
  let runId: number;
  let run: CommandRunState | undefined;

  if (!raw) {
    // No args: auto-switch to latest completed run
    const latest = getLatestRun(store, ["done", "error"]);
    if (!latest) {
      ctx.ui.notify("No completed runs to switch to.", "info");
      return;
    }
    runId = latest.id;
    run = latest;
  } else {
    runId = Number.parseInt(raw, 10);
    if (Number.isNaN(runId)) {
      ctx.ui.notify("Usage: <> [runId] or /sub:trans <runId>", "error");
      return;
    }
    run = store.commandRuns.get(runId);
  }

  if (!run) {
    ctx.ui.notify(`Run #${runId} not found. Use /sub:open to see recent runs.`, "error");
    return;
  }
  if (run.status === "running") {
    ctx.ui.notify(
      `Run #${runId} is still running. Wait for it to finish or abort it first.`,
      "error",
    );
    return;
  }
  if (!run.sessionFile) {
    ctx.ui.notify(`Run #${runId} has no session file.`, "error");
    return;
  }

  const switchFn = resolveSwitchSession(ctx, store);
  if (!switchFn) {
    ctx.ui.notify("Session switch not ready. Run any /sub:* command first.", "warning");
    return;
  }

  // Capture current session path before switching — this becomes the parent link.
  const parentSessionFile = normalizePath(ctx.sessionManager.getSessionFile()) ?? undefined;
  ensureSessionFileMaterialized(ctx, parentSessionFile ?? null);

  try {
    const result = await switchFn(run.sessionFile);
    if (result.cancelled) {
      ctx.ui.notify(`Failed to switch to session for run #${runId}.`, "error");
      return;
    }

    // Persist parent link in the child session we just switched into.
    if (parentSessionFile) {
      pi.appendEntry(PARENT_ENTRY_TYPE, {
        parentSessionFile,
        runId,
        agent: run.agent,
        via: "<>",
        v: 1,
      });
      store.currentParentSessionFile = parentSessionFile;
      updateCommandRunsWidget(store);
    }
  } catch (err) {
    ctx.ui.notify(`Session switch error: ${err}`, "error");
  }
}

/**
 * Shared handler for returning to parent session (used by both /sub:back and ><).
 */
export async function subBackHandler(
  ctx: ExtensionContext | ExtensionCommandContext,
  store: SubagentStore,
): Promise<void> {
  const parentSession = resolveParentSessionFile(ctx, store);
  if (!parentSession) {
    // Clear stale in-memory reference so widget hides the hint.
    if (store.currentParentSessionFile) {
      store.currentParentSessionFile = null;
      updateCommandRunsWidget(store);
    }
    ctx.ui.notify("No parent session (file deleted or not linked).", "info");
    return;
  }

  const switchFn = resolveSwitchSession(ctx, store);
  if (!switchFn) {
    ctx.ui.notify("Session switch not ready. Run any /sub:* command first.", "warning");
    return;
  }

  try {
    const result = await switchFn(parentSession);
    if (result.cancelled) {
      ctx.ui.notify("Failed to return to parent session.", "error");
    }
  } catch (err) {
    ctx.ui.notify(`Session switch error: ${err}`, "error");
  }
}
