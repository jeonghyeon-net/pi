import type { UsageStats } from "./types.js";
import type { ParsedEvent } from "./parser.js";
export declare function getPiCommand(execPath: string, argv1: string, exists: (p: string) => boolean): {
    cmd: string;
    base: string[];
};
export interface BuildArgsInput {
    base: string[];
    model?: string;
    tools?: string[];
    systemPromptPath: string;
    task: string;
    sessionPath?: string;
}
export declare function buildArgs(input: BuildArgsInput): string[];
export declare function collectOutput(events: ParsedEvent[]): {
    output: string;
    usage: UsageStats;
    escalation?: string;
};
