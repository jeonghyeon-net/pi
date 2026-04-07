import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeInput, stubContext, stubRuntime } from "./helpers.js";

const { resolveSessionTitle } = vi.hoisted(() => ({ resolveSessionTitle: vi.fn() }));
vi.mock("../src/summarize.js", () => ({ resolveSessionTitle }));

import { handleInput } from "../src/handlers.js";

describe("handleInput guards", () => {
	beforeEach(() => resolveSessionTitle.mockReset());

	it("does not rename when the runtime already has a name", async () => {
		const runtime = stubRuntime("Existing");
		await handleInput(runtime, makeInput("New request"), stubContext());
		expect(runtime.setSessionName).not.toHaveBeenCalled();
		expect(resolveSessionTitle).not.toHaveBeenCalled();
	});

	it("does not rename when the session manager already has a name", async () => {
		const ctx = stubContext({ sessionManager: { getSessionName: () => "Existing", getEntries: () => [], getCwd: () => "/Users/me/Desktop/pi" } });
		await handleInput(stubRuntime(), makeInput("New request"), ctx);
		expect(resolveSessionTitle).not.toHaveBeenCalled();
	});

	it("does not rename when a user message already exists", async () => {
		const ctx = stubContext({ sessionManager: { getSessionName: () => undefined, getEntries: () => [{ type: "message", message: { role: "user" } }], getCwd: () => "/Users/me/Desktop/pi" } });
		await handleInput(stubRuntime(), makeInput("New request"), ctx);
		expect(resolveSessionTitle).not.toHaveBeenCalled();
	});

	it("does not treat assistant messages as prior user input", async () => {
		resolveSessionTitle.mockResolvedValue("Assistant history title");
		const ctx = stubContext({ sessionManager: { getSessionName: () => undefined, getEntries: () => [{ type: "message", message: { role: "assistant" } }], getCwd: () => "/Users/me/Desktop/pi" } });
		const runtime = stubRuntime();
		await handleInput(runtime, makeInput("Investigate assistant history"), ctx);
		expect(runtime.setSessionName).toHaveBeenCalledWith("Assistant history title");
	});

	it("ignores extension-delivered input and empty derived titles", async () => {
		resolveSessionTitle.mockResolvedValue(undefined);
		const runtime = stubRuntime();
		await handleInput(runtime, makeInput("Internal message", "extension"), stubContext());
		await handleInput(runtime, makeInput("ignored"), stubContext());
		expect(runtime.setSessionName).not.toHaveBeenCalled();
	});
});
