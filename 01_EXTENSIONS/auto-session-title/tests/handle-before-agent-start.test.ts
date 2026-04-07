import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleBeforeAgentStart } from "../src/handlers.js";
import { stubContext, stubRuntime } from "./helpers.js";

const { resolveSessionTitle } = vi.hoisted(() => ({ resolveSessionTitle: vi.fn() }));
vi.mock("../src/summarize.js", async () => ({ ...(await vi.importActual("../src/summarize.js")), resolveSessionTitle }));

describe("handleBeforeAgentStart", () => {
	beforeEach(() => resolveSessionTitle.mockReset());

	it("sets the session name and title from pending input", async () => {
		resolveSessionTitle.mockResolvedValue("Fix footer title handling");
		const runtime = stubRuntime();
		const ctx = stubContext();
		const pending = new Map<string, string>([["session-1", "raw input"]]);
		await handleBeforeAgentStart(pending, runtime, ctx);
		expect(runtime.setSessionName).toHaveBeenCalledWith("Fix footer title handling");
		expect(ctx.ui.setTitle).toHaveBeenCalledWith("π - Fix footer title handling");
		expect(pending.size).toBe(0);
	});

	it("uses session cwd fallback when title generation succeeds", async () => {
		resolveSessionTitle.mockResolvedValue("Investigate cwd fallback");
		const ctx = stubContext({ cwd: "" });
		await handleBeforeAgentStart(new Map([["session-1", "raw input"]]), stubRuntime(), ctx);
		expect(ctx.ui.setTitle).toHaveBeenCalledWith("π - Investigate cwd fallback");
	});

	it("preserves pending input when title generation fails or no input is queued", async () => {
		resolveSessionTitle.mockResolvedValue(undefined);
		const ctx = stubContext();
		const pending = new Map<string, string>([["session-1", "raw input"]]);
		await handleBeforeAgentStart(pending, stubRuntime(), ctx);
		await handleBeforeAgentStart(new Map(), stubRuntime(), ctx);
		expect(ctx.ui.setTitle).not.toHaveBeenCalled();
		expect(pending.get("session-1")).toBe("raw input");
	});

	it("does nothing when a title already exists or no UI is available", async () => {
		const pending = new Map<string, string>([["session-1", "raw input"]]);
		await handleBeforeAgentStart(pending, stubRuntime("Existing"), stubContext());
		resolveSessionTitle.mockResolvedValue("Investigate notify footer sync");
		const runtime = stubRuntime();
		const ctx = stubContext({ hasUI: false });
		await handleBeforeAgentStart(pending, runtime, ctx);
		expect(runtime.setSessionName).toHaveBeenCalledWith("Investigate notify footer sync");
		expect(ctx.ui.setTitle).not.toHaveBeenCalled();
	});
});
