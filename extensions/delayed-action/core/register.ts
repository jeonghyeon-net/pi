import type {
  AgentEndEvent,
  AgentStartEvent,
  ContextEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  InputEvent,
  InputEventResult,
  SessionShutdownEvent,
  SessionStartEvent,
} from "@mariozechner/pi-coding-agent";
import { CUSTOM_TYPE } from "./constants.js";
import type { ReminderManager } from "./manager.js";
import { isOwnCustomMessage } from "./manager.js";
import { DELAY_ONLY_RE, parseReminderRequest } from "./parser.js";

export function registerAll(pi: ExtensionAPI, mgr: ReminderManager): void {
  pi.registerCommand("reminders", {
    description: "List pending reminders",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      mgr.latestCtx = ctx;
      if (mgr.reminders.size === 0) {
        ctx.ui.notify("현재 예약된 reminder가 없어.", "info");
        return;
      }
      pi.sendMessage({
        customType: CUSTOM_TYPE,
        content: `Pending reminders\n\n${mgr.listLines().join("\n")}`,
        display: true,
      });
    },
  });

  pi.registerCommand("reminder-cancel", {
    description: "Cancel reminder by id or all (usage: /reminder-cancel <id|all>)",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      mgr.latestCtx = ctx;
      const raw = args.trim().toLowerCase();
      if (!raw) {
        ctx.ui.notify("Usage: /reminder-cancel <id|all>", "info");
        return;
      }
      if (raw === "all") {
        const count = mgr.reminders.size;
        mgr.clearAll();
        ctx.ui.notify(`reminder ${count}개 취소됨`, "info");
        return;
      }
      const id = Number(raw);
      if (!Number.isInteger(id)) {
        ctx.ui.notify("id는 숫자여야 해. 예: /reminder-cancel 3", "warning");
        return;
      }
      const target = mgr.reminders.get(id);
      if (!target) {
        ctx.ui.notify(`reminder #${id} 없음`, "warning");
        return;
      }
      clearTimeout(target.timer);
      mgr.reminders.delete(id);
      ctx.ui.notify(`reminder #${id} 취소됨`, "info");
    },
  });

  pi.on("input", async (event: InputEvent, ctx: ExtensionContext): Promise<InputEventResult> => {
    mgr.latestCtx = ctx;
    if (event.source === "extension") return { action: "continue" };
    const text = event.text;
    if (DELAY_ONLY_RE.test(text.trim())) {
      if (ctx.hasUI)
        ctx.ui.notify('예약할 작업도 같이 써줘. 예: "10분 있다가 배포 로그 확인해"', "warning");
      return { action: "handled" };
    }
    const parsed = parseReminderRequest(text);
    if (!parsed) return { action: "continue" };
    mgr.schedule(parsed, ctx);
    return { action: "handled" };
  });

  pi.on("agent_start", async (_e: AgentStartEvent, ctx: ExtensionContext) => {
    mgr.agentRunning = true;
    mgr.latestCtx = ctx;
  });
  pi.on("agent_end", async (_e: AgentEndEvent, ctx: ExtensionContext) => {
    mgr.agentRunning = false;
    mgr.latestCtx = ctx;
  });
  pi.on("context", async (event: ContextEvent) => {
    const filtered = event.messages.filter((m) => !isOwnCustomMessage(m));
    if (filtered.length === event.messages.length) return undefined;
    return { messages: filtered };
  });
  pi.on("session_start", async (_e: SessionStartEvent, ctx: ExtensionContext) => {
    mgr.agentRunning = false;
    mgr.latestCtx = ctx;
    mgr.clearAll();
  });
  pi.on("session_shutdown", async (_e: SessionShutdownEvent) => {
    mgr.agentRunning = false;
    mgr.clearAll();
  });
}
