import type { RunResult, AgentConfig } from "./types.js";
type RunnerFn = (agent: AgentConfig, task: string) => Promise<RunResult>;
interface ExecOpts {
    runner: RunnerFn;
    concurrency?: number;
}
export declare function executeSingle(agent: AgentConfig, task: string, opts: ExecOpts): Promise<RunResult>;
export declare function executeBatch(items: Array<{
    agent: string;
    task: string;
}>, agents: AgentConfig[], opts: ExecOpts): Promise<RunResult[]>;
export declare function executeChain(steps: Array<{
    agent: string;
    task: string;
}>, agents: AgentConfig[], opts: ExecOpts): Promise<RunResult>;
export {};
