import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { execute } from "./execute.js";
import { buildEntry } from "./state.js";
import { syncWidget } from "./widget.js";
const TodoParams = Type.Object({
    action: StringEnum(["list", "add", "toggle", "clear"]),
    text: Type.Optional(Type.String({ description: "Todo text (for add)" })),
    id: Type.Optional(Type.Number({ description: "Todo ID (for toggle)" })),
});
export function createTodoTool(pi) {
    return {
        name: "todo",
        label: "Todo",
        description: "Manage a todo list. Actions: list, add (text), toggle (id), clear",
        parameters: TodoParams,
        execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            const result = execute(params);
            pi.appendEntry("todo-state", buildEntry());
            syncWidget(ctx, pi);
            return Promise.resolve(result);
        },
    };
}
