import type { SessionEntry } from "@mariozechner/pi-coding-agent";
import { discoverAgents } from "../agent/discovery.js";
import { PARENT_ENTRY_TYPE } from "../core/constants.js";
import type { SubagentDeps } from "../core/deps.js";
import { isCustomEntry } from "../core/types.js";
import { restoreRunsFromSession } from "../session/restore.js";
import { registerTerminalInputRedirect } from "./input.js";

// ── Persona injection for sub-trans child sessions ──────────────────
// When the user switches into a subagent session via <> / /sub:trans
// and sends normal chat prompts, prepend the subagent's system prompt
// so the main agent responds with that persona.
const PERSONA_MARKER = "<!-- subagent-persona-injected -->";

export function registerEventHandlers(deps: SubagentDeps): void {
  const { pi, store } = deps;

  pi.on("before_agent_start", async (event, ctx) => {
    // Skip if persona marker already present (avoid double-inject)
    if (event.systemPrompt.includes(PERSONA_MARKER)) return;

    // Find latest PARENT_ENTRY_TYPE entry to determine if this is a sub-trans child session
    let latestParentData: Record<string, unknown> | undefined;
    try {
      const entries: SessionEntry[] = ctx.sessionManager?.getEntries?.() ?? [];
      for (const entry of entries) {
        if (isCustomEntry(entry) && entry.customType === PARENT_ENTRY_TYPE) {
          latestParentData = entry.data as Record<string, unknown> | undefined;
        }
      }
    } catch {
      return;
    }

    const entryData = latestParentData;
    if (!entryData) return;

    // Resolve agent name: data.agent (new entries) or fallback via runId (legacy entries)
    let agentName: string | undefined =
      typeof entryData.agent === "string" ? entryData.agent : undefined;
    if (!agentName && typeof entryData.runId === "number") {
      agentName = store.commandRuns.get(entryData.runId)?.agent;
    }
    if (!agentName) return;

    // Discover agents and find exact match
    const discovery = discoverAgents(ctx.cwd);
    const agentConfig = discovery.agents.find(
      (a) => a.name.toLowerCase() === agentName?.toLowerCase(),
    );
    if (!agentConfig?.systemPrompt?.trim()) return;

    // Prepend persona block with marker
    const personaBlock = `${PERSONA_MARKER}\n${agentConfig.systemPrompt}`;
    return {
      systemPrompt: `${personaBlock}\n\n${event.systemPrompt}`,
    };
  });

  pi.on("session_start", async (_event, ctx) => {
    restoreRunsFromSession(store, ctx, pi);
    registerTerminalInputRedirect(ctx, store);
  });

  pi.on("session_switch", async (_event, ctx) => {
    restoreRunsFromSession(store, ctx, pi);
    registerTerminalInputRedirect(ctx, store);
  });
}
