/**
 * Local type definitions for the subagent tool module.
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { CommandRunState, SingleResult, SubagentDetails } from "../core/types.js";

export type SessionToolCall = {
  name: string;
  argsText: string;
};

export type SessionTurnToolCalls = {
  turn: number;
  toolCalls: SessionToolCall[];
};

export type SessionDetailSummary = {
  finalOutput: string;
  turns: SessionTurnToolCalls[];
  error?: string | undefined;
};

export type ResultFailureDiagnosis = {
  failed: boolean;
  reason?: string | undefined;
};

export type AssistantTextPart = { type: "text"; text: string };
export type AssistantToolCallPart = {
  type: "toolCall";
  name?: string | undefined;
  arguments?: unknown;
};
export type AssistantContentPart = AssistantTextPart | AssistantToolCallPart;
export type AssistantMessageEntry = {
  type?: string | undefined;
  message?: { role?: string | undefined; content?: unknown } | undefined;
};

export type LaunchMode = "single" | "batch" | "chain";

export type FinalizedRun = {
  runState: CommandRunState;
  result?: SingleResult | undefined;
  isError: boolean;
  rawOutput: string;
};

export type SubagentExecuteResult = {
  content: { type: "text"; text: string }[];
  details: SubagentDetails;
  isError?: boolean | undefined;
};

/**
 * Context required by the subagent tool execute handler.
 *
 * `ExtensionContext` satisfies this interface (it is a structural supertype),
 * so callers can pass it directly without `as unknown as` casts.
 */
export type SubagentToolExecuteContext = Pick<
  ExtensionContext,
  "cwd" | "hasUI" | "model" | "modelRegistry" | "sessionManager" | "ui"
>;
