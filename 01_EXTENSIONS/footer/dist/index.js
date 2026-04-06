import { installFooter, teardownFooter } from "./footer.js";
export default function (pi) {
    pi.on("session_start", async (_event, ctx) => {
        installFooter(ctx);
    });
    pi.on("session_tree", async (_event, ctx) => {
        installFooter(ctx);
    });
    pi.on("session_shutdown", async (_event, ctx) => {
        teardownFooter(ctx);
    });
}
