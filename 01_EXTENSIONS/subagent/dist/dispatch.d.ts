import type { AgentConfig, SubagentPi } from "./types.js";
import { createRunner } from "./run-factory.js";
export type { DispatchCtx } from "./run-factory.js";
export declare function dispatchRun(agent: AgentConfig, task: string, pi: SubagentPi, ctx: Parameters<typeof createRunner>[1], main: boolean): {
    text: string;
};
export declare function dispatchBatch(items: Array<{
    agent: string;
    task: string;
}>, agents: AgentConfig[], pi: SubagentPi, ctx: Parameters<typeof createRunner>[1], main: boolean): string;
export declare function dispatchChain(steps: Array<{
    agent: string;
    task: string;
}>, agents: AgentConfig[], pi: SubagentPi, ctx: Parameters<typeof createRunner>[1], main: boolean): string;
export declare function dispatchAbort(id: number): string;
export declare function dispatchContinue(id: number, task: string, agents: AgentConfig[], pi: SubagentPi, ctx: Parameters<typeof createRunner>[1]): string;
export declare function onSessionRestore(pi: SubagentPi): (_e: unknown, ctx: Parameters<typeof createRunner>[1]) => Promise<void>;
