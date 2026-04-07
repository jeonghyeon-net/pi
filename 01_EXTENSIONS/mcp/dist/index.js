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
    promptSnippet: "MCP gateway - connect to MCP servers and call their tools",
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
async function handleReconnect(name, cfg, closeFn, connectFn, notify, updateFooter) {
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
  if (updateFooter) updateFooter();
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
var BUILTIN_TOOL_NAMES = /* @__PURE__ */ new Set([
  "read",
  "bash",
  "edit",
  "write",
  "grep",
  "find",
  "ls",
  "mcp"
]);
var MCP_CONFIG_FLAG = {
  description: "Path to MCP config file",
  type: "string"
};
var DEFAULT_USER_CONFIG = "~/.pi/agent/mcp.json";
var DEFAULT_PROJECT_CONFIG = ".pi/mcp.json";
var CACHE_FILE_PATH = "~/.pi/agent/mcp-cache.json";
var OAUTH_TOKEN_DIR = "~/.pi/agent/mcp-oauth";
var HASH_EXCLUDE_FIELDS = /* @__PURE__ */ new Set(["lifecycle", "idleTimeout", "debug"]);

// src/state.ts
var generation = 0;
var config = null;
var connections = /* @__PURE__ */ new Map();
var metadata = /* @__PURE__ */ new Map();
function getGeneration() {
  return generation;
}
function incrementGeneration() {
  return ++generation;
}
function getConfig() {
  return config;
}
function setConfig(c) {
  config = c;
}
function getConnections() {
  return connections;
}
function setConnection(name, conn) {
  connections.set(name, conn);
}
function removeConnection(name) {
  connections.delete(name);
}
function getMetadata(server) {
  return metadata.get(server);
}
function setMetadata(server, tools) {
  metadata.set(server, tools);
}
function getAllMetadata() {
  return metadata;
}
function resetState() {
  generation = 0;
  config = null;
  connections.clear();
  metadata.clear();
}

// src/failure-tracker.ts
var failures = /* @__PURE__ */ new Map();
function getFailure(server) {
  return failures.get(server);
}
var BASE_BACKOFF_MS = 1e3;
var MAX_BACKOFF_MS = 5 * 60 * 1e3;
function getBackoffMs(server) {
  const record = failures.get(server);
  if (!record) return 0;
  return Math.min(BASE_BACKOFF_MS * Math.pow(2, record.count), MAX_BACKOFF_MS);
}

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
    (mode === "lazy" ? lazy : eager).push({ name, entry, mode });
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
      config2 = deps.applyDirectToolsEnv(deps.mergeConfigs(await deps.loadConfig()));
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

// src/errors.ts
var McpError = class extends Error {
  code;
  hint;
  context;
  constructor(code, message, opts) {
    super(message, opts?.cause ? { cause: opts.cause } : void 0);
    this.name = "McpError";
    this.code = code;
    this.hint = opts?.hint;
    this.context = {
      server: opts?.server,
      tool: opts?.tool,
      uri: opts?.uri
    };
  }
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      hint: this.hint,
      context: this.context
    };
  }
};
function mcpError(code, message, opts) {
  return new McpError(code, message, opts);
}

// src/pagination.ts
var DEFAULT_MAX_PAGES = 100;
async function paginateAll(fetcher, maxPages = DEFAULT_MAX_PAGES) {
  const all = [];
  let cursor;
  let pages = 0;
  do {
    const result = await fetcher(cursor);
    all.push(...result.items);
    cursor = result.nextCursor;
    pages++;
  } while (cursor && pages < maxPages);
  return all;
}

// src/env.ts
var ENV_RE = /\$\{([^}]+)\}/g;
function interpolateEnv(text4, vars) {
  return text4.replace(ENV_RE, (match, name) => {
    const val = vars[name];
    return val !== void 0 ? val : match;
  });
}

// src/server-connect.ts
async function discoverTools(client) {
  return paginateAll(async (cursor) => {
    const r = await client.listTools(cursor ? { cursor } : void 0);
    return { items: r.tools, nextCursor: r.nextCursor };
  });
}
async function discoverResources(client) {
  return paginateAll(async (cursor) => {
    const r = await client.listResources(cursor ? { cursor } : void 0);
    return { items: r.resources, nextCursor: r.nextCursor };
  });
}
async function connectServer(name, entry, deps) {
  const interpolatedHeaders = entry.headers ? Object.fromEntries(Object.entries(entry.headers).map(
    ([k, v]) => [k, interpolateEnv(v, deps.processEnv)]
  )) : void 0;
  const transport = entry.command ? deps.createStdioTransport(entry, deps.processEnv) : entry.url ? await deps.createHttpTransport(entry.url, interpolatedHeaders) : null;
  if (!transport) {
    throw mcpError("no_transport", `Server "${name}" has no command or url`);
  }
  const client = deps.createClient();
  await client.connect(transport);
  const [tools, resources] = await Promise.all([
    discoverTools(client),
    discoverResources(client)
  ]);
  return {
    name,
    client,
    transport,
    status: "connected",
    lastUsedAt: Date.now(),
    inFlight: 0,
    tools,
    resources
  };
}

// src/lifecycle-idle.ts
var timer = null;
function checkIdle(opts) {
  const now = Date.now();
  for (const [name, conn] of opts.connections) {
    if (conn.status !== "connected") continue;
    const serverDef = opts.servers[name];
    if (serverDef?.lifecycle === "keep-alive") continue;
    const timeout = serverDef?.idleTimeout ?? opts.timeoutMs;
    if (conn.inFlight > 0) continue;
    if (now - conn.lastUsedAt > timeout) {
      opts.logger?.info(`Closing idle server: ${name}`);
      opts.closeFn(name).catch(() => {
      });
    }
  }
}
function startIdleTimer(opts) {
  stopIdleTimer();
  timer = setInterval(() => checkIdle(opts), opts.intervalMs);
}
function stopIdleTimer() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

// src/lifecycle-keepalive.ts
var timer2 = null;
async function pingAll(opts) {
  for (const [name, conn] of opts.connections) {
    if (conn.status !== "connected") continue;
    if (opts.servers[name]?.lifecycle !== "keep-alive") continue;
    try {
      await conn.client.ping();
      opts.logger?.debug(`Ping OK: ${name}`);
    } catch {
      opts.logger?.warn(`Ping failed, reconnecting: ${name}`);
      opts.reconnectFn(name).catch(() => {
      });
    }
  }
}
function startKeepalive(opts) {
  stopKeepalive();
  timer2 = setInterval(() => {
    pingAll(opts).catch(() => {
    });
  }, opts.intervalMs);
}
function stopKeepalive() {
  if (timer2 !== null) {
    clearInterval(timer2);
    timer2 = null;
  }
}

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

// src/config-load.ts
var EMPTY_CONFIG = { mcpServers: {} };
function loadConfigFile(path, fs) {
  if (!fs.exists(path)) return { ...EMPTY_CONFIG };
  const raw = fs.readFile(path);
  if (!raw.trim()) return { ...EMPTY_CONFIG };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw mcpError("config_parse", `Invalid JSON in ${path}`, {
      hint: "Check the config file for syntax errors"
    });
  }
  return normalizeConfig(parsed);
}
function normalizeConfig(raw) {
  const servers = raw.mcpServers ?? raw["mcp-servers"] ?? {};
  return {
    mcpServers: servers,
    imports: raw.imports,
    settings: raw.settings
  };
}

// src/config-imports.ts
function getImportPath(kind, platform, home) {
  const sep = platform === "win32" ? "\\" : "/";
  const join = (...parts) => parts.join(sep);
  const appData = platform === "win32" ? join(home, "AppData", "Roaming") : "";
  const configDir = platform === "linux" ? join(home, ".config") : "";
  const libSupport = platform === "darwin" ? join(home, "Library", "Application Support") : "";
  const paths = {
    cursor: join(home, ".cursor", "mcp.json"),
    "claude-code": join(home, ".claude", "claude_desktop_config.json"),
    "claude-desktop": platform === "darwin" ? join(libSupport, "Claude", "claude_desktop_config.json") : platform === "linux" ? join(configDir, "Claude", "claude_desktop_config.json") : join(appData, "Claude", "claude_desktop_config.json"),
    codex: join(home, ".codex", "mcp.json"),
    windsurf: platform === "darwin" ? join(libSupport, "Windsurf", "mcp.json") : platform === "linux" ? join(configDir, "Windsurf", "mcp.json") : join(appData, "Windsurf", "mcp.json"),
    vscode: platform === "darwin" ? join(libSupport, "Code", "User", "mcp.json") : platform === "linux" ? join(configDir, "Code", "User", "mcp.json") : join(appData, "Code", "User", "mcp.json")
  };
  return paths[kind];
}
function loadImportedConfigs(imports, fs, platform, home) {
  const servers = {};
  const provenance = {};
  for (const kind of imports) {
    const path = getImportPath(kind, platform, home);
    const config2 = loadConfigFile(path, fs);
    for (const [name, entry] of Object.entries(config2.mcpServers)) {
      if (servers[name] === void 0) {
        servers[name] = entry;
        provenance[name] = { path, kind: "import", importKind: kind };
      }
    }
  }
  return { servers, provenance };
}

// src/config-merge.ts
function mergeConfigs(user, imports, project, userPath, projectPath) {
  const servers = {};
  const provenance = {};
  for (const [name, entry] of Object.entries(user.mcpServers)) {
    servers[name] = entry;
    provenance[name] = { path: userPath ?? "", kind: "user" };
  }
  for (const [name, entry] of Object.entries(imports.servers)) {
    if (servers[name] === void 0) {
      servers[name] = entry;
      provenance[name] = imports.provenance[name];
    }
  }
  for (const [name, entry] of Object.entries(project.mcpServers)) {
    servers[name] = entry;
    provenance[name] = { path: projectPath ?? "", kind: "project" };
  }
  const settings = mergeSettings(user.settings, project.settings);
  return { config: { mcpServers: servers, settings }, provenance };
}
function mergeSettings(user, project) {
  if (!user && !project) return void 0;
  return { ...user, ...project };
}

// src/tool-collision.ts
function applyPrefix(serverName, toolName, strategy) {
  switch (strategy) {
    case "server":
      return `${serverName}_${toolName}`;
    case "short":
      return `${serverName.slice(0, 2)}_${toolName}`;
    case "none":
      return toolName;
  }
}
function checkCollision(name, registered, warn) {
  if (BUILTIN_TOOL_NAMES.has(name)) {
    warn(`Skipping tool "${name}": conflicts with builtin tool`);
    return { collision: true, reason: "builtin" };
  }
  if (registered.has(name)) {
    warn(`Tool "${name}" already registered by another server`);
    return { collision: true, reason: "duplicate" };
  }
  return { collision: false };
}

// src/tool-direct.ts
function shouldPromote(tool, directTools) {
  return directTools === true || directTools.includes(tool.originalName);
}
function resolveOneTool(tool, prefix, registered, warn) {
  let prefixed = applyPrefix(tool.serverName, tool.originalName, prefix);
  const check = checkCollision(prefixed, registered, warn);
  if (check.collision) {
    if (prefix !== "none") return null;
    prefixed = applyPrefix(tool.serverName, tool.originalName, "server");
    const recheck = checkCollision(prefixed, registered, warn);
    if (recheck.collision) return null;
  }
  return {
    serverName: tool.serverName,
    originalName: tool.originalName,
    prefixedName: prefixed,
    description: tool.description,
    inputSchema: tool.inputSchema,
    resourceUri: tool.resourceUri
  };
}
function resolveDirectTools(tools, directTools, prefix, registered, warn) {
  if (directTools === false) return [];
  const result = [];
  for (const tool of tools) {
    if (!shouldPromote(tool, directTools)) continue;
    const spec = resolveOneTool(tool, prefix, registered, warn);
    if (spec) {
      registered.add(spec.prefixedName);
      result.push(spec);
    }
  }
  return result;
}
function applyDirectToolsEnv(config2, envVal) {
  const parsed = parseDirectToolsEnv(envVal);
  if (parsed === void 0) return config2;
  if (parsed === false) {
    for (const entry of Object.values(config2.mcpServers)) entry.directTools = false;
    return config2;
  }
  for (const [server, val] of parsed) {
    const entry = config2.mcpServers[server];
    if (entry) entry.directTools = val;
  }
  return config2;
}
function parseDirectToolsEnv(envVal) {
  if (!envVal || envVal.trim() === "") return void 0;
  if (envVal === "__none__") return false;
  const map = /* @__PURE__ */ new Map();
  for (const part of envVal.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const slashIdx = trimmed.indexOf("/");
    if (slashIdx === -1) {
      map.set(trimmed, true);
    } else {
      const server = trimmed.slice(0, slashIdx);
      const tool = trimmed.slice(slashIdx + 1);
      const existing = map.get(server);
      if (Array.isArray(existing)) {
        existing.push(tool);
      } else {
        map.set(server, [tool]);
      }
    }
  }
  return map;
}

// src/config-hash.ts
import { createHash } from "node:crypto";
function stripExcluded(entry) {
  const result = {};
  for (const [key, value] of Object.entries(entry)) {
    if (!HASH_EXCLUDE_FIELDS.has(key)) {
      result[key] = value;
    }
  }
  return result;
}
function stableStringify(config2) {
  const sorted = {};
  for (const name of Object.keys(config2.mcpServers).sort()) {
    sorted[name] = stripExcluded(config2.mcpServers[name]);
  }
  return JSON.stringify(sorted);
}
function computeConfigHash(config2) {
  return createHash("sha256").update(stableStringify(config2)).digest("hex");
}

// src/cache-metadata.ts
function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function validateCache(parsed) {
  if (!isRecord(parsed)) return null;
  if (typeof parsed.version !== "number") return null;
  if (typeof parsed.configHash !== "string") return null;
  if (!isRecord(parsed.servers)) return null;
  return {
    version: parsed.version,
    servers: parsed.servers,
    configHash: parsed.configHash
  };
}
function loadMetadataCache(path, fs) {
  if (!fs.existsSync(path)) return null;
  try {
    const raw = fs.readFileSync(path);
    return validateCache(JSON.parse(raw));
  } catch {
    return null;
  }
}
function saveMetadataCache(path, cache, fs) {
  const tmp = `${path}.${fs.getPid()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache));
  fs.renameSync(tmp, path);
}
function isMetadataCacheValid(cache, configHash, now) {
  if (!cache) return false;
  if (cache.configHash !== configHash) return false;
  return hasAnyFreshEntry(cache.servers, now());
}
function isServerCacheFresh(entry, now) {
  if (!entry) return false;
  return now - entry.savedAt < METADATA_CACHE_TTL_MS;
}
function hasAnyFreshEntry(servers, now) {
  for (const entry of Object.values(servers)) {
    if (isServerCacheFresh(entry, now)) return true;
  }
  return Object.keys(servers).length === 0;
}

// src/wire-init-config.ts
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
function resolve(p) {
  return p.startsWith("~") ? p.replace("~", homedir()) : p;
}
var fsOps = {
  readFile: (p) => readFileSync(p, "utf-8"),
  exists: (p) => existsSync(p)
};
var cacheFs = {
  existsSync: (p) => existsSync(p),
  readFileSync: (p) => readFileSync(p, "utf-8"),
  writeFileSync: (p, d) => writeFileSync(p, d, "utf-8"),
  renameSync: (s, d) => renameSync(s, d),
  getPid: () => process.pid
};
function wireLoadConfig() {
  return async () => loadConfigFile(resolve(DEFAULT_USER_CONFIG), fsOps);
}
function wireMergeConfigs() {
  return (config2) => {
    const imports = config2.imports ? loadImportedConfigs(config2.imports, fsOps, process.platform, homedir()) : { servers: {}, provenance: {} };
    const project = loadConfigFile(resolve(DEFAULT_PROJECT_CONFIG), fsOps);
    return mergeConfigs(config2, imports, project).config;
  };
}
function wireApplyDirectToolsEnv() {
  return (config2) => applyDirectToolsEnv(config2, process.env.PI_MCP_DIRECT_TOOLS);
}
var wireComputeHash = computeConfigHash;
function wireLoadCache() {
  return () => {
    const cache = loadMetadataCache(resolve(CACHE_FILE_PATH), cacheFs);
    if (!cache) return null;
    const servers = {};
    for (const [name, entry] of Object.entries(cache.servers)) {
      servers[name] = Array.isArray(entry.tools) ? entry.tools : [];
    }
    return { hash: cache.configHash, servers, timestamp: Date.now() };
  };
}
function wireIsCacheValid() {
  return (cache, hash) => {
    if (!cache) return false;
    const servers = {};
    for (const [name, tools] of Object.entries(cache.servers)) {
      servers[name] = { tools, savedAt: cache.timestamp };
    }
    return isMetadataCacheValid({ version: 1, configHash: cache.hash, servers }, hash, () => Date.now());
  };
}
function wireSaveCache() {
  return async (hash, metadata2) => {
    const servers = {};
    const now = Date.now();
    for (const [name, tools] of metadata2) servers[name] = { tools, savedAt: now };
    saveMetadataCache(resolve(CACHE_FILE_PATH), { version: 1, configHash: hash, servers }, cacheFs);
  };
}

// src/content-transform.ts
function transformContent(content) {
  switch (content.type) {
    case "text":
      return { type: "text", text: content.text ?? "" };
    case "image":
      return { type: "image", data: content.data ?? "", mimeType: content.mimeType ?? "application/octet-stream" };
    case "resource":
      return {
        type: "text",
        text: `[Resource: ${content.resource?.uri}]
${content.resource?.text ?? content.resource?.blob ?? ""}`
      };
    case "resource_link":
      return { type: "text", text: `[Resource Link: ${content.name ?? ""} (${content.uri ?? ""})]` };
    case "audio":
      return { type: "text", text: "[Audio content not supported in text mode]" };
    default:
      return { type: "text", text: JSON.stringify(content) };
  }
}

// src/tool-direct-register.ts
function transformContents(contents) {
  const blocks = contents.map(
    (c) => transformContent({
      type: "resource",
      resource: { uri: c.uri, text: c.text, blob: c.blob }
    })
  );
  return { content: blocks };
}
function createExecutor(spec, getConn, consent) {
  return async (_callId, params, _signal, _onUpdate, _ctx) => {
    const conn = getConn(spec.serverName);
    if (!conn) throw new Error(`Server "${spec.serverName}" not connected`);
    const allowed = await consent(spec.serverName);
    if (!allowed) throw new Error(`Tool execution denied: consent required`);
    if (spec.resourceUri) {
      const res2 = await conn.client.readResource({ uri: spec.resourceUri });
      return transformContents(res2.contents);
    }
    const res = await conn.client.callTool({
      name: spec.originalName,
      arguments: params
    });
    return {
      content: res.content.map((c) => transformContent(c))
    };
  };
}

// src/tool-metadata.ts
function toolRawToMetadata(raw, serverName) {
  return {
    name: raw.name,
    originalName: raw.name,
    serverName,
    description: raw.description ?? "",
    inputSchema: raw.inputSchema
  };
}
async function buildToolMetadata(client, serverName) {
  const all = [];
  let cursor;
  do {
    const result = await client.listTools(
      cursor ? { cursor } : void 0
    );
    for (const tool of result.tools) {
      all.push(toolRawToMetadata(tool, serverName));
    }
    cursor = result.nextCursor;
  } while (cursor);
  return all;
}

// src/wire-init-tools.ts
function wireBuildMetadata() {
  return async (name, client) => buildToolMetadata(client, name);
}
function wireResolveDirectTools() {
  return (metadata2, config2) => {
    const registered = /* @__PURE__ */ new Set();
    const prefix = config2.settings?.toolPrefix ?? "server";
    const allSpecs = [];
    for (const [server, tools] of metadata2) {
      const entry = config2.mcpServers[server];
      const dt = entry?.directTools ?? config2.settings?.directTools ?? false;
      if (dt === false) continue;
      const specs = resolveDirectTools(tools, dt, prefix, registered, () => {
      });
      allSpecs.push(...specs);
    }
    return allSpecs;
  };
}
function wireRegisterDirectTools() {
  return (pi, specs) => {
    const getConn = (name) => getConnections().get(name);
    const consent = async () => true;
    for (const spec of specs) {
      const executor = createExecutor(spec, getConn, consent);
      const schema = spec.inputSchema ?? { type: "object", properties: {} };
      pi.registerTool({ name: spec.prefixedName, parameters: schema, execute: executor });
    }
  };
}
function wireBuildResourceTools() {
  return () => [];
}
function wireDeduplicateTools() {
  return (tools) => {
    const seen = /* @__PURE__ */ new Set();
    return tools.filter((t) => {
      if (seen.has(t.prefixedName)) return false;
      seen.add(t.prefixedName);
      return true;
    });
  };
}

// src/wire-command.ts
function makeConnectDeps() {
  return {
    createStdioTransport: () => {
      throw new Error("stdio transport not wired");
    },
    createHttpTransport: async () => {
      throw new Error("http transport not wired");
    },
    createClient: () => {
      throw new Error("client factory not wired");
    },
    processEnv: process.env
  };
}
function wireCommandConnect() {
  const deps = makeConnectDeps();
  return async (name, entry) => {
    const result = await connectServer(name, entry, deps);
    setConnection(name, result);
    const tools = await buildToolMetadata(result.client, name);
    setMetadata(name, tools);
  };
}
function wireCommandClose() {
  return async (name) => {
    const conns = getConnections();
    const conn = conns.get(name);
    if (!conn) return;
    conn.status = "closed";
    removeConnection(name);
    try {
      await conn.client.close();
    } catch {
    }
    try {
      await conn.transport.close();
    } catch {
    }
  };
}

// src/server-close.ts
async function closeServer(name, pool) {
  const conn = pool.get(name);
  if (!conn) return;
  conn.status = "closed";
  pool.remove(name);
  try {
    await conn.client.close();
  } catch {
  }
  try {
    await conn.transport.close();
  } catch {
  }
}

// src/server-pool.ts
var ServerPool = class {
  connections = /* @__PURE__ */ new Map();
  pending = /* @__PURE__ */ new Map();
  get(name) {
    return this.connections.get(name);
  }
  add(name, conn) {
    this.connections.set(name, conn);
  }
  remove(name) {
    this.connections.delete(name);
  }
  all() {
    return this.connections;
  }
  async getOrConnect(name, connector) {
    const existing = this.connections.get(name);
    if (existing) {
      if (existing.status === "failed" || existing.status === "closed") {
        this.connections.delete(name);
      } else {
        return existing;
      }
    }
    const inflight = this.pending.get(name);
    if (inflight) return inflight;
    const promise = connector().then(
      (conn) => {
        this.connections.set(name, conn);
        this.pending.delete(name);
        return conn;
      },
      (err) => {
        this.pending.delete(name);
        throw err;
      }
    );
    this.pending.set(name, promise);
    return promise;
  }
};

// src/wire-init.ts
function isConfig(v) {
  return typeof v === "object" && v !== null && "mcpServers" in v;
}
function isServerConn(v) {
  return typeof v === "object" && v !== null && "client" in v && "transport" in v;
}
function wrapIdleTimer(opts) {
  if (!isConfig(opts)) return;
  const conns = getConnections();
  const pool = new ServerPool();
  for (const [n, c] of conns) pool.add(n, c);
  startIdleTimer({
    connections: conns,
    servers: opts.mcpServers,
    closeFn: (n) => closeServer(n, pool),
    timeoutMs: opts.settings?.idleTimeout ?? DEFAULT_IDLE_TIMEOUT_MS,
    intervalMs: DEFAULT_IDLE_TIMEOUT_MS / 10
  });
}
function wrapKeepalive(opts) {
  if (!isConfig(opts)) return;
  startKeepalive({
    connections: getConnections(),
    servers: opts.mcpServers,
    reconnectFn: async () => {
    },
    intervalMs: KEEPALIVE_INTERVAL_MS
  });
}
function wireInitDeps() {
  const logger = createLogger("info", { module: "init" });
  const cDeps = makeConnectDeps();
  return {
    loadConfig: wireLoadConfig(),
    mergeConfigs: wireMergeConfigs(),
    applyDirectToolsEnv: wireApplyDirectToolsEnv(),
    computeHash: wireComputeHash,
    loadCache: wireLoadCache(),
    isCacheValid: wireIsCacheValid(),
    saveCache: wireSaveCache(),
    connectServer: (name, entry) => connectServer(name, entry, cDeps),
    buildMetadata: wireBuildMetadata(),
    resolveDirectTools: wireResolveDirectTools(),
    registerDirectTools: wireRegisterDirectTools(),
    buildResourceTools: wireBuildResourceTools(),
    deduplicateTools: wireDeduplicateTools(),
    startIdleTimer: wrapIdleTimer,
    startKeepalive: wrapKeepalive,
    setConfig,
    setConnection: (name, conn) => {
      if (isServerConn(conn)) setConnection(name, conn);
    },
    setMetadata,
    getAllMetadata,
    incrementGeneration,
    getGeneration,
    updateFooter: () => {
    },
    logger
  };
}

// src/wire-shutdown.ts
async function closeAllConnections() {
  const conns = getConnections();
  const names = [...conns.keys()];
  await Promise.allSettled(names.map(async (name) => {
    const conn = conns.get(name);
    if (!conn) return;
    conn.status = "closed";
    conns.delete(name);
    try {
      await conn.client.close();
    } catch {
    }
    try {
      await conn.transport.close();
    } catch {
    }
  }));
}
function wireShutdownOps() {
  const logger = createLogger("info", { module: "shutdown" });
  return {
    saveCache: async () => {
    },
    closeAll: closeAllConnections,
    stopIdle: stopIdleTimer,
    stopKeepalive,
    resetState,
    logger
  };
}

// src/proxy-search.ts
function wrapQuery(query, regex) {
  if (regex && !query.startsWith("/")) return `/${query}/`;
  return query;
}
function proxySearch(query, metadata2, match, opts) {
  const wrapped = wrapQuery(query, opts?.regex);
  const hits = [];
  for (const [server, tools] of metadata2) {
    if (opts?.server && server !== opts.server) continue;
    for (const tool of tools) {
      if (match(tool.name, wrapped)) {
        hits.push({ serverName: server, name: tool.name, description: tool.description });
      }
    }
  }
  if (hits.length === 0) {
    return {
      content: [{ type: "text", text: `No tools found matching "${query}".` }],
      details: { mode: "search", error: "no_match" }
    };
  }
  return {
    content: [{ type: "text", text: formatHits(hits) }],
    details: { mode: "search" }
  };
}
function formatHits(hits) {
  const byServer = /* @__PURE__ */ new Map();
  for (const h of hits) {
    const list = byServer.get(h.serverName) ?? [];
    list.push(h);
    byServer.set(h.serverName, list);
  }
  const sections = [];
  for (const [server, tools] of byServer) {
    const lines = tools.map((t) => `  - ${t.name}: ${t.description}`);
    sections.push(`[${server}]
${lines.join("\n")}`);
  }
  return sections.join("\n\n");
}

// src/proxy-query.ts
function proxyList(server, getTools, config2) {
  if (!server) {
    return text2(
      'Provide a server name. Use action: "status" to see servers.',
      { mode: "list" }
    );
  }
  if (config2 && !config2.hasServer(server)) {
    return text2(
      `Server "${server}" not found in config. Known: ${config2.serverNames().join(", ")}`,
      { mode: "list", server, error: "unknown_server" }
    );
  }
  const tools = getTools(server);
  if (!tools || tools.length === 0) {
    const hint = config2 ? ' Try action: "connect" to reconnect.' : "";
    return text2(
      `No tools found for server "${server}".${hint}`,
      { mode: "list", server }
    );
  }
  const lines = tools.map((t) => `  - ${t.name}: ${t.description}`);
  return text2(
    `Tools on [${server}]:
${lines.join("\n")}`,
    { mode: "list", server }
  );
}
function proxyDescribe(toolName, find, format) {
  if (!toolName) {
    return text2(
      "Tool name is required for describe action.",
      { mode: "describe" }
    );
  }
  const tool = find(toolName);
  if (!tool) {
    return text2(
      `Tool "${toolName}" not found. Try action: "search".`,
      { mode: "describe", tool: toolName, error: "not_found" }
    );
  }
  const schema = format(tool.inputSchema);
  return text2(
    `[${tool.serverName}] ${tool.name}: ${tool.description}

Parameters:
${schema}`,
    { mode: "describe", server: tool.serverName, tool: tool.name }
  );
}
function proxyStatus(servers) {
  if (servers.length === 0) return text2("No servers configured.", { mode: "status" });
  const lines = servers.map((s) => `  - ${s.name}: ${formatStatus2(s)}`);
  return text2(`Server status:
${lines.join("\n")}`, { mode: "status" });
}
function formatStatus2(s) {
  if (s.status === "connected") return "\u2713 connected";
  if (s.cached) return "\u25CB cached";
  if (s.failedAgo) return `\u2717 failed (${s.failedAgo} ago)`;
  return "\u25CB not connected";
}
function text2(msg, details) {
  return { content: [{ type: "text", text: msg }], details };
}

// src/proxy-resolve.ts
function prefixMatch(toolName, metadata2) {
  const idx = toolName.indexOf("_");
  if (idx === -1) return void 0;
  const prefix = toolName.slice(0, idx);
  const rest = toolName.slice(idx + 1);
  const serverTools = metadata2.get(prefix);
  if (!serverTools) return void 0;
  return serverTools.find((t) => t.originalName === rest);
}
function findInAllMetadata(toolName, metadata2) {
  for (const tools of metadata2.values()) {
    const found = tools.find((t) => t.name === toolName);
    if (found) return found;
  }
  return prefixMatch(toolName, metadata2);
}
function checkBackoff(server, deps) {
  const backoffMs = deps.getBackoffMs(server);
  if (backoffMs <= 0) return void 0;
  const failure = deps.getFailure(server);
  if (!failure) return void 0;
  if (Date.now() - failure.at < backoffMs) {
    return `Server "${server}" recently failed, retry later.`;
  }
  return void 0;
}
async function resolveTool(toolName, deps) {
  const exact = deps.findTool(toolName);
  if (exact) return { meta: exact, lazyConnected: false };
  const allMeta = deps.getAllMetadata();
  const found = findInAllMetadata(toolName, allMeta);
  if (found) return { meta: found, lazyConnected: false };
  const config2 = deps.getConfig();
  if (!config2) return { message: `Tool "${toolName}" not found. Try action: "search".` };
  for (const serverName of Object.keys(config2.mcpServers)) {
    if (allMeta.has(serverName)) continue;
    const backoffErr = checkBackoff(serverName, deps);
    if (backoffErr) continue;
    await deps.connectServer(serverName);
    const refreshed = deps.getAllMetadata();
    const match = findInAllMetadata(toolName, refreshed);
    if (match) return { meta: match, lazyConnected: true };
  }
  return { message: `Tool "${toolName}" not found. Try action: "search".` };
}
function isResolveError(r) {
  return "message" in r;
}

// src/proxy-call.ts
function resourceToContent(result) {
  return result.contents.map((c) => ({
    type: "text",
    text: c.text ?? c.blob ?? ""
  }));
}
async function proxyCall(toolName, args, deps) {
  const resolved = await resolveTool(toolName, deps);
  if (isResolveError(resolved)) {
    return {
      content: [{ type: "text", text: resolved.message }],
      details: { mode: "call", tool: toolName, error: "not_found" }
    };
  }
  const { meta } = resolved;
  const allowed = await deps.checkConsent(meta.serverName);
  if (!allowed) {
    return {
      content: [{ type: "text", text: `Execution denied for server "${meta.serverName}".` }],
      details: { mode: "call", server: meta.serverName, tool: toolName, error: "denied" }
    };
  }
  const conn = await deps.getOrConnect(meta.serverName);
  conn.inFlight++;
  try {
    const content = meta.resourceUri ? resourceToContent(await conn.client.readResource({ uri: meta.resourceUri })) : (await conn.client.callTool({ name: meta.originalName, arguments: args })).content;
    conn.lastUsedAt = Date.now();
    return {
      content: content.map(deps.transform),
      details: { mode: "call", server: meta.serverName, tool: meta.name }
    };
  } finally {
    conn.inFlight--;
  }
}

// src/truncate.ts
function truncateAtWord(text4, target) {
  if (text4.length <= target) return text4;
  const lastSpace = text4.lastIndexOf(" ", target);
  if (lastSpace > target * 0.6) return `${text4.slice(0, lastSpace)}...`;
  return `${text4.slice(0, target)}...`;
}

// src/schema-format.ts
function formatSchema(schema) {
  if (!schema) return "(no parameters)";
  const obj = schema;
  if (!obj.properties || Object.keys(obj.properties).length === 0) return "(no parameters)";
  const required = new Set(obj.required ?? []);
  const lines = [];
  for (const [name, prop] of Object.entries(obj.properties)) {
    lines.push(formatProp(name, prop, required.has(name)));
  }
  return lines.join("\n");
}
function formatProp(name, prop, isRequired) {
  const parts = [`  ${name}: ${prop.type ?? "unknown"}`];
  if (prop.enum) parts.push(`(${prop.enum.join(" | ")})`);
  parts.push(isRequired ? "[required]" : "[optional]");
  if (prop.description) parts.push(`- ${truncateAtWord(prop.description, 60)}`);
  return parts.join(" ");
}

// src/wire-proxy.ts
function findToolInMetadata(name) {
  for (const tools of getAllMetadata().values()) {
    const found = tools.find((t) => t.name === name);
    if (found) return found;
  }
  return void 0;
}
function buildServerStatuses() {
  const config2 = getConfig();
  if (!config2) return [];
  const conns = getConnections();
  return Object.keys(config2.mcpServers).map((name) => {
    const conn = conns.get(name);
    return { name, status: conn?.status ?? "not connected" };
  });
}
function buildCallDeps(doConnect) {
  return {
    findTool: findToolInMetadata,
    getAllMetadata,
    getConfig,
    connectServer: async (name) => {
      const cfg = getConfig();
      if (!cfg) return;
      const entry = cfg.mcpServers[name];
      if (entry) await doConnect(name, entry);
    },
    getBackoffMs,
    getFailure,
    getOrConnect: async (server) => {
      const conn = getConnections().get(server);
      if (conn) return conn;
      throw new Error(`Server "${server}" not connected`);
    },
    checkConsent: async () => true,
    transform: transformContent
  };
}
function wireProxyDeps() {
  const doConnect = wireCommandConnect();
  const callDeps = buildCallDeps(doConnect);
  return {
    search: (query) => proxySearch(query ?? "", getAllMetadata(), matchTool),
    list: (server) => proxyList(server, (s) => getMetadata(s)),
    describe: (tool) => proxyDescribe(tool, findToolInMetadata, formatSchema),
    status: () => proxyStatus(buildServerStatuses()),
    call: (tool, args) => proxyCall(tool, args, callDeps),
    connect: async (server) => connectAction(server, doConnect)
  };
}
async function connectAction(server, doConnect) {
  if (!server) return text3("Server name is required for connect action.");
  const config2 = getConfig();
  if (!config2) return text3("No config loaded.");
  const entry = config2.mcpServers[server];
  if (!entry) return text3(`Server "${server}" not found in config.`);
  await doConnect(server, entry);
  return text3(`Connected to "${server}".`);
}
function text3(msg) {
  return { content: [{ type: "text", text: msg }] };
}

// src/index.ts
function index_default(pi) {
  pi.registerTool(createProxyTool(pi, void 0, wireProxyDeps));
  pi.registerCommand("mcp", createMcpCommand(pi, wireCommandConnect(), wireCommandClose()));
  pi.registerFlag("mcp-config", MCP_CONFIG_FLAG);
  pi.on("session_start", onSessionStart(pi, wireInitDeps()));
  pi.on("session_shutdown", onSessionShutdown(wireShutdownOps()));
}
export {
  index_default as default
};
