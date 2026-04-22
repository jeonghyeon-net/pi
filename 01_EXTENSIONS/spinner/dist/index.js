// src/frames.ts
var GHOSTTY = ["\xB7", "\u2722", "\u2733", "\u2736", "\u273B", "*"];
var DARWIN = ["\xB7", "\u2722", "\u2733", "\u2736", "\u273B", "\u273D"];
var OTHER = ["\xB7", "\u2722", "*", "\u2736", "\u273B", "\u273D"];
var SPINNER_INTERVAL_MS = 120;
function getSpinnerFrames(term = process.env.TERM, platform = process.platform) {
  const chars = term === "xterm-ghostty" ? GHOSTTY : platform === "darwin" ? DARWIN : OTHER;
  return [...chars, ...[...chars].reverse()];
}

// src/session-start.ts
function onSessionStart(_event, ctx) {
  if (!ctx.hasUI) return;
  ctx.ui.setWorkingIndicator({
    frames: getSpinnerFrames().map((frame) => ctx.ui.theme.fg("accent", frame)),
    intervalMs: SPINNER_INTERVAL_MS
  });
}

// src/index.ts
function index_default(_pi) {
  _pi.on("session_start", onSessionStart);
}
export {
  index_default as default
};
