import type { Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import type { McpManager } from "./manager.js";
import { buildMcpToolResultContent, formatToolResult, preparePayloadForClient } from "./payload.js";
import type { DiscoveredTool } from "./types.js";

interface McpToolResultDetails {
  server: string;
  tool: string;
  cancelled?: boolean;
  disabled?: boolean;
  raw?: unknown | undefined;
  payloadTruncated?: boolean;
  payloadOriginalLength?: number;
  payloadFilePath?: string | undefined;
  isError?: boolean;
  error?: string;
  status?: string;
}

export interface McpToolResult {
  content: { type: "text"; text: string }[];
  details: McpToolResultDetails;
}

const ARG_SUMMARY_MAX_CHARS = 80;
const ARG_SUMMARY_TRUNCATE_AT = 77;

function summarizeToolCallArgs(args: Record<string, unknown>, theme: Theme): string {
  const entries = Object.entries(args).filter(([, value]) => value !== undefined && value !== null);
  if (entries.length === 0) return "";

  const firstEntry = entries[0];
  if (!firstEntry) return "";

  const [, firstVal] = firstEntry;
  const str = typeof firstVal === "string" ? firstVal : JSON.stringify(firstVal);
  const display =
    str.length > ARG_SUMMARY_MAX_CHARS ? `${str.slice(0, ARG_SUMMARY_TRUNCATE_AT)}…` : str;
  const extraCount = entries.length > 1 ? theme.fg("muted", ` +${entries.length - 1}`) : "";
  return ` ${theme.fg("accent", display)}${extraCount}`;
}

export function renderMcpToolCall(
  serverName: string,
  toolName: string,
  args: unknown,
  theme: Theme,
): Text {
  const label = `${serverName}/${toolName}`;
  const params = (args ?? {}) as Record<string, unknown>;
  const argText = summarizeToolCallArgs(params, theme);
  return new Text(`${theme.fg("toolTitle", theme.bold(label))}${argText}`, 0, 0);
}

export interface ExecuteMcpToolCallArgs {
  manager: McpManager;
  serverName: string;
  tool: DiscoveredTool;
  params: Record<string, unknown>;
  signal?: AbortSignal;
  isToolDisabled: (serverName: string, toolName: string) => boolean;
}

function buildCancelled(serverName: string, toolName: string): McpToolResult {
  return {
    content: [{ type: "text", text: "Cancelled" }],
    details: { server: serverName, tool: toolName, cancelled: true },
  };
}

function buildDisabled(serverName: string, toolName: string): McpToolResult {
  return {
    content: [
      {
        type: "text",
        text: "This MCP tool is disabled. Open /mcp-status → Tools to enable it.",
      },
    ],
    details: { server: serverName, tool: toolName, disabled: true, isError: true },
  };
}

function buildErrorResult(serverName: string, toolName: string, message: string): McpToolResult {
  return {
    content: [{ type: "text", text: `MCP error: ${message}` }],
    details: { server: serverName, tool: toolName, error: message, isError: true },
  };
}

export async function executeMcpToolCall(args: ExecuteMcpToolCallArgs): Promise<McpToolResult> {
  const { manager, serverName, tool, params, signal, isToolDisabled } = args;
  if (signal?.aborted) {
    return buildCancelled(serverName, tool.name);
  }
  if (isToolDisabled(serverName, tool.name)) {
    return buildDisabled(serverName, tool.name);
  }

  try {
    const result = await manager.callTool(serverName, tool.name, params);
    const formatted = formatToolResult(result);
    const prepared = preparePayloadForClient(formatted.text, serverName, tool.name);
    const rawFromResult = (result as { isError?: boolean })?.isError;
    const details: McpToolResultDetails = {
      server: serverName,
      tool: tool.name,
      raw: prepared.truncated ? undefined : result,
      payloadTruncated: prepared.truncated,
      payloadOriginalLength: prepared.originalLength,
      payloadFilePath: prepared.fullPayloadPath,
      isError: Boolean(rawFromResult),
    };
    return {
      content: buildMcpToolResultContent(formatted, prepared),
      details,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return buildErrorResult(serverName, tool.name, message);
  }
}
