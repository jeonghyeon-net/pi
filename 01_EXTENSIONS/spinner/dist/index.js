// node_modules/@ryan_nookpi/pi-extension-claude-spinner/index.ts
var SPINNER_FRAMES = ["\xB7", "\u273B", "\u273D", "\u2736", "\u2733", "\u2722"];
var SPINNER_INTERVAL_MS = 120;
function claudeSpinner(pi) {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    const ui = ctx.ui;
    ui.setWorkingIndicator({
      frames: SPINNER_FRAMES.map((frame) => ui.theme.fg("accent", frame)),
      intervalMs: SPINNER_INTERVAL_MS
    });
  });
}
export {
  claudeSpinner as default
};
