import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { loadConfig } from "./config.js";
import { McpManager } from "./manager.js";
import { registerDiscoveredTools } from "./registry.js";
import { type FlowDeps, notifyStatusSummary, openMcpStatusOverlay } from "./status-flow.js";
import { createVisibilityController, removeDisabledToolsFromActiveSet } from "./tool-state.js";
import type { LoadedConfig, ReloadableContext } from "./types.js";
import { loadToolVisibilitySettings } from "./visibility.js";

export async function setupClaudeMcpBridge(pi: ExtensionAPI): Promise<void> {
  const manager = new McpManager();
  const registeredTools = new Set<string>();
  let loadedAt: LoadedConfig = { sourcePath: null, servers: [], warnings: [] };
  const loadedToolVisibility = loadToolVisibilitySettings();
  const visibility = createVisibilityController(
    loadedToolVisibility.disabledToolKeys,
    loadedToolVisibility.warning,
  );

  const getOverlayWarnings = (): string[] => {
    const warnings = [...loadedAt.warnings];
    const warning = visibility.getWarning();
    if (warning) warnings.push(warning);
    return warnings;
  };

  const updateStatus = (ctx: ExtensionContext): void => {
    if (!ctx.hasUI) return;
    const states = manager.getStates();
    const total = states.length;
    if (total === 0) {
      ctx.ui.setStatus("mcp", undefined);
      return;
    }
    const connected = states.filter((s) => s.status === "connected").length;
    ctx.ui.setStatus("mcp", `MCP ${connected}/${total}`);
  };

  const flowDeps: FlowDeps = {
    pi,
    manager,
    visibility,
    registeredTools,
    getOverlayWarnings,
    updateStatus,
  };

  const loadAndConnect = async (cwd: string): Promise<LoadedConfig> => {
    const loaded = loadConfig(cwd);
    await manager.replaceServers(loaded.servers, loaded.sourcePath);
    await manager.connectAll();
    registerDiscoveredTools({
      manager,
      pi,
      registeredTools,
      isToolDisabled: visibility.isToolDisabled,
    });
    loadedAt = loaded;
    return loaded;
  };

  // IMPORTANT: register MCP tools during extension load so pi includes them in tool registry.
  // NOTE(user-approved): 초기 연결 실패 시 재시도/도구 재등록 강화는 현재 동작을 유지한다.
  await loadAndConnect(process.cwd());

  pi.on("session_start", async (_event, ctx) => {
    updateStatus(ctx);
    removeDisabledToolsFromActiveSet(pi, manager, visibility);
    const warning = visibility.getWarning();
    if (warning && ctx.hasUI) {
      ctx.ui.notify(`[claude-mcp-bridge] ${warning}`, "warning");
    }
  });

  pi.on("session_shutdown", async () => {
    await manager.disconnectAll();
  });

  pi.registerCommand("mcp-status", {
    description: "Show MCP server connection status",
    handler: async (_args, ctx) => {
      if (manager.getStates().length === 0) {
        ctx.ui.notify("MCP: no configured servers", "warning");
        return;
      }

      const disabledAtCommandStart = visibility.snapshot();
      if (!ctx.hasUI) {
        notifyStatusSummary(flowDeps, ctx);
        return;
      }
      await openMcpStatusOverlay(flowDeps, ctx as ReloadableContext, disabledAtCommandStart);
    },
  });

  pi.registerCommand("mcp-reload", {
    description: "Reload MCP config and runtime",
    handler: async (_args, ctx) => {
      if (ctx.hasUI) ctx.ui.notify("Reloading runtime to apply MCP changes...", "info");
      await ctx.reload();
    },
  });
}
