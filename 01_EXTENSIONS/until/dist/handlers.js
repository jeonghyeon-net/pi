import { CUSTOM_TYPE } from "./constants.js";
import { setAgentRunning, setUi, clearAllTasks } from "./state.js";
export function handleAgentStart(ctx) {
    setAgentRunning(true);
    if (ctx.hasUI)
        setUi(ctx.ui);
}
export function handleAgentEnd(ctx) {
    setAgentRunning(false);
    if (ctx.hasUI)
        setUi(ctx.ui);
}
export function filterContext(event) {
    const filtered = event.messages.filter((m) => {
        if (m.role !== "custom")
            return true;
        const rec = m;
        return rec.customType !== CUSTOM_TYPE;
    });
    if (filtered.length === event.messages.length)
        return undefined;
    return { messages: filtered };
}
export function handleSessionStart(ctx) {
    clearAllTasks();
    if (ctx.hasUI)
        setUi(ctx.ui);
}
export function handleSessionShutdown() {
    clearAllTasks();
}
