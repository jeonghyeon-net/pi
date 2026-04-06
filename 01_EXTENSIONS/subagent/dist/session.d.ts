interface RunHistoryItem {
    id: number;
    agent: string;
    output?: string;
    sessionFile?: string;
}
export declare function sessionPath(id: number, home?: string): string;
export declare function addToHistory(item: RunHistoryItem): void;
export declare function getRunHistory(): RunHistoryItem[];
export declare function buildRunsEntry(): {
    runs: RunHistoryItem[];
    updatedAt: number;
};
export declare function restoreRuns(entries: Array<{
    type: string;
}>): void;
export declare function resetSession(): void;
export {};
