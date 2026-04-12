import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTerseCommand } from "../src/command.js";
import { isEnabled, resetState } from "../src/state.js";

function createCtx() {
	const notify = vi.fn<(message: string, type?: "info" | "warning" | "error") => void>();
	return { ctx: { ui: { notify } }, notify };
}

describe("createTerseCommand", () => {
	beforeEach(() => {
		resetState();
	});

	it("shows status by default and when disabled", async () => {
		const saveState = vi.fn(async () => undefined);
		const { ctx, notify } = createCtx();
		const command = createTerseCommand(saveState);
		await command.handler("", ctx);
		expect(saveState).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith("terse mode 현재 켜짐.", "info");

		await command.handler("off", ctx);
		await command.handler("status", ctx);
		expect(notify).toHaveBeenLastCalledWith("terse mode 현재 꺼짐.", "info");
	});

	it("enables, disables, and toggles mode while persisting global state", async () => {
		const saveState = vi.fn(async () => undefined);
		const { ctx, notify } = createCtx();
		const command = createTerseCommand(saveState);

		await command.handler("off", ctx);
		expect(isEnabled()).toBe(false);
		expect(notify).toHaveBeenLastCalledWith("terse mode 껐어. 새 세션에도 유지돼.", "info");
		expect(saveState).toHaveBeenLastCalledWith(false);

		await command.handler("on", ctx);
		expect(isEnabled()).toBe(true);
		expect(notify).toHaveBeenLastCalledWith("terse mode 켰어. 새 세션에도 유지돼.", "info");
		expect(saveState).toHaveBeenLastCalledWith(true);

		await command.handler("toggle", ctx);
		expect(isEnabled()).toBe(false);
		expect(notify).toHaveBeenLastCalledWith("terse mode 껐어. 새 세션에도 유지돼.", "info");
	});

	it("does not persist when state is unchanged", async () => {
		const saveState = vi.fn(async () => undefined);
		const { ctx, notify } = createCtx();
		const command = createTerseCommand(saveState);

		await command.handler("on", ctx);
		expect(saveState).not.toHaveBeenCalled();
		expect(notify).toHaveBeenLastCalledWith("terse mode 이미 켜져 있어.", "info");

		await command.handler("off", ctx);
		expect(saveState).toHaveBeenCalledTimes(1);
		await command.handler("off", ctx);
		expect(saveState).toHaveBeenCalledTimes(1);
		expect(notify).toHaveBeenLastCalledWith("terse mode 이미 꺼져 있어.", "info");
	});

	it("rolls back in-memory state when global save fails", async () => {
		const saveState = vi.fn(async () => {
			throw new Error("nope");
		});
		const { ctx, notify } = createCtx();
		await createTerseCommand(saveState).handler("off", ctx);
		expect(isEnabled()).toBe(true);
		expect(notify).toHaveBeenLastCalledWith("terse mode 상태 저장 실패. 기존 값으로 유지했어.", "error");
	});

	it("rejects unknown arguments", async () => {
		const saveState = vi.fn(async () => undefined);
		const { ctx, notify } = createCtx();
		await createTerseCommand(saveState).handler("weird", ctx);
		expect(notify).toHaveBeenCalledWith("사용법: /terse on|off|status|toggle", "warning");
	});
});
