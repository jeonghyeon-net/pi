import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { SendMessageFn } from "./types.js";
export declare function createUntilsCommand(_sendMsg: SendMessageFn): {
    description: string;
    handler: (_args: string, ctx: ExtensionCommandContext) => Promise<void>;
};
