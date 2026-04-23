import { beforeEach, describe, expect, it, vi } from "vitest";
import * as generator from "../src/title-generator.ts";
import extension from "../src/session-title.ts";
import { createApiMock, createContext } from "./helpers.ts";

describe("session-title async refresh", () => {
	beforeEach(() => vi.restoreAllMocks());

	it("does not overwrite a name restored during generation", async () => {
		const gate = Promise.withResolvers<string>();
		vi.spyOn(generator, "generateSessionTitle").mockReturnValue(gate.promise);
		const api = createApiMock();
		extension(api.api);
		const beforeAgentStart = api.getHandler("before_agent_start");
		if (!beforeAgentStart) throw new Error("missing before_agent_start handler");
		let restoredName = "";
		const { ctx } = createContext({ sessionName: "" });
		ctx.sessionManager.getSessionName = () => restoredName;
		const pending = beforeAgentStart({ prompt: "Please add terminal title sync." }, ctx);
		restoredName = "Restored later";
		gate.resolve("Generated title");
		await pending;
		expect(api.getSessionName()).toBe("");
		expect(ctx.sessionManager.getSessionName()).toBe("Restored later");
	});

	it("refines the auto title from richer session context as work progresses", async () => {
		const spy = vi.spyOn(generator, "generateSessionTitle").mockResolvedValueOnce("session title auto naming").mockResolvedValueOnce("session-title async refresh");
		const api = createApiMock();
		extension(api.api);
		const beforeAgentStart = api.getHandler("before_agent_start");
		const agentEnd = api.getHandler("agent_end");
		if (!beforeAgentStart || !agentEnd) throw new Error("missing handlers");
		const { ctx } = createContext({
			branchEntries: [
				{ type: "message", message: { role: "user", content: "Please add a session title extension." } },
				{ type: "message", message: { role: "assistant", content: "Implemented the first pass." } },
				{ type: "message", message: { role: "user", content: "Also update it asynchronously with more context and hide branch names." } },
			],
		});
		await beforeAgentStart({ prompt: "Please add a session title extension." }, ctx);
		await agentEnd({}, ctx);
		expect(api.getSessionName()).toBe("session-title async refresh");
		expect(spy).toHaveBeenNthCalledWith(2, ctx, expect.objectContaining({
			firstUserPrompt: "Please add a session title extension.",
			recentUserPrompts: expect.arrayContaining([
				"Please add a session title extension.",
				"Also update it asynchronously with more context and hide branch names.",
			]),
			latestAssistantText: "Implemented the first pass.",
		}));
	});

	it("does not overwrite a manual title during later refreshes", async () => {
		vi.spyOn(generator, "generateSessionTitle").mockResolvedValue("session-title async refresh");
		const api = createApiMock("Manual title");
		extension(api.api);
		const agentEnd = api.getHandler("agent_end");
		if (!agentEnd) throw new Error("missing agent_end handler");
		await agentEnd({}, createContext({ branchEntries: [{ type: "message", message: { role: "user", content: "Hide branch names too." } }] }).ctx);
		expect(api.getSessionName()).toBe("Manual title");
	});
});
