import type { SubagentPi } from "./types.js";
import type { DispatchCtx } from "./dispatch.js";
export declare function errorMsg(e: unknown): string;
export declare function createTool(pi: SubagentPi, agentsDir: string): {
    name: string;
    label: string;
    description: string;
    parameters: import("@sinclair/typebox").TObject<{
        command: import("@sinclair/typebox").TString;
    }>;
    execute(_id: string, params: {
        command: string;
    }, _signal: unknown, _onUpdate: unknown, ctx: DispatchCtx): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
        details: {
            isError: boolean;
        };
    }>;
};
