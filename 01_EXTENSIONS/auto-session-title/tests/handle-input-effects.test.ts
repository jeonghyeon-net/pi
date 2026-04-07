import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeInput, stubContext, stubRuntime } from "./helpers.js";

const { resolveSessionTitle } = vi.hoisted(() => ({ resolveSessionTitle: vi.fn() }));
vi.mock("../src/summarize.js", () => ({ resolveSessionTitle }));

import { handleInput } from "../src/handlers.js";

describe("handleInput effects", () => {
	beforeEach(() => resolveSessionTitle.mockReset());

	it("sets the session name from the first user input", async () => {
		resolveSessionTitle.mockResolvedValue("Fix footer title handling");
		const runtime = stubRuntime();
		const ctx = stubContext();
		await handleInput(runtime, makeInput("Fix footer title handling"), ctx);
		expect(runtime.setSessionName).toHaveBeenCalledWith("Fix footer title handling");
		expect(ctx.ui.setTitle).toHaveBeenCalledWith("π - Fix footer title handling");
	});

	it("uses sessionManager.getCwd when ctx.cwd is empty", async () => {
		resolveSessionTitle.mockResolvedValue("Investigate cwd fallback");
		const runtime = stubRuntime();
		const ctx = stubContext({ cwd: "" });
		await handleInput(runtime, makeInput("Investigate cwd fallback"), ctx);
		expect(ctx.ui.setTitle).toHaveBeenCalledWith("π - Investigate cwd fallback");
	});

	it("sets the session name without touching UI when no UI is available", async () => {
		resolveSessionTitle.mockResolvedValue("Investigate notify footer sync");
		const runtime = stubRuntime();
		const ctx = stubContext({ hasUI: false });
		await handleInput(runtime, makeInput("Investigate notify footer sync", "rpc"), ctx);
		expect(runtime.setSessionName).toHaveBeenCalledWith("Investigate notify footer sync");
		expect(ctx.ui.setTitle).not.toHaveBeenCalled();
	});
});
