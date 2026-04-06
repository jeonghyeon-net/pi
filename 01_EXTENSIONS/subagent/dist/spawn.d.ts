import type { RunResult } from "./types.js";
export declare function spawnAndCollect(cmd: string, args: string[], id: number, agentName: string): Promise<RunResult>;
