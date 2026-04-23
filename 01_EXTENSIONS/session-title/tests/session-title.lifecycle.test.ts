import { describe, expect, it } from "vitest";
import extension from "../src/session-title.ts";
import { createApiMock, createContext } from "./helpers.ts";

describe("session-title lifecycle", () => {
	it("syncs on tree and agent end, then clears on shutdown", async () => {
		const api = createApiMock("Release prep");
		extension(api.api);
		const sessionTree = api.getHandler("session_tree");
		const agentEnd = api.getHandler("agent_end");
		const sessionShutdown = api.getHandler("session_shutdown");
		if (!sessionTree || !agentEnd || !sessionShutdown) throw new Error("missing lifecycle handlers");
		const { ctx, setStatus, setTitle } = createContext({});
		await sessionTree({}, ctx);
		await agentEnd({}, ctx);
		await sessionShutdown({}, ctx);
		expect(setStatus).toHaveBeenCalledWith("session-title", "Release prep");
		expect(setTitle).toHaveBeenLastCalledWith("π - pi-project");
	});

	it("clears cleanly even when the session file lookup fails", async () => {
		const api = createApiMock("Release prep");
		extension(api.api);
		const sessionShutdown = api.getHandler("session_shutdown");
		if (!sessionShutdown) throw new Error("missing session_shutdown handler");
		const { ctx, setStatus, setTitle } = createContext({});
		ctx.sessionManager.getSessionFile = () => {
			throw new Error("boom");
		};
		await sessionShutdown({}, ctx);
		expect(setStatus).toHaveBeenCalledWith("session-title", undefined);
		expect(setTitle).toHaveBeenCalledWith("π - pi-project");
	});

	it("also clears cleanly when no session file is available", async () => {
		const api = createApiMock("Release prep");
		extension(api.api);
		const sessionShutdown = api.getHandler("session_shutdown");
		if (!sessionShutdown) throw new Error("missing session_shutdown handler");
		const { ctx, setStatus, setTitle } = createContext({});
		ctx.sessionManager.getSessionFile = () => undefined;
		await sessionShutdown({}, ctx);
		expect(setStatus).toHaveBeenCalledWith("session-title", undefined);
		expect(setTitle).toHaveBeenCalledWith("π - pi-project");
	});
});
