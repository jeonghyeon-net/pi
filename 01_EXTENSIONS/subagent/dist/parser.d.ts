import type { UsageStats } from "./types.js";
export interface ParsedEvent {
    type: "message" | "tool_start" | "tool_end" | "agent_end";
    text?: string;
    usage?: Partial<UsageStats>;
    toolName?: string;
}
export declare function parseLine(line: string): ParsedEvent | null;
