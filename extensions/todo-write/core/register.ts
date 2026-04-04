import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { TODO_COMPACTION_REMINDER_TYPE, TODO_WIDGET_KEY } from "./constants.js";
import { applyTodoWrite, getWidgetVisibility } from "./logic.js";
import { clearState, persistStateEntry, restoreState } from "./persistence.js";
import { buildPostCompactionReminder, buildTurnContext, renderSummary } from "./render.js";
import {
  deleteAgentRunning,
  deleteTurn,
  deleteWidgetMeta,
  getStateKey,
  getTurn,
  getWidgetMeta,
  incrementTurn,
  readState,
  setAgentRunning,
  writeState,
} from "./state.js";
import { TOOL_DESCRIPTION, TodoWriteParams, type TodoWriteParamsType } from "./tool-schema.js";
import { clearHideTimer, clearWidgetTimer, syncWidget } from "./widget.js";

export function registerAll(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "todo_write",
    label: "Todo Write",
    description: TOOL_DESCRIPTION,
    parameters: TodoWriteParams,
    async execute(_toolCallId, params: TodoWriteParamsType, _signal, _onUpdate, ctx) {
      const applied = applyTodoWrite(params.todos);
      const summary = renderSummary(applied);
      writeState(ctx, applied);
      persistStateEntry(pi, applied);
      await syncWidget(ctx, pi);
      return {
        content: [{ type: "text" as const, text: summary }],
        details: { tasks: applied.tasks, summary },
      };
    },
    renderResult(result, { expanded }, theme) {
      if (!expanded) return new Text("", 0, 0);
      const details = result.details as { summary?: unknown } | undefined;
      const summary = typeof details?.summary === "string" ? details.summary : "";
      return new Text(summary ? theme.fg("toolOutput", summary) : "", 0, 0);
    },
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    const state = readState(ctx);
    if (state.tasks.length === 0) return;
    const key = getStateKey(ctx);
    const visibility = getWidgetVisibility(state, getWidgetMeta(key), getTurn(key), Date.now());
    if (visibility.hidden) {
      clearState(ctx, pi);
      deleteWidgetMeta(key);
      return;
    }
    const content = buildTurnContext(state);
    if (!content) return;
    return {
      message: {
        customType: "todo-write-context",
        content,
        display: false,
        details: { summary: renderSummary(state) },
      },
    };
  });

  pi.on("agent_start", async (_event, ctx) => {
    setAgentRunning(ctx, true);
    await syncWidget(ctx, pi);
  });

  pi.on("agent_end", async (_event, ctx) => {
    setAgentRunning(ctx, false);
    await syncWidget(ctx, pi);
  });

  pi.on("session_start", async (_event, ctx) => {
    setAgentRunning(ctx, false);
    restoreState(ctx);
    await syncWidget(ctx, pi);
  });

  pi.on("session_tree", async (_event, ctx) => {
    setAgentRunning(ctx, false);
    restoreState(ctx);
    await syncWidget(ctx, pi);
  });

  pi.on("session_compact", async (_event, ctx) => {
    const state = restoreState(ctx);
    await syncWidget(ctx, pi);
    const reminder = buildPostCompactionReminder(state);
    if (!reminder) return;
    if (ctx.hasUI) {
      ctx.ui.notify("Todo reminder: remaining items still exist after compaction.", "info");
    }
    pi.sendMessage(
      {
        customType: TODO_COMPACTION_REMINDER_TYPE,
        content: reminder,
        display: true,
        details: { summary: renderSummary(state) },
      },
      { deliverAs: "followUp", triggerTurn: true },
    );
  });

  pi.on("message_end", async (_event, ctx) => {
    incrementTurn(ctx);
    await syncWidget(ctx, pi);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    const key = getStateKey(ctx);
    clearWidgetTimer();
    clearHideTimer(key);
    deleteWidgetMeta(key);
    deleteAgentRunning(key);
    deleteTurn(key);
    if (!ctx.hasUI) return;
    ctx.ui.setWidget(TODO_WIDGET_KEY, undefined);
  });
}
