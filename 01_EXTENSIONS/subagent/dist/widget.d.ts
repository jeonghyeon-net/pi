interface MinimalRun {
    id: number;
    agent: string;
    startedAt: number;
}
interface MinimalCtx {
    hasUI: boolean;
    ui: {
        setWidget(key: string, content: unknown, opts?: unknown): void;
    };
}
export declare function buildWidgetLines(runs: MinimalRun[], now: number): string[];
export declare function syncWidget(ctx: MinimalCtx, runs: MinimalRun[]): void;
export {};
