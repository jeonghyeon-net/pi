import type {
  AgentToolResult,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import type { Static } from "@sinclair/typebox";
import { discoverAgents } from "../agent/discovery.js";
import { ListAgentsParams, SubagentParams } from "../core/constants.js";
import type { SubagentDeps } from "../core/deps.js";
import type { SubagentDetails } from "../core/types.js";
import { createSubagentToolExecute } from "../tool/execute.js";
import { renderSubagentToolCall, renderSubagentToolResult } from "../tool/render.js";

export function registerTools(deps: SubagentDeps): void {
  const { pi } = deps;

  pi.registerTool({
    name: "list-agents",
    label: "List Agents",
    description:
      "List available subagent definitions (name, source, model, thinking, tools, description). Useful before planning delegation.",
    parameters: ListAgentsParams,
    execute: async (_toolCallId, _params, _signal, _onUpdate, ctx) => {
      const discovery = discoverAgents(ctx.cwd);
      const agents = discovery.agents;

      if (agents.length === 0) {
        return {
          content: [{ type: "text", text: "No subagents found." }],
          details: {
            projectAgentsDir: discovery.projectAgentsDir,
            agents: [],
          },
        };
      }

      const lines = agents.map((agent) => {
        const model = agent.model ?? "(inherit current model)";
        const thinking = agent.thinking ?? "(inherit current thinking)";
        const tools = agent.tools && agent.tools.length > 0 ? agent.tools.join(",") : "default";
        const description = agent.description ? ` · ${agent.description}` : "";
        return `${agent.name} [${agent.source}] · model: ${model} · thinking: ${thinking} · tools: ${tools}${description}`;
      });

      return {
        content: [{ type: "text", text: `Available subagents\n\n${lines.join("\n")}` }],
        details: {
          projectAgentsDir: discovery.projectAgentsDir,
          agents: agents.map((agent) => ({
            name: agent.name,
            source: agent.source,
            model: agent.model,
            thinking: agent.thinking,
            tools: agent.tools ?? [],
            description: agent.description,
          })),
        },
      };
    },
  });

  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description:
      'CLI-style subagent delegation interface. Always start with `subagent help` to learn available commands, then execute run/continue/batch/chain/runs/status/detail/abort/remove via `{ command: "subagent ..." }`. After any async launch, stop making subagent calls and simply end your response. The subagent will message you again after completion unless the user explicitly asks for manual inspection. Do NOT poll with runs/status/detail right after launch. Tip: when a task description is long, write context to a temp file and pass the file path in the task (e.g. "read /tmp/ctx.md and follow the instructions") — the subagent can read it.',
    parameters: SubagentParams,

    execute: (
      toolCallId: string,
      params: Static<typeof SubagentParams>,
      signal: AbortSignal | undefined,
      onUpdate: ((partial: AgentToolResult<SubagentDetails>) => void) | undefined,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<SubagentDetails>> =>
      createSubagentToolExecute(deps)(toolCallId, params, signal, onUpdate, ctx),

    renderCall: (args: Static<typeof SubagentParams>, theme: Theme): Component =>
      renderSubagentToolCall(args, theme),

    renderResult: (
      result: AgentToolResult<SubagentDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ): Component => renderSubagentToolResult(result, options, theme),
  });
}
