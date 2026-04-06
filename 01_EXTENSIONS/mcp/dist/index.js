// src/logger-format.ts
var LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 };
function shouldLog(level, minLevel) {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}
function formatEntry(level, message, context) {
  const prefix = `[mcp:${level}]`;
  const ctxStr = context ? Object.entries(context).filter(([, v]) => v !== void 0).map(([k, v]) => `${k}=${v}`).join(" ") : "";
  return ctxStr ? `${prefix} ${message} (${ctxStr})` : `${prefix} ${message}`;
}

// src/logger.ts
function createLogger(minLevel, context) {
  const log = (level, msg) => {
    if (!shouldLog(level, minLevel)) return;
    const line = formatEntry(level, msg, context);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  };
  return {
    debug: (msg) => log("debug", msg),
    info: (msg) => log("info", msg),
    warn: (msg) => log("warn", msg),
    error: (msg) => log("error", msg),
    child: (ctx) => createLogger(minLevel, { ...context, ...ctx })
  };
}

// src/index.ts
function index_default(pi) {
  createLogger("info", { ext: "mcp" });
}
export {
  index_default as default
};
