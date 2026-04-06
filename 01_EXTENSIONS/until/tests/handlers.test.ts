import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/state.js", () => ({
	setAgentRunning: vi.fn(),
	setUi: vi.fn(),
	clearAllTasks: vi.fn(),
}));

import {
	handleAgentStart,
	handleAgentEnd,
	filterContext,
	handleSessionStart,
	handleSessionShutdown,
} from "../src/handlers.js";
import { setAgentRunning, setUi, clearAllTasks } from "../src/state.js";

const makeUi = () => ({ notify: vi.fn(), setStatus: vi.fn(), theme: { fg: vi.fn() } });

function ctxWith(hasUI: boolean) {
	const ui = makeUi();
	return { hasUI, ui } as { hasUI: boolean; ui: ReturnType<typeof makeUi> };
}

beforeEach(() => vi.clearAllMocks());

describe("handleAgentStart", () => {
	it("sets running=true and sets UI when hasUI=true", () => {
		const ctx = ctxWith(true);
		handleAgentStart(ctx);
		expect(setAgentRunning).toHaveBeenCalledWith(true);
		expect(setUi).toHaveBeenCalledWith(ctx.ui);
	});
	it("sets running=true but skips UI when hasUI=false", () => {
		const ctx = ctxWith(false);
		handleAgentStart(ctx);
		expect(setAgentRunning).toHaveBeenCalledWith(true);
		expect(setUi).not.toHaveBeenCalled();
	});
});

describe("handleAgentEnd", () => {
	it("sets running=false and sets UI when hasUI=true", () => {
		const ctx = ctxWith(true);
		handleAgentEnd(ctx);
		expect(setAgentRunning).toHaveBeenCalledWith(false);
		expect(setUi).toHaveBeenCalledWith(ctx.ui);
	});
	it("sets running=false but skips UI when hasUI=false", () => {
		const ctx = ctxWith(false);
		handleAgentEnd(ctx);
		expect(setAgentRunning).toHaveBeenCalledWith(false);
		expect(setUi).not.toHaveBeenCalled();
	});
});

describe("filterContext", () => {
	it("removes custom messages with customType=until", () => {
		const msgs = [{ role: "user" }, { role: "custom", customType: "until" }];
		const result = filterContext({ messages: msgs });
		expect(result).toEqual({ messages: [{ role: "user" }] });
	});
	it("returns undefined when no messages are filtered", () => {
		const msgs = [{ role: "user" }, { role: "assistant" }];
		expect(filterContext({ messages: msgs })).toBeUndefined();
	});
	it("keeps non-custom and custom messages with different customType", () => {
		const msgs = [{ role: "user" }, { role: "custom", customType: "other" }];
		expect(filterContext({ messages: msgs })).toBeUndefined();
	});
});

describe("handleSessionStart", () => {
	it("clears tasks and sets UI when hasUI=true", () => {
		const ctx = ctxWith(true);
		handleSessionStart(ctx);
		expect(clearAllTasks).toHaveBeenCalled();
		expect(setUi).toHaveBeenCalledWith(ctx.ui);
	});
	it("clears tasks without UI when hasUI=false", () => {
		const ctx = ctxWith(false);
		handleSessionStart(ctx);
		expect(clearAllTasks).toHaveBeenCalled();
		expect(setUi).not.toHaveBeenCalled();
	});
});

describe("handleSessionShutdown", () => {
	it("clears all tasks", () => {
		handleSessionShutdown();
		expect(clearAllTasks).toHaveBeenCalled();
	});
});
