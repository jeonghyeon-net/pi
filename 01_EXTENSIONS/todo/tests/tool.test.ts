import { describe, it, expect, vi } from "vitest";
import { createTodoTool } from "../src/tool.js";

function stubPi() {
	return { appendEntry: vi.fn() };
}

function stubCtx() {
	return {
		hasUI: true,
		ui: { setWidget: vi.fn() },
	};
}

describe("createTodoTool", () => {
	it("has correct name", () => {
		const tool = createTodoTool(stubPi());
		expect(tool.name).toBe("todo");
	});

	it("execute returns result and persists", async () => {
		const pi = stubPi();
		const tool = createTodoTool(pi);
		const ctx = stubCtx();
		const r = await tool.execute("", { action: "list" }, undefined, undefined, ctx);
		expect(r.content[0].text).toBe("No todos");
		expect(pi.appendEntry).toHaveBeenCalledWith("todo-state", expect.objectContaining({ todos: [] }));
	});
});
