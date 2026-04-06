import { onRestore, onBeforeAgentStart, onAgentStart, onAgentEnd, onMessageEnd, onCompact, onShutdown } from "./handlers.js";
import { createTodoTool } from "./tool.js";
export default function (pi) {
    pi.on("session_start", onRestore(pi));
    pi.on("session_tree", onRestore(pi));
    pi.on("before_agent_start", onBeforeAgentStart());
    pi.on("agent_start", onAgentStart(pi));
    pi.on("agent_end", onAgentEnd(pi));
    pi.on("message_end", onMessageEnd(pi));
    pi.on("session_compact", onCompact(pi));
    pi.on("session_shutdown", onShutdown());
    pi.registerTool(createTodoTool(pi));
}
