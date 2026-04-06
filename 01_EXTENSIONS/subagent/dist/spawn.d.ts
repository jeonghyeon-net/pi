import type { RunResult } from "./types.js";
import type { ParsedEvent } from "./parser.js";
export declare function spawnAndCollect(cmd: string, args: string[], id: number, agentName: string, signal?: AbortSignal, onEvent?: (evt: ParsedEvent) => void): Promise<RunResult>;
