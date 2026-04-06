import type { AgentConfig, RunResult, SubagentPi } from "./types.js";
export interface DispatchCtx {
    hasUI: boolean;
    ui: {
        setWidget(k: string, v: unknown, o?: unknown): void;
    };
    sessionManager: {
        getBranch(): unknown[];
    };
}
export declare function createRunner(main: boolean, ctx: DispatchCtx): (agent: AgentConfig, task: string) => Promise<RunResult>;
export declare function dispatchRun(agent: AgentConfig, task: string, pi: SubagentPi, ctx: DispatchCtx, main: boolean): {
    id: number;
    text: string;
};
export declare function dispatchBatch(items: Array<{
    agent: string;
    task: string;
}>, agents: AgentConfig[], pi: SubagentPi, ctx: DispatchCtx, main: boolean): string;
export declare function dispatchChain(steps: Array<{
    agent: string;
    task: string;
}>, agents: AgentConfig[], pi: SubagentPi, ctx: DispatchCtx, main: boolean): string;
