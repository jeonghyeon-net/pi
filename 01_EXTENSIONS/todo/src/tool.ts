import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { execute } from "./execute.js";
import { buildEntry } from "./state.js";
import { syncWidget, type Persister } from "./widget.js";

const TodoParams = Type.Object({
	action: StringEnum(["list", "add", "toggle", "clear"] as const),
	text: Type.Optional(Type.String({ description: "Todo text (for add)" })),
	id: Type.Optional(Type.Number({ description: "Todo ID (for toggle)" })),
});

export function createTodoTool(pi: Persister) {
	return {
		name: "todo",
		label: "Todo",
		description: "Manage a todo list. Actions: list, add (text), toggle (id), clear",
		parameters: TodoParams,
		execute(
			_toolCallId: string,
			params: { action: string; text?: string; id?: number },
			_signal: unknown,
			_onUpdate: unknown,
			ctx: ExtensionContext,
		) {
			const result = execute(params);
			pi.appendEntry("todo-state", buildEntry());
			syncWidget(ctx, pi);
			return Promise.resolve(result);
		},
	};
}
