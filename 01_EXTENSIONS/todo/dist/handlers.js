import { restoreFromEntries, buildEntry } from "./state.js";
import { buildTurnContext, buildCompactionReminder } from "./context.js";
import { syncWidget, setAgentRunning, incrementTurn, cleanupWidget } from "./widget.js";
export function onRestore(pi) {
    return async (_e, ctx) => {
        restoreFromEntries(ctx.sessionManager.getBranch());
        syncWidget(ctx, pi);
    };
}
export function onBeforeAgentStart() {
    return async () => {
        const ctx = buildTurnContext();
        if (!ctx)
            return;
        return {
            message: { customType: "todo-context", content: ctx.content, display: ctx.display },
        };
    };
}
export function onAgentStart(pi) {
    return async (_e, ctx) => {
        setAgentRunning(true);
        syncWidget(ctx, pi);
    };
}
export function onAgentEnd(pi) {
    return async (_e, ctx) => {
        setAgentRunning(false);
        pi.appendEntry("todo-state", buildEntry());
        syncWidget(ctx, pi);
    };
}
export function onMessageEnd(pi) {
    return async (_e, ctx) => {
        incrementTurn();
        syncWidget(ctx, pi);
    };
}
export function onCompact(pi) {
    return async (_e, ctx) => {
        restoreFromEntries(ctx.sessionManager.getBranch());
        syncWidget(ctx, pi);
        const reminder = buildCompactionReminder();
        if (!reminder)
            return;
        pi.sendMessage({ customType: "todo-compaction-reminder", content: reminder, display: true }, { deliverAs: "followUp", triggerTurn: true });
    };
}
export function onShutdown() {
    return async (_e, ctx) => {
        cleanupWidget(ctx);
    };
}
