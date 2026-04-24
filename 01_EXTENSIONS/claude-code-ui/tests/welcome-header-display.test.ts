import { afterEach, describe, expect, it } from "vitest";
import { createPiWelcomeHeader } from "../src/header.ts";
import { makeContext, theme } from "./header-test-helpers.ts";

const originalDisplayName = process.env.PI_DISPLAY_NAME;
const originalClaudeCodeUser = process.env.CLAUDE_CODE_USER;
const originalUser = process.env.USER;
const originalLogname = process.env.LOGNAME;

afterEach(() => {
	if (originalDisplayName == null) delete process.env.PI_DISPLAY_NAME;
	else process.env.PI_DISPLAY_NAME = originalDisplayName;
	if (originalClaudeCodeUser == null) delete process.env.CLAUDE_CODE_USER;
	else process.env.CLAUDE_CODE_USER = originalClaudeCodeUser;
	if (originalUser == null) delete process.env.USER;
	else process.env.USER = originalUser;
	if (originalLogname == null) delete process.env.LOGNAME;
	else process.env.LOGNAME = originalLogname;
});

describe("createPiWelcomeHeader display name", () => {
	it("uses CLAUDE_CODE_USER when PI_DISPLAY_NAME is absent", () => {
		delete process.env.PI_DISPLAY_NAME;
		process.env.CLAUDE_CODE_USER = "claude-name";
		delete process.env.USER;
		delete process.env.LOGNAME;
		const plain = createPiWelcomeHeader(makeContext())({}, theme).render(110).join("\n");
		expect(plain).toContain("Welcome back Claude Name!");
	});

	it("uses LOGNAME when higher-priority display names are absent", () => {
		delete process.env.PI_DISPLAY_NAME;
		delete process.env.CLAUDE_CODE_USER;
		delete process.env.USER;
		process.env.LOGNAME = "log-name";
		const plain = createPiWelcomeHeader(makeContext())({}, theme).render(110).join("\n");
		expect(plain).toContain("Welcome back Log Name!");
	});

	it("falls back to 'there' when the configured display name is empty", () => {
		process.env.PI_DISPLAY_NAME = "";
		delete process.env.CLAUDE_CODE_USER;
		delete process.env.USER;
		delete process.env.LOGNAME;
		const plain = createPiWelcomeHeader(makeContext())({}, theme).render(110).join("\n");
		expect(plain).toContain("Welcome back there!");
	});

	it("renders fallback metadata when the model is missing", () => {
		delete process.env.PI_DISPLAY_NAME;
		delete process.env.CLAUDE_CODE_USER;
		process.env.USER = "fallback-user";
		delete process.env.LOGNAME;
		const plain = createPiWelcomeHeader(makeContext({ model: undefined, sessionManager: { getEntries: () => [{}] } }))({}, theme).render(110).join("\n");
		expect(plain).toContain("Welcome back Fallback User!");
		expect(plain).toContain("Model     no-model");
		expect(plain).toContain("Session   1 entry loaded in this session");
	});
});
