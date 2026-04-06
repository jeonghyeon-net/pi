export declare const SubagentParams: import("@sinclair/typebox").TObject<{
    command: import("@sinclair/typebox").TString;
}>;
export interface AgentConfig {
    name: string;
    description: string;
    model?: string;
    thinking?: string;
    tools?: string[];
    systemPrompt: string;
    filePath: string;
}
export interface RunResult {
    id: number;
    agent: string;
    output: string;
    usage: UsageStats;
    escalation?: string;
    error?: string;
}
export interface UsageStats {
    inputTokens: number;
    outputTokens: number;
    turns: number;
}
export interface ActiveRun {
    id: number;
    agent: string;
    startedAt: number;
    abort: () => void;
}
export interface SubagentPi {
    sendMessage(msg: {
        customType: string;
        content: string;
        display: boolean;
    }, opts?: {
        deliverAs?: string;
        triggerTurn?: boolean;
    }): void;
    appendEntry(type: string, data?: unknown): void;
}
export type Subcommand = {
    type: "run";
    agent: string;
    task: string;
    main: boolean;
    cwd?: string;
} | {
    type: "batch";
    items: Array<{
        agent: string;
        task: string;
    }>;
    main: boolean;
} | {
    type: "chain";
    steps: Array<{
        agent: string;
        task: string;
    }>;
    main: boolean;
} | {
    type: "continue";
    id: number;
    task: string;
} | {
    type: "detail";
    id: number;
} | {
    type: "runs";
};
