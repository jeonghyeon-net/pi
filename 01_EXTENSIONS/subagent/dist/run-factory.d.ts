import type { AgentConfig, RunResult } from "./types.js";
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
export declare function createSessionRunner(sessFile: string, ctx: DispatchCtx): (agent: AgentConfig, task: string) => Promise<RunResult>;
