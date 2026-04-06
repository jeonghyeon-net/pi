import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { type Persister } from "./widget.js";
type Messenger = Persister & {
    sendMessage(msg: unknown, opts?: unknown): void;
};
export declare function onRestore(pi: Persister): (_e: unknown, ctx: ExtensionContext) => Promise<void>;
export declare function onBeforeAgentStart(): () => Promise<{
    message: {
        customType: string;
        content: string;
        display: boolean;
    };
} | undefined>;
export declare function onAgentStart(pi: Persister): (_e: unknown, ctx: ExtensionContext) => Promise<void>;
export declare function onAgentEnd(pi: Persister): (_e: unknown, ctx: ExtensionContext) => Promise<void>;
export declare function onMessageEnd(pi: Persister): (_e: unknown, ctx: ExtensionContext) => Promise<void>;
export declare function onCompact(pi: Messenger): (_e: unknown, ctx: ExtensionContext) => Promise<void>;
export declare function onShutdown(): (_e: unknown, ctx: ExtensionContext) => Promise<void>;
export {};
