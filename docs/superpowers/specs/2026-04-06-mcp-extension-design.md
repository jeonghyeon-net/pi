# MCP Extension Design Spec

Pi coding agent extension providing MCP (Model Context Protocol) server integration.
Full rewrite using `@modelcontextprotocol/sdk` directly, following project architecture rules.

Reference: [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) (design patterns only, no code reuse).

## Architecture Constraints

- All `.ts` files <= 99 lines (including test files)
- `index.ts`: entry-only (only `pi.method()` calls and imported function calls; no variables, no loops)
- `ExtensionAPI` string forbidden outside `src/index.ts`
- `as any/unknown/never` type assertions forbidden
- 100% test coverage (lines/branches/functions/statements), `src/index.ts` excluded
- `package.json`: only `pi`, `scripts`, `devDependencies`, `dependencies` keys
- Required files: package.json, tsconfig.json, biome.json, .gitignore, README, vitest.config.ts, src/index.ts, dist/index.js, tests/
- Root README must list `mcp` extension

## Feature Scope

### Proxy Tool

Single `mcp` proxy tool registered with Pi (~200 tokens vs hundreds of individual tools).

**Parameter schema (TypeBox):**
```
action: "call" | "list" | "describe" | "search" | "status" | "connect"
tool?: string       -- tool name (for call/describe)
args?: object       -- tool arguments (for call)
server?: string     -- target server (for list/connect/call)
query?: string      -- search query (for search)
```

**Actions:**
- `call` -- execute a tool on an MCP server
- `list` -- enumerate tools from a server
- `describe` -- show detailed parameter schema for a tool
- `search` -- find tools across servers (substring + normalized match: dash/underscore equivalence, optional regex via `/pattern/`)
- `status` -- report connection state for all servers
- `connect` -- manually connect to a server

**Dynamic description** lists configured servers and cached tool counts so the LLM knows what is available. Regenerated on connection changes.

### Server Management

**Transport:**
- Stdio (local command execution with env interpolation)
- HTTP: StreamableHTTP attempted first, SSE fallback if connection fails
- NPX resolver: resolves `npx`/`npm exec` to binary paths with 24h cache

**Lifecycle modes:**
- `lazy` (default) -- connect on first tool call
- `eager` -- connect at session start
- `keep-alive` -- persistent with health check (`client.ping()`, failure triggers reconnect) + auto-reconnect

**Connection management:**
- Connection pooling (Map-based, reuse healthy connections)
- Deduplication (concurrent connect attempts to same server share one promise)
- Idle timeout (per-server override or global default 10min; timer resets on each tool call)
- Graceful shutdown with dual-flush: 1) save metadata cache 2) close connections -- error in step 1 does not prevent step 2
- Generation-based state tracking (stale session async ops can't corrupt new session)

**Failure handling:**
- Failure tracker with timestamps + backoff
- Keep-alive auto-reconnect on health check failure
- Partial failure on init: session starts with available servers, failed servers logged as warnings

### Tool Management

**Direct tools:**
- Promote frequently-used tools to bypass proxy (registered as individual Pi tools)
- Prefix strategies: `server` (servername_toolname), `short` (sn_toolname), `none` (toolname)
- `MCP_DIRECT_TOOLS` env var override (`__none__` disables all)
- Registered dynamically during `session_start` via callback

**Resource exposure:**
- MCP resources exposed as `get_`-prefixed tools (enabled by default, configurable per server)
- `client.readResource()` for tools with `resourceUri`

**Collision avoidance:**
- Builtin protection: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`, `mcp` -- skip with warning
- Cross-server dedup: first-come-first-served; if `none` prefix causes collision, second tool gets forced `server` prefix + warning
- Server names sanitized for file paths (strip `/`, `..`, control chars)

**Paginated discovery:**
- Cursor-based pagination for `listTools` and `listResources`

### Authentication

**OAuth:**
- Token storage: `~/.pi/agent/mcp-oauth/{serverName}/tokens.json`
- Load, validate (`access_token` string check), expiry check (`Date.now() > expiresAt`)
- Default `token_type: "bearer"`
- No auto-refresh; expired tokens prompt user to run `/mcp auth <server>`

**Bearer:**
- Direct token or env var reference (`bearerTokenEnv`)
- Attached as Authorization header on HTTP transports

**Consent management:**
- `never` -- no prompts, automatic execution
- `once-per-server` (default) -- prompt once per server per session
- `always` -- prompt every time
- Session-only (no file persistence)

### Configuration

**Load hierarchy (lowest to highest precedence):**
1. `~/.pi/agent/mcp.json` (user config; missing file = empty config, not error)
2. Imported configs (from external tools; same-name server = first import wins)
3. `.pi/mcp.json` (project-local; overrides all)

**Config imports from:**
- Cursor, Claude Code, Claude Desktop, Codex, Windsurf, VSCode
- Each tool's MCP config file path resolved per platform

**Field compatibility:** `mcp-servers` accepted as alias for `mcpServers`.

**Server provenance:** tracks which config file each server definition came from.

**Config writing:** direct tool changes saved back to source config via atomic write (temp file + rename).

**Hash-based change detection:** hash excludes `lifecycle`, `idleTimeout`, `debug` fields.
Cache invalidated when config hash changes.

**`--mcp-config` CLI flag:** override config file path via `pi.registerFlag()`.

### Metadata Cache

- Persistent: `~/.pi/agent/mcp-cache.json`
- 7-day TTL + config hash invalidation
- Atomic writes (temp file with PID + rename)
- Enables tool search without active server connections

### Command

Single `/mcp` command with subcommands:

```
/mcp status              -- server connection status
/mcp tools [server]      -- list available tools
/mcp connect <server>    -- manually connect
/mcp disconnect <server> -- disconnect
/mcp reconnect [server]  -- reconnect (all or specific)
/mcp auth <server>       -- OAuth setup instructions
/mcp search <query>      -- search tools across servers
```

### Footer Integration

Status bar via `ui.setStatus("mcp", text)` -- automatically displayed by footer extension.
Format: `MCP: X/Y servers` (connected/total). Updated on init completion and connection changes.

### Content Transformation

MCP response content types mapped to Pi content blocks:
- `text` -> text block (pass-through)
- `image` -> image block (base64 + MIME type)
- `resource` -> text block (URI + content)
- `resource_link` -> text block (name + URI)
- `audio` -> text block (descriptive, audio not supported)
- Unknown -> JSON serialized text

### Error Handling

Structured errors with:
- Error code (string identifier)
- User-facing message
- Recovery hint (actionable guidance)
- Context (server, tool, URI)

### Logging

4 levels: debug, info, warn, error.
Child logger pattern for contextual logging (server name, tool name).
Per-server `debug: true` flag enables debug output.

### Environment Variable Interpolation

`${VAR}` substitution in server command args, env values, and HTTP headers.
Single-pass only (no recursive expansion). Missing vars left as-is or empty string (configurable).

## Module Structure (54 source files)

### index.ts

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createProxyTool } from "./proxy-router.js";
import { createMcpCommand } from "./cmd-router.js";
import { onSessionStart } from "./lifecycle-init.js";
import { onSessionShutdown } from "./lifecycle-shutdown.js";
import { MCP_CONFIG_FLAG } from "./constants.js";

export default function (pi: ExtensionAPI) {
  pi.registerTool(createProxyTool(pi));
  pi.registerCommand("mcp", createMcpCommand(pi));
  pi.registerFlag("mcp-config", MCP_CONFIG_FLAG);
  pi.on("session_start", onSessionStart(pi));
  pi.on("session_shutdown", onSessionShutdown(pi));
}
```

Every line in function body starts with `pi.` (matches `apiRe`).
Arguments including `pi` inside `pi.method()` calls are unchecked by Go test.

### Narrow Interface Pattern

Each module receiving `pi` defines its own interface (avoids `ExtensionAPI` string outside index.ts):

```typescript
// lifecycle-init.ts
interface InitPi {
  registerTool(tool: ToolDef): void;
  exec(cmd: string, args: string[], opts?: { cwd?: string }): Promise<{ stdout: string; code: number }>;
  sendMessage(msg: { customType: string; content: string; display: boolean }): void;
}
export function onSessionStart(pi: InitPi) {
  return async (_event: unknown, ctx: ExtensionContext) => { /* ... */ };
}
```

### Dependency Injection Pattern

All I/O operations injected as function parameters (no direct imports of fs, child_process, SDK):

```typescript
// npx-resolver.ts
interface ExecSync { (cmd: string, opts?: { timeout?: number }): string; }
interface FsOps { existsSync(p: string): boolean; readFileSync(p: string): string; }

export function resolveNpx(pkg: string, exec: ExecSync, fs: FsOps): string | null { /* ... */ }
```

Tests inject mocks without `as any`:
```typescript
const mockFs: FsOps = { existsSync: () => true, readFileSync: () => '{}' };
```

### Module Map

```
src/
  index.ts                      # entry point (registration only)

  # Types + Constants
  types-config.ts               # ServerEntry, McpConfig, ImportKind, McpSettings
  types-server.ts               # ServerConnection, Transport, LifecycleMode, McpClient
  types-tool.ts                 # McpTool, McpResource, ToolMetadata, DirectToolSpec
  types-proxy.ts                # ProxyParams, ProxyResult, ProxyAction
  constants.ts                  # TTL, builtin list, defaults, MCP_CONFIG_FLAG

  # Config
  config-load.ts                # mcp.json parsing + field compat
  config-merge.ts               # merge with precedence + provenance
  config-imports.ts             # external tool config import (6 tools)
  config-write.ts               # atomic write for directTools changes
  config-hash.ts                # hash computation (exclude lifecycle/debug)

  # Server
  server-pool.ts                # connection pool (Map, dedup promise)
  server-connect.ts             # connection creation (transport -> discovery)
  server-close.ts               # disconnect (single/all)

  # Transport
  transport-stdio.ts            # Stdio transport + env interpolation
  transport-http.ts             # HTTP fallback router (streamable -> SSE)
  transport-http-streamable.ts  # StreamableHTTP transport
  transport-http-sse.ts         # SSE transport

  # Lifecycle
  lifecycle-init.ts             # session_start orchestration
  lifecycle-shutdown.ts         # session_shutdown orchestration (dual-flush)
  lifecycle-idle.ts             # idle timeout detection + shutdown
  lifecycle-keepalive.ts        # health check + auto-reconnect

  # Proxy Tool
  proxy-router.ts               # params -> action routing + tool definition
  proxy-call.ts                 # call action (tool execution)
  proxy-query.ts                # list / describe / status actions
  proxy-search.ts               # search action (fuzzy, regex)
  proxy-description.ts          # dynamic description generation

  # Tool Management
  tool-metadata.ts              # build metadata from server connections
  tool-direct.ts                # direct tool resolution/filtering
  tool-direct-register.ts       # direct tool registration + executor
  tool-resource.ts              # resource -> get_ tool conversion
  tool-collision.ts             # builtin protection + cross-server dedup

  # Cache
  cache-metadata.ts             # metadata cache (7-day TTL, hash invalidation)
  cache-npx.ts                  # NPX resolution cache (24h TTL)

  # Auth
  auth.ts                       # OAuth token mgmt + Bearer auth
  consent.ts                    # pre-execution consent (3 modes)

  # Command
  cmd-router.ts                 # /mcp subcommand routing
  cmd-info.ts                   # status + tools output
  cmd-server.ts                 # connect / disconnect / reconnect
  cmd-auth.ts                   # auth handler
  cmd-search.ts                 # search output

  # Infrastructure
  npx-resolver.ts               # npx/npm exec -> binary path
  content-transform.ts          # MCP content -> Pi content
  schema-format.ts              # tool schema -> readable text
  search.ts                     # fuzzy search logic
  env.ts                        # environment variable interpolation
  errors.ts                     # structured error types
  logger.ts                     # logging core (4 levels, child logger)
  logger-format.ts              # log formatting/output
  state.ts                      # central state store
  failure-tracker.ts            # server failure timestamps + backoff
  pagination.ts                 # cursor-based pagination
  parallel.ts                   # parallelLimit concurrency control
  truncate.ts                   # truncateAtWord text utility
```

### Dependency Flow

Data dependencies go through `state.ts`. Function dependencies form a DAG (no cycles).

```
index.ts
  -> proxy-router.ts (createProxyTool)
  -> cmd-router.ts (createMcpCommand)
  -> lifecycle-init.ts (onSessionStart)
  -> lifecycle-shutdown.ts (onSessionShutdown)

lifecycle-init.ts (orchestration)
  -> config-load.ts -> config-merge.ts -> config-imports.ts
  -> config-hash.ts
  -> cache-metadata.ts
  -> server-connect.ts -> transport-*.ts
  -> tool-metadata.ts -> pagination.ts
  -> tool-direct.ts -> tool-collision.ts
  -> tool-direct-register.ts
  -> tool-resource.ts
  -> lifecycle-idle.ts
  -> lifecycle-keepalive.ts
  -> state.ts (write)

proxy-*.ts
  -> state.ts (read connections, metadata)
  -> server-connect.ts (lazy connect)
  -> content-transform.ts
  -> search.ts
  -> schema-format.ts

cmd-*.ts
  -> state.ts (read)
  -> server-connect.ts, server-close.ts
  -> auth.ts

All modules -> constants.ts, types-*.ts, errors.ts, logger.ts (leaf dependencies)
```

### state.ts (Central Store)

```typescript
// Owns:
//   generation: number (session lifecycle counter)
//   connections: Map<string, ServerConnection>
//   metadata: Map<string, ToolMetadata[]>
//   failures: Map<string, { at: number; count: number }>
//   config: McpConfig | null
//   cache: MetadataCache | null

// Provides:
//   get/set for each concern
//   incrementGeneration()
//   resetAll()
//   updateFooterStatus(ui) -- calls ui.setStatus("mcp", ...)
```

Server-pool, tool-metadata, failure-tracker operate on state.ts data.
This breaks circular dependencies: modules never import each other for shared data.

## Testing Strategy

### Coverage Requirements

- 100% lines, branches, functions, statements
- `src/index.ts` excluded
- All 53 non-index source files must have full coverage

### Test File Organization

1:1 mapping for most modules. Complex modules get multiple test files:

```
tests/
  types-config.test.ts
  types-server.test.ts
  types-tool.test.ts
  types-proxy.test.ts
  constants.test.ts
  config-load.test.ts
  config-load-compat.test.ts          # field compatibility edge cases
  config-merge.test.ts
  config-merge-provenance.test.ts     # provenance tracking
  config-imports.test.ts
  config-imports-platforms.test.ts     # platform-specific paths
  config-write.test.ts
  config-hash.test.ts
  server-pool.test.ts
  server-connect.test.ts
  server-connect-discovery.test.ts    # pagination + tool/resource discovery
  server-close.test.ts
  transport-stdio.test.ts
  transport-http.test.ts
  transport-http-streamable.test.ts
  transport-http-sse.test.ts
  lifecycle-init.test.ts
  lifecycle-init-errors.test.ts       # partial failure scenarios
  lifecycle-shutdown.test.ts
  lifecycle-idle.test.ts
  lifecycle-keepalive.test.ts
  proxy-router.test.ts
  proxy-call.test.ts
  proxy-call-errors.test.ts           # error/timeout scenarios
  proxy-query.test.ts
  proxy-search.test.ts
  proxy-description.test.ts
  tool-metadata.test.ts
  tool-direct.test.ts
  tool-direct-register.test.ts
  tool-resource.test.ts
  tool-collision.test.ts
  cache-metadata.test.ts
  cache-npx.test.ts
  auth.test.ts
  auth-oauth.test.ts                  # OAuth-specific paths
  consent.test.ts
  cmd-router.test.ts
  cmd-info.test.ts
  cmd-server.test.ts
  cmd-auth.test.ts
  cmd-search.test.ts
  npx-resolver.test.ts
  content-transform.test.ts
  schema-format.test.ts
  search.test.ts
  env.test.ts
  errors.test.ts
  logger.test.ts
  logger-format.test.ts
  state.test.ts
  failure-tracker.test.ts
  pagination.test.ts
  parallel.test.ts
  truncate.test.ts
```

Estimated: ~59 test files, each <= 99 lines.

### Mocking Strategy

- All I/O via DI (function parameters, not direct imports)
- MCP SDK: narrow `McpClient` interface, tests create plain objects satisfying interface
- File system: `FsOps` interface injected, tests provide in-memory implementations
- Child process: `ExecSync`/`ExecAsync` function parameters
- No `as any/unknown/never` in test files -- type-safe mocks only

## Config File Paths

| File | Purpose |
|------|---------|
| `~/.pi/agent/mcp.json` | User MCP config |
| `.pi/mcp.json` | Project-local MCP config |
| `~/.pi/agent/mcp-cache.json` | Metadata cache |
| `~/.pi/agent/mcp-npx-cache.json` | NPX resolution cache |
| `~/.pi/agent/mcp-oauth/{server}/tokens.json` | OAuth tokens |

## Excluded Features

- UI panel (web-based management interface)
- Glimpse UI (native macOS windows)
- UI server (HTTP server for interactive UI)
- UI sessions and streaming
- UI resource handler
- CLI installer (cli.js)
