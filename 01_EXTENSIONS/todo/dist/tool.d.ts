import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { type Persister } from "./widget.js";
export declare function createTodoTool(pi: Persister): {
    name: string;
    label: string;
    description: string;
    parameters: import("@sinclair/typebox").TObject<{
        action: import("@sinclair/typebox").TUnsafe<"list" | "add" | "toggle" | "clear">;
        text: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
        id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
    }>;
    execute(_toolCallId: string, params: {
        action: string;
        text?: string;
        id?: number;
    }, _signal: unknown, _onUpdate: unknown, ctx: ExtensionContext): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
        details: import("./types.js").TodoDetails;
    }>;
};
