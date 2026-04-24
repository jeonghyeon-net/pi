import { afterEach, describe, expect, it } from "vitest";
import { getProjectName, shortenMiddle } from "../src/header-utils.ts";
import { makeContext } from "./header-test-helpers.ts";

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

describe("header utils", () => {
	it("extracts the project name from cwd", () => {
		expect(getProjectName(makeContext({ cwd: "/tmp/demo-project" }))).toBe("demo-project");
	});

	it("shortens long text safely for tiny widths", () => {
		expect(shortenMiddle("abcdefghij", 1)).toBe("…");
		expect(shortenMiddle("abcdefghij", 2)).toBe("a…");
		expect(shortenMiddle("abcdefghij", 6)).toBe("abc…ij");
	});
});
