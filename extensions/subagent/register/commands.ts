import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { discoverAgents } from "../agent/discovery.js";
import type { SubagentDeps } from "../core/deps.js";
import { captureSwitchSession, subTransHandler } from "../session/navigation.js";
import { AGENT_NAME_PALETTE, agentBgIndex, truncateText } from "../ui/format.js";
import { registerManagementCommands } from "./commands/sub-manage.js";
import { buildSubCommand } from "./commands/sub-run.js";

export function registerCommands(deps: SubagentDeps): {
  subCommand: ReturnType<typeof buildSubCommand>;
  handleSubClear: (args: string, ctx: ExtensionContext) => Promise<void>;
  handleSubAbort: (args: string, ctx: ExtensionContext) => Promise<void>;
} {
  const { pi, store } = deps;

  const subCommand = buildSubCommand(deps);

  pi.registerCommand("sub:isolate", subCommand);

  pi.registerCommand("sub:main", {
    description:
      "Run a subagent with main-session context inheritance: /sub:main <agent|alias> <task>",
    getArgumentCompletions: subCommand.getArgumentCompletions,
    handler: async (args, ctx) => {
      captureSwitchSession(store, ctx);
      const forwarded = (args ?? "").trim();
      await subCommand.handler(forwarded, ctx, true);
    },
  });

  pi.registerCommand("subagents", {
    description: "List available subagents and their model/thinking/tool settings",
    handler: async (_args, ctx) => {
      captureSwitchSession(store, ctx);
      const discovery = discoverAgents(ctx.cwd);
      const agents = discovery.agents;
      if (agents.length === 0) {
        ctx.ui.notify("No subagents found.", "warning");
        return;
      }

      const lines = agents.map((a) => {
        const tools = a.tools?.join(",") ?? "default";
        const model = a.model ?? "(inherit current model)";
        const thinking = a.thinking ?? "(inherit current thinking)";
        const description = a.description ? ` · ${a.description}` : "";
        const colorCode = AGENT_NAME_PALETTE[agentBgIndex(a.name)];
        const coloredName = `\x1b[38;5;${colorCode}m${a.name}\x1b[39m`;
        return truncateText(
          `${coloredName} [${a.source}] · model: ${model} · thinking: ${thinking} · tools: ${tools}${description}`,
          220,
        );
      });

      ctx.ui.notify(`Available subagents\n${lines.map((line) => `• ${line}`).join("\n")}`, "info");
    },
  });

  pi.registerCommand("sub:trans", {
    description: "Switch to a subagent session in interactive mode: /sub:trans <runId>",
    handler: async (args, ctx) => {
      captureSwitchSession(store, ctx);
      await subTransHandler(args, ctx, store, pi);
    },
  });

  const { handleSubClear, handleSubAbort } = registerManagementCommands(deps);

  return { subCommand, handleSubClear, handleSubAbort };
}
