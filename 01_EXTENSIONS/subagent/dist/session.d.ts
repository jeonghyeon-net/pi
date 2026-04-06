import type { RunResult } from "./types.js";
export interface HistoryEvent {
    type: string;
    text?: string;
    toolName?: string;
}
interface RunHistoryItem {
    id: number;
    agent: string;
    output?: string;
    sessionFile?: string;
    events?: HistoryEvent[];
}
export declare function sessionPath(id: number, home?: string): string;
export declare function addToHistory(item: RunHistoryItem): void;
export declare function getRunHistory(): RunHistoryItem[];
export declare function addPending(result: RunResult): void;
export declare function drainPending(): RunResult[];
export declare function resetPending(): void;
export declare function buildRunsEntry(): {
    runs: RunHistoryItem[];
    pending: RunResult[];
    updatedAt: number;
};
export declare function restoreRuns(entries: Array<{
    type: string;
}>): void;
export declare function getSessionFile(id: number): string | undefined;
export declare function resetSession(): void;
export {};
