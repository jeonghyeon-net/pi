// src/text.ts
function sanitizeNotificationText(text) {
  return text.replace(/[\r\n\t]+/g, " ").replace(/[\x00-\x1f\x7f;]+/g, " ").replace(/ +/g, " ").trim();
}

// src/notify.ts
var FALLBACK_TITLE = "\u03C0";
function notifyOSC777(title, body, write) {
  write(`\x1B]777;notify;${title};${body}\x07`);
}
function notifyOSC99(title, body, write) {
  write(`\x1B]99;i=1:d=0;${title}\x1B\\`);
  if (body) write(`\x1B]99;i=1:p=body;${body}\x1B\\`);
}
function notify(title, body, write = (s) => process.stdout.write(s)) {
  const safeTitle = sanitizeNotificationText(title) || FALLBACK_TITLE;
  const safeBody = sanitizeNotificationText(body);
  if (process.env.KITTY_WINDOW_ID) {
    notifyOSC99(safeTitle, safeBody, write);
  } else {
    notifyOSC777(safeTitle, safeBody, write);
  }
}

// src/hooks.ts
var OVERVIEW_REFRESH_QUEUED_EVENT = "auto-session-title:overview-refresh-queued";
var overviewRefreshes = /* @__PURE__ */ new Map();
var overviewRefreshListening = false;
function rememberOverviewRefresh(sessionId, pending) {
  overviewRefreshes.set(sessionId, pending);
  void pending.finally(() => {
    if (overviewRefreshes.get(sessionId) === pending) overviewRefreshes.delete(sessionId);
  });
}
function createSessionStartHandler(events) {
  return async () => {
    if (overviewRefreshListening) return;
    overviewRefreshListening = true;
    events.on(OVERVIEW_REFRESH_QUEUED_EVENT, (data) => {
      const { sessionId, pending } = data;
      rememberOverviewRefresh(sessionId, pending);
    });
  };
}
function createAgentEndHandler(getOverviewRefresh = (sessionId) => overviewRefreshes.get(sessionId)) {
  return (_event, ctx) => {
    void (async () => {
      await getOverviewRefresh(ctx.sessionManager.getSessionId())?.catch(() => void 0);
      notify(sanitizeNotificationText(ctx.sessionManager.getSessionName() || "") || "\u03C0", "");
    })();
  };
}

// src/index.ts
function index_default(pi) {
  pi.on("session_start", createSessionStartHandler(pi.events));
  pi.on("agent_end", createAgentEndHandler());
}
export {
  index_default as default
};
