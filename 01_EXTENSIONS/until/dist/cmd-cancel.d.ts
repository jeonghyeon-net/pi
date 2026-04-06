import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
export declare function createCancelCommand(): {
    description: string;
    handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
};
