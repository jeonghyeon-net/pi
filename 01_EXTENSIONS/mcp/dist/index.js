// src/proxy-router.ts
import { Type } from "@sinclair/typebox";
var ProxySchema = Type.Object({
  action: Type.Union([
    Type.Literal("call"),
    Type.Literal("list"),
    Type.Literal("describe"),
    Type.Literal("search"),
    Type.Literal("status"),
    Type.Literal("connect")
  ]),
  tool: Type.Optional(Type.String({ description: "Tool name (for call/describe)" })),
  args: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Tool arguments (for call)" })),
  server: Type.Optional(Type.String({ description: "Target server (for list/connect/call)" })),
  query: Type.Optional(Type.String({ description: "Search query (for search)" }))
});
function routeAction(params, deps) {
  switch (params.action) {
    case "search":
      return Promise.resolve(deps.search(params.query));
    case "list":
      return Promise.resolve(deps.list(params.server));
    case "describe":
      return Promise.resolve(deps.describe(params.tool));
    case "status":
      return Promise.resolve(deps.status());
    case "connect":
      return deps.connect(params.server);
    case "call": {
      if (!params.tool) {
        return Promise.resolve(text("Tool name is required for call action."));
      }
      return deps.call(params.tool, params.args);
    }
  }
}
var FALLBACK_DESC = "MCP proxy tool. Actions: call, list, describe, search, status, connect.";
var noServers = () => ({ content: [{ type: "text", text: "No servers." }] });
var noServersAsync = () => Promise.resolve(noServers());
var EMPTY_DEPS = {
  search: noServers,
  list: noServers,
  describe: noServers,
  status: noServers,
  call: noServersAsync,
  connect: noServersAsync
};
function createProxyTool(_pi, buildDesc, makeDeps) {
  return {
    name: "mcp",
    label: "MCP",
    description: FALLBACK_DESC,
    parameters: ProxySchema,
    execute: async (_toolCallId, params) => {
      const result = await routeAction(params, makeDeps ? makeDeps() : EMPTY_DEPS);
      const desc = buildDesc ? buildDesc() : void 0;
      return { ...result, details: { ...result.details, ...desc ? { description: desc } : {} } };
    }
  };
}
function text(msg) {
  return { content: [{ type: "text", text: msg }] };
}

// src/cmd-info.ts
function formatStatus(conns, cfg, meta, getFailureFn) {
  const names = Object.keys(cfg.mcpServers);
  if (names.length === 0) return "No servers configured.";
  return names.map((n) => statusLine(n, conns, meta, getFailureFn)).join("\n");
}
function statusLine(name, conns, meta, getFailureFn) {
  const conn = conns.get(name);
  const tools = meta.get(name) ?? [];
  const count = tools.length;
  const toolStr = count === 1 ? "1 tool" : `${count} tools`;
  if (!conn) return `  \u25CB ${name} (not connected) ${toolStr}`;
  if (conn.status === "connected") return `  \u2713 ${name} ${toolStr}`;
  const fail = getFailureFn(name);
  const ago = fail ? ` (${formatAgo(fail.at)})` : "";
  return `  \u2717 ${name} failed${ago} ${toolStr}`;
}
function formatAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1e3);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
function formatTools(meta, server) {
  if (server) {
    const tools = meta.get(server);
    if (!tools || tools.length === 0) return `No tools found for "${server}".`;
    return toolList(server, tools);
  }
  const entries = [...meta.entries()];
  if (entries.length === 0) return "No tools available.";
  return entries.map(([s, t]) => toolList(s, t)).join("\n\n");
}
function toolList(server, tools) {
  const header = `[${server}]`;
  const lines = tools.map((t) => `  ${t.originalName} - ${t.description}`);
  return [header, ...lines].join("\n");
}

// src/cmd-server.ts
async function handleConnect(name, cfg, connectFn, notify) {
  const entry = cfg.mcpServers[name];
  if (!entry) {
    notify(`Server "${name}" not found in config.`, "error");
    return;
  }
  try {
    await connectFn(name, entry);
    notify(`Connected to "${name}".`, "info");
  } catch (err) {
    notify(`Failed to connect "${name}": ${errorMsg(err)}`, "error");
  }
}
async function handleDisconnect(name, closeFn, notify) {
  try {
    await closeFn(name);
    notify(`Disconnected from "${name}".`, "info");
  } catch (err) {
    notify(`Failed to disconnect "${name}": ${errorMsg(err)}`, "error");
  }
}
async function handleReconnect(name, cfg, closeFn, connectFn, notify) {
  const targets = name ? [name] : Object.keys(cfg.mcpServers);
  if (name && !cfg.mcpServers[name]) {
    notify(`Server "${name}" not found in config.`, "error");
    return;
  }
  for (const n of targets) {
    try {
      await closeFn(n);
      await connectFn(n, cfg.mcpServers[n]);
      notify(`Reconnected to "${n}".`, "info");
    } catch (err) {
      notify(`Failed to reconnect "${n}": ${errorMsg(err)}`, "error");
    }
  }
}
function errorMsg(err) {
  return err instanceof Error ? err.message : String(err);
}

// src/cmd-auth.ts
function handleAuth(name, cfg, oauthDir, notify) {
  const entry = cfg.mcpServers[name];
  if (!entry) {
    notify(`Server "${name}" not found in config.`, "error");
    return;
  }
  if (entry.auth === "oauth") {
    showOAuthInstructions(name, oauthDir, notify);
    return;
  }
  if (entry.auth === "bearer") {
    showBearerInstructions(name, entry, notify);
    return;
  }
  notify(`Server "${name}" is not configured for OAuth or bearer auth.`, "error");
}
function showOAuthInstructions(name, oauthDir, notify) {
  const tokenPath = `${oauthDir}/${name}/tokens.json`;
  const msg = [
    `OAuth setup for "${name}":`,
    "",
    "1. Complete the OAuth flow for this server",
    `2. Place token file at: ${tokenPath}`,
    "",
    'Token file format: { "access_token": "...", "token_type": "bearer" }',
    'Optional: "expiresAt" (epoch ms) for expiry checking'
  ].join("\n");
  notify(msg, "info");
}
function showBearerInstructions(name, entry, notify) {
  const source = entry.bearerTokenEnv ? `Set env var: ${entry.bearerTokenEnv}` : "Token set via bearerToken field in config";
  const msg = [
    `Auth for "${name}" uses bearer token.`,
    "",
    source
  ].join("\n");
  notify(msg, "info");
}

// src/cmd-search.ts
function formatSearchResults(meta, query, matchFn) {
  const hits = collectHits(meta, matchFn);
  if (hits.length === 0) return `No tools matching "${query}".`;
  const header = `Search results for "${query}" (${hits.length} found):`;
  const grouped = groupByServer(hits);
  const sections = grouped.map(([server, tools]) => formatGroup(server, tools));
  return [header, "", ...sections].join("\n");
}
function collectHits(meta, matchFn) {
  const hits = [];
  for (const [server, tools] of meta) {
    for (const tool of tools) {
      if (matchFn(tool.originalName)) hits.push({ tool, server });
    }
  }
  return hits;
}
function groupByServer(hits) {
  const map = /* @__PURE__ */ new Map();
  for (const h of hits) {
    const list = map.get(h.server) ?? [];
    list.push(h.tool);
    map.set(h.server, list);
  }
  return [...map.entries()];
}
function formatGroup(server, tools) {
  const lines = tools.map((t) => `  ${t.originalName} - ${t.description}`);
  return [`[${server}]`, ...lines].join("\n");
}

// src/search.ts
function normalize(s) {
  return s.toLowerCase().replace(/[-_]/g, "");
}
function tryRegex(pattern) {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}
function matchTool(toolName, query) {
  if (!query) return false;
  if (query.startsWith("/") && query.endsWith("/") && query.length > 2) {
    const re = tryRegex(query.slice(1, -1));
    if (re) return re.test(toolName);
    return false;
  }
  return normalize(toolName).includes(normalize(query));
}

// src/constants.ts
var METADATA_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
var NPX_CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
var DEFAULT_IDLE_TIMEOUT_MS = 10 * 60 * 1e3;
var KEEPALIVE_INTERVAL_MS = 30 * 1e3;
var MCP_CONFIG_FLAG = {
  description: "Path to MCP config file",
  type: "string"
};
var OAUTH_TOKEN_DIR = "~/.pi/agent/mcp-oauth";

// src/state.ts
var config = null;
var connections = /* @__PURE__ */ new Map();
var metadata = /* @__PURE__ */ new Map();
function getConfig() {
  return config;
}
function getConnections() {
  return connections;
}
function getAllMetadata() {
  return metadata;
}

// src/failure-tracker.ts
var failures = /* @__PURE__ */ new Map();
function getFailure(server) {
  return failures.get(server);
}
var MAX_BACKOFF_MS = 5 * 60 * 1e3;

// src/cmd-router.ts
var VALID_CMDS = /* @__PURE__ */ new Set(["status", "tools", "connect", "disconnect", "reconnect", "auth", "search"]);
function parseSubcommand(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return { cmd: "help", arg: void 0 };
  const spaceIdx = trimmed.indexOf(" ");
  const cmd = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const arg = spaceIdx === -1 ? void 0 : trimmed.slice(spaceIdx + 1).trim();
  if (!VALID_CMDS.has(cmd)) return { cmd: "help", arg: void 0 };
  return { cmd, arg };
}
function createMcpCommand(_pi, connectFn, closeFn) {
  return {
    description: "MCP server management",
    handler: async (args, ctx) => {
      const { cmd, arg } = parseSubcommand(args);
      const notify = ctx.ui.notify.bind(ctx.ui);
      const cfg = getConfig() ?? { mcpServers: {} };
      const doConnect = connectFn ?? noopConnect;
      const doClose = closeFn ?? noopClose;
      await routeCommand(cmd, arg, cfg, notify, doConnect, doClose);
    }
  };
}
async function routeCommand(cmd, arg, cfg, notify, connectFn, closeFn) {
  if (cmd === "status") {
    notify(formatStatus(getConnections(), cfg, getAllMetadata(), getFailure), "info");
  } else if (cmd === "tools") {
    notify(formatTools(getAllMetadata(), arg), "info");
  } else if (cmd === "connect") {
    if (!arg) {
      notify("Usage: /mcp connect <server>", "error");
      return;
    }
    await handleConnect(arg, cfg, connectFn, notify);
  } else if (cmd === "disconnect") {
    if (!arg) {
      notify("Usage: /mcp disconnect <server>", "error");
      return;
    }
    await handleDisconnect(arg, closeFn, notify);
  } else if (cmd === "reconnect") {
    await handleReconnect(arg, cfg, closeFn, connectFn, notify);
  } else if (cmd === "auth") {
    if (!arg) {
      notify("Usage: /mcp auth <server>", "error");
      return;
    }
    handleAuth(arg, cfg, OAUTH_TOKEN_DIR, notify);
  } else if (cmd === "search") {
    if (!arg) {
      notify("Usage: /mcp search <query>", "error");
      return;
    }
    notify(formatSearchResults(getAllMetadata(), arg, (n) => matchTool(n, arg)), "info");
  } else {
    showHelp(notify);
  }
}
function showHelp(notify) {
  notify([
    "Usage: /mcp <subcommand>",
    "  status              - Server connection status",
    "  tools [server]      - List available tools",
    "  connect <server>    - Connect to a server",
    "  disconnect <server> - Disconnect from a server",
    "  reconnect [server]  - Reconnect (all or specific)",
    "  auth <server>       - Auth setup instructions",
    "  search <query>      - Search tools across servers"
  ].join("\n"), "info");
}
async function noopConnect() {
}
async function noopClose() {
}

// src/lifecycle-init.ts
function classifyServers(config2) {
  const eager = [];
  const lazy = [];
  for (const [name, entry] of Object.entries(config2.mcpServers)) {
    const mode = entry.lifecycle ?? "lazy";
    if (mode === "lazy") lazy.push({ name, entry, mode });
    else eager.push({ name, entry, mode });
  }
  return { eager, lazy };
}
async function connectAndDiscover(gen, server, deps) {
  try {
    const conn = await deps.connectServer(server.name, server.entry);
    if (deps.getGeneration() !== gen) return;
    deps.setConnection(server.name, conn);
    try {
      const tools = await deps.buildMetadata(server.name, conn.client);
      if (deps.getGeneration() !== gen) return;
      deps.setMetadata(server.name, tools);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      deps.logger.warn(`Tool discovery failed for ${server.name}: ${msg}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.logger.warn(`Failed to connect ${server.name}: ${msg}`);
  }
}
function onSessionStart(pi, deps) {
  return async (_event, _ctx) => {
    if (!deps) return;
    const gen = deps.incrementGeneration();
    deps.logger.info("Session start: loading config");
    let config2;
    try {
      config2 = deps.mergeConfigs(await deps.loadConfig());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      deps.logger.error(`Config load failed: ${msg}`);
      return;
    }
    deps.setConfig(config2);
    const hash = deps.computeHash(config2);
    const cache = deps.loadCache();
    const cacheHit = deps.isCacheValid(cache, hash);
    const { eager } = classifyServers(config2);
    const total = Object.keys(config2.mcpServers).length;
    const toConnect = cacheHit ? [] : eager;
    await Promise.allSettled(toConnect.map((s) => connectAndDiscover(gen, s, deps)));
    if (deps.getGeneration() !== gen) return;
    const directSpecs = deps.resolveDirectTools(deps.getAllMetadata(), config2);
    const deduped = deps.deduplicateTools(directSpecs);
    deps.registerDirectTools(pi, deduped, deps);
    deps.startIdleTimer(config2);
    deps.startKeepalive(config2);
    deps.saveCache(hash, deps.getAllMetadata()).catch(() => {
    });
    deps.updateFooter();
    deps.logger.info(`Session started: ${eager.length}/${total} servers connected`);
  };
}

// src/lifecycle-shutdown.ts
function isShutdownOps(v) {
  return typeof v === "object" && v !== null && "closeAll" in v;
}
function onSessionShutdown(opsOrPi) {
  const ops = isShutdownOps(opsOrPi) ? opsOrPi : void 0;
  return async (_event, _ctx) => {
    if (!ops) return;
    ops.logger.info("Session shutdown starting");
    ops.stopIdle();
    ops.stopKeepalive();
    try {
      await ops.saveCache();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ops.logger.error(`Cache save failed: ${msg}`);
    }
    try {
      await ops.closeAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ops.logger.error(`Close connections failed: ${msg}`);
    }
    ops.resetState();
    ops.logger.info("Session shutdown complete");
  };
}

// src/index.ts
function index_default(pi) {
  pi.registerTool(createProxyTool(pi));
  pi.registerCommand("mcp", createMcpCommand(pi));
  pi.registerFlag("mcp-config", MCP_CONFIG_FLAG);
  pi.on("session_start", onSessionStart(pi));
  pi.on("session_shutdown", onSessionShutdown(pi));
}
export {
  index_default as default
};
