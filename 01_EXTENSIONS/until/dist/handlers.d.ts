import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
export declare function handleAgentStart(ctx: ExtensionContext): void;
export declare function handleAgentEnd(ctx: ExtensionContext): void;
export declare function filterContext<T extends {
    role: string;
}>(event: {
    messages: T[];
}): {
    messages: T[];
} | undefined;
export declare function handleSessionStart(ctx: ExtensionContext): void;
export declare function handleSessionShutdown(): void;
