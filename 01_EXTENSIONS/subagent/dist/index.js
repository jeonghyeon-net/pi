import { createTool } from "./tool.js";
import { restoreRuns, buildRunsEntry } from "./session.js";
import { syncWidget } from "./widget.js";
import { listRuns } from "./store.js";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
export default function (pi) {
    pi.on("session_start", async (_event, ctx) => {
        restoreRuns(ctx.sessionManager.getBranch());
        syncWidget(ctx, listRuns());
    });
    pi.on("session_tree", async (_event, ctx) => {
        restoreRuns(ctx.sessionManager.getBranch());
        syncWidget(ctx, listRuns());
    });
    pi.on("agent_end", async (_event, ctx) => {
        pi.appendEntry("subagent-runs", buildRunsEntry());
        syncWidget(ctx, listRuns());
    });
    pi.registerTool(createTool(pi, join(dirname(fileURLToPath(import.meta.url)), "..", "agents")));
}
