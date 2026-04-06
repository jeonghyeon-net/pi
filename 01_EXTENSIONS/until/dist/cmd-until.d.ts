import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
export declare function createUntilCommand(): {
    description: string;
    getArgumentCompletions: (prefix: string) => {
        value: string;
        label: string;
    }[] | null;
    handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
};
