import { describe, expect, it } from "vitest";
import { buildTerminalTitle } from "../src/handlers.js";

describe("buildTerminalTitle", () => {
	it("keeps only the app prefix and session name", () => {
		expect(buildTerminalTitle("/Users/me/Desktop/pi", "Fix footer")).toBe("π - Fix footer");
		expect(buildTerminalTitle("/", "Root session")).toBe("π - Root session");
	});
});
