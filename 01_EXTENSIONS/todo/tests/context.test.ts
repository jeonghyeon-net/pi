import { describe, it, expect, beforeEach } from "vitest";
import { buildTurnContext, buildCompactionReminder } from "../src/context.js";
import { addTodo, clearTodos, toggleTodo } from "../src/state.js";

describe("context", () => {
	beforeEach(() => {
		clearTodos();
	});

	it("returns null when empty", () => {
		expect(buildTurnContext()).toBeNull();
		expect(buildCompactionReminder()).toBeNull();
	});

	it("builds turn context with active todo", () => {
		addTodo("test task");
		const ctx = buildTurnContext();
		expect(ctx).not.toBeNull();
		expect(ctx?.content).toContain("test task");
		expect(ctx?.content).toContain("Active");
		expect(ctx?.display).toBe(false);
	});

	it("shows all complete when done", () => {
		addTodo("done");
		toggleTodo(1);
		const ctx = buildTurnContext();
		expect(ctx?.content).toContain("All items complete");
	});

	it("builds compaction reminder with remaining", () => {
		addTodo("pending");
		const reminder = buildCompactionReminder();
		expect(reminder).toContain("pending");
		expect(reminder).toContain("Progress:");
	});

	it("no compaction reminder when all done", () => {
		addTodo("done");
		toggleTodo(1);
		expect(buildCompactionReminder()).toBeNull();
	});
});
