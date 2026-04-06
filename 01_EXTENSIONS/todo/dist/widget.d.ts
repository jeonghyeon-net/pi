import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
export declare const WIDGET_KEY = "todo";
export type Persister = {
    appendEntry(type: string, data: unknown): void;
};
type WidgetCtx = Pick<ExtensionContext, "hasUI"> & {
    ui: {
        setWidget(key: string, content: unknown, options?: unknown): void;
    };
};
export declare function setAgentRunning(running: boolean): void;
export declare function incrementTurn(): void;
export declare function syncWidget(ctx: WidgetCtx, pi?: Persister): void;
export declare function cleanupWidget(ctx: WidgetCtx): void;
export {};
