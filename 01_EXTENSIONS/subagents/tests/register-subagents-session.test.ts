import { describe, expect, it, vi } from "vitest";
import {
	getFallbackSessionId,
	patchSessionManager,
	type SessionManagerLike,
} from "../src/register-subagents";

describe("register-subagents session patch", () => {
	it("reuses fallback derived from session file", () => {
		const sessionManager: SessionManagerLike = {
			getSessionFile: () => "/tmp/example-session.jsonl",
		};

		expect(getFallbackSessionId(sessionManager)).toBe("example-session");
		expect(getFallbackSessionId(sessionManager)).toBe("example-session");
	});

	it("generates cached fallback when session file missing", () => {
		const now = vi.spyOn(Date, "now").mockReturnValue(12345);
		const sessionManager: SessionManagerLike = {};

		expect(getFallbackSessionId(sessionManager)).toBe("session-9ix");
		expect(getFallbackSessionId(sessionManager)).toBe("session-9ix");

		now.mockRestore();
	});

	it("patches missing session manager methods", () => {
		patchSessionManager(undefined);
		const sessionManager: SessionManagerLike = {
			getSessionFile: () => "/tmp/fallback.jsonl",
		};

		patchSessionManager(sessionManager);

		expect(sessionManager.getSessionId?.()).toBe("fallback");
	});

	it("keeps real session id when already present", () => {
		const sessionManager: SessionManagerLike = {
			getSessionId: () => "real-session",
			getSessionFile: () => "/tmp/ignored.jsonl",
		};

		patchSessionManager(sessionManager);

		expect(sessionManager.getSessionId?.()).toBe("real-session");
	});

	it("falls back until real session id appears", () => {
		let sessionId: string | undefined;
		const sessionManager: SessionManagerLike = {
			getSessionId: () => sessionId,
			getSessionFile: () => "/tmp/derived.jsonl",
		};

		patchSessionManager(sessionManager);
		expect(sessionManager.getSessionId?.()).toBe("derived");

		sessionId = "ready";
		expect(sessionManager.getSessionId?.()).toBe("ready");
	});
});
