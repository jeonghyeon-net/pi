import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { KeyId } from "@mariozechner/pi-tui";
import { matchesKey } from "@mariozechner/pi-tui";
import { AGENT_SYMBOL_MAP, formatSymbolHints } from "../core/constants.js";
import type { SubagentDeps } from "../core/deps.js";
import type { SubagentStore } from "../core/store.js";
import { removeRun } from "../execution/run.js";
import { subBackHandler, subTransHandler } from "../session/navigation.js";
import { toWidgetCtx, updateCommandRunsWidget } from "../ui/widget.js";

/**
 * Cast a documentation-only shortcut string to KeyId.
 * These shortcuts are never matched by the key system — they only
 * appear in the /hotkeys Extensions section for user discoverability.
 */
function docKey(key: string): KeyId {
  return key as KeyId;
}

// ── onTerminalInput hack: auto-redirect <> / >< to command path ─────
// Module-level state so it persists across calls.
let unsubTerminalInput: (() => void) | null = null;

export function registerTerminalInputRedirect(ctx: ExtensionContext, store: SubagentStore): void {
  // Unsubscribe previous listener to avoid duplicates on session_switch.
  unsubTerminalInput?.();
  unsubTerminalInput = null;

  unsubTerminalInput = ctx.ui.onTerminalInput((data: string) => {
    // Fast path: already captured — skip entirely.
    if (store.switchSessionFn) return undefined;

    // Only intercept Enter key (all terminal variants).
    if (!matchesKey(data, "enter")) return undefined;

    const editorText = (ctx.ui.getEditorText() ?? "").trim();

    // <> [runId]  →  /sub:trans [runId]
    if (editorText.startsWith("<>")) {
      const args = editorText.slice(2).trim();
      ctx.ui.setEditorText(args ? `/sub:trans ${args}` : "/sub:trans");
      return undefined; // let Enter proceed with rewritten text
    }

    // ><  →  /sub:back
    if (editorText === "><") {
      ctx.ui.setEditorText("/sub:back");
      return undefined;
    }

    return undefined;
  });
}

export function registerInputHandlers(
  deps: SubagentDeps,
  commandExports: {
    subCommand: {
      handler: (args: string, ctx: ExtensionContext, forceMainContext?: boolean) => Promise<void>;
    };
    handleSubClear: (args: string, ctx: ExtensionContext) => Promise<void>;
    handleSubAbort: (args: string, ctx: ExtensionContext) => Promise<void>;
  },
): void {
  const { pi, store } = deps;
  const { subCommand, handleSubClear, handleSubAbort } = commandExports;

  // /hotkeys "Extensions" 섹션에 >> shorthand 사용법을 노출한다.
  // 실제 입력 처리는 아래 input 핸들러에서 수행된다.
  pi.registerShortcut(docKey(">>"), {
    description: "Run subagent task",
    handler: async () => {
      // Documentation-only entry.
    },
  });

  pi.registerShortcut(docKey(">>>"), {
    description: "Run subagent in dedicated sub-session (= /sub:isolate, supports symbols)",
    handler: async () => {
      // Documentation-only entry.
    },
  });

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") {
      return { action: "continue" as const };
    }

    const text = event.text ?? "";
    if (!text.startsWith(">>")) {
      return { action: "continue" as const };
    }

    // ── >>> shortcut: dedicated sub-session (same as /sub:isolate) ──
    // Must be matched before >> symbol/space patterns.
    if (text.startsWith(">>>")) {
      const forwardedArgs = text.slice(3).trim();
      if (!forwardedArgs) {
        ctx.ui.notify(
          `>>> [agent] <task> | >>> <runId> <task> | >>><symbol> <task>\n${formatSymbolHints(">>>")}`,
          "info",
        );
        return { action: "handled" as const };
      }

      // Dedicated symbol shortcut: >>>? task, >>>/ task, >>>* task, etc.
      const firstChar = forwardedArgs[0] ?? "";
      const dedicatedSymbol = AGENT_SYMBOL_MAP[firstChar];
      if (dedicatedSymbol) {
        const task = forwardedArgs.slice(1).trim();
        if (!task) {
          ctx.ui.notify(formatSymbolHints(">>>"), "info");
          return { action: "handled" as const };
        }
        await subCommand.handler(`${dedicatedSymbol} ${task}`, ctx, false);
        return { action: "handled" as const };
      }

      const firstSpace = forwardedArgs.indexOf(" ");
      const firstToken = firstSpace === -1 ? forwardedArgs : forwardedArgs.slice(0, firstSpace);
      if (/^\d+$/.test(firstToken) && !store.commandRuns.has(Number(firstToken))) {
        ctx.ui.notify(`Unknown subagent run #${firstToken}.`, "error");
        return { action: "handled" as const };
      }
      await subCommand.handler(forwardedArgs, ctx, false);
      return { action: "handled" as const };
    }

    // ── Symbol shortcut: >>? task, >>@ task, >>! task, etc. ──
    if (text.length >= 3) {
      const symbolChar = text[2] ?? "";
      const symbolAgent = symbolChar !== " " ? AGENT_SYMBOL_MAP[symbolChar] : undefined;
      if (symbolAgent) {
        const task = text.slice(3).trim();
        if (!task) {
          ctx.ui.notify(formatSymbolHints(), "info");
          return { action: "handled" as const };
        }
        await subCommand.handler(`${symbolAgent} ${task}`, ctx, true);
        return { action: "handled" as const };
      }
    }

    // ── Original >> <args> pattern ──
    if (text[2] !== " ") {
      return { action: "continue" as const };
    }

    const forwardedArgs = text.slice(3).trim();
    if (!forwardedArgs) {
      ctx.ui.notify(
        `>> [agent] <task> | >> <runId> <task> | >><symbol> <task>\n${formatSymbolHints()}`,
        "info",
      );
      return { action: "handled" as const };
    }

    const firstSpace = forwardedArgs.indexOf(" ");
    const firstToken = firstSpace === -1 ? forwardedArgs : forwardedArgs.slice(0, firstSpace);
    if (/^\d+$/.test(firstToken) && !store.commandRuns.has(Number(firstToken))) {
      ctx.ui.notify(`Unknown subagent run #${firstToken}.`, "error");
      return { action: "handled" as const };
    }

    await subCommand.handler(forwardedArgs, ctx, true);
    return { action: "handled" as const };
  });

  // #<runId> shortcut: resume a subagent run (e.g. #42 keep going)
  pi.registerShortcut(docKey("#<runId>"), {
    description: "Resume subagent run: #<runId> <task>",
    handler: async () => {
      // Documentation-only entry.
    },
  });

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") {
      return { action: "continue" as const };
    }

    const text = event.text ?? "";

    // Match #<digits> pattern (e.g. #42 task, #7 keep going)
    const match = /^#(\d+)\s(.+)/.exec(text);
    if (!match) {
      return { action: "continue" as const };
    }

    const runId = match[1] ?? "";
    const task = (match[2] ?? "").trim();

    if (!task) {
      ctx.ui.notify("Usage: #<runId> <task>", "info");
      return { action: "handled" as const };
    }

    if (!store.commandRuns.has(Number(runId))) {
      ctx.ui.notify(`Unknown subagent run #${runId}.`, "error");
      return { action: "handled" as const };
    }

    await subCommand.handler(`${runId} ${task}`, ctx, true);
    return { action: "handled" as const };
  });

  // <> shortcut: switch to subagent session (equivalent to /sub:trans)
  pi.registerShortcut(docKey("<>"), {
    description: "Switch to subagent session",
    handler: async () => {
      // Documentation-only entry.
    },
  });

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") {
      return { action: "continue" as const };
    }

    const text = event.text ?? "";
    if (!text.startsWith("<>")) {
      return { action: "continue" as const };
    }

    const raw = text.slice(2).trim();
    await subTransHandler(raw, ctx, store, pi);
    return { action: "handled" as const };
  });

  // >< shortcut: back to parent session (pop from session stack)
  pi.registerShortcut(docKey("><"), {
    description: "Back to parent session",
    handler: async () => {
      // Documentation-only entry.
    },
  });

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") {
      return { action: "continue" as const };
    }

    const text = event.text ?? "";
    if (text.trim() !== "><") {
      return { action: "continue" as const };
    }

    await subBackHandler(ctx, store);
    return { action: "handled" as const };
  });

  // << shortcut: abort running jobs or clear finished jobs
  pi.registerShortcut(docKey("<<"), {
    description: "Abort or clear subagent runs",
    handler: async () => {
      // Documentation-only entry.
    },
  });

  pi.registerShortcut(docKey("<<<"), {
    description: "Clear finished subagent jobs (= /sub:clear). <<< all to clear all",
    handler: async () => {
      // Documentation-only entry.
    },
  });

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") {
      return { action: "continue" as const };
    }

    const text = event.text ?? "";
    if (!text.startsWith("<<")) {
      return { action: "continue" as const };
    }

    // ── <<< shortcut: clear finished jobs (same as /sub:clear) ──
    // Must be matched before << patterns.
    if (text.startsWith("<<<")) {
      const clearArgs = text.slice(3).trim();
      await handleSubClear(clearArgs, ctx);
      return { action: "handled" as const };
    }

    const raw = text.slice(2).trim();

    // << 1,2,3 — multiple run IDs (comma-separated)
    // << 1 — single run ID
    // << (no args) — latest running or latest finished
    const ids = raw
      ? raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    if (ids.length === 0) {
      // No args: abort latest running job only.
      // Never auto-clear finished runs — too dangerous on accidental <<.
      const running = Array.from(store.commandRuns.values())
        .filter((r) => r.status === "running")
        .sort((a, b) => b.id - a.id);
      if (running.length > 0) {
        await handleSubAbort("", ctx);
      } else {
        ctx.ui.notify("No running jobs. Use << <id> or /sub:clear.", "info");
      }
      return { action: "handled" as const };
    }

    // Validate all IDs are numeric
    if (!ids.every((id) => /^\d+$/.test(id))) {
      ctx.ui.notify("Usage: << [runId,runId,...]", "info");
      return { action: "handled" as const };
    }

    let aborted = 0;
    let cleared = 0;
    const unknown: string[] = [];
    for (const idStr of ids) {
      const id = Number(idStr);
      const run = store.commandRuns.get(id);
      if (!run) {
        unknown.push(idStr);
        continue;
      }
      const shortcutController =
        run.abortController ?? store.globalLiveRuns.get(id)?.abortController;
      if (run.status === "running" && shortcutController) {
        run.lastLine = "Aborting by user...";
        run.lastOutput = run.lastLine;
        shortcutController.abort();
        aborted++;
      } else if (run.status !== "running") {
        const result = removeRun(store, id, {
          ctx: toWidgetCtx(ctx),
          pi,
          updateWidget: false,
          abortIfRunning: false,
          removalReason: "shortcut-clear",
        });
        if (result.removed) cleared++;
      }
    }
    updateCommandRunsWidget(store, toWidgetCtx(ctx));

    const parts: string[] = [];
    if (aborted) parts.push(`${aborted} aborted`);
    if (cleared) parts.push(`${cleared} cleared`);
    if (unknown.length) parts.push(`#${unknown.join(",#")} not found`);
    ctx.ui.notify(
      parts.join(", ") || "Nothing to do.",
      parts.length ? (aborted ? "warning" : "info") : "info",
    );
    return { action: "handled" as const };
  });
}
