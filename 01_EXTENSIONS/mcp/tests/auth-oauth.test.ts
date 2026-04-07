import { describe, expect, it, vi } from "vitest";
import { loadOAuthTokens, isOAuthTokenValid, oauthTokenPath } from "../src/auth.js";

describe("loadOAuthTokens", () => {
	it("returns null when file does not exist", () => {
		const fs = { existsSync: () => false, readFileSync: vi.fn() };
		expect(loadOAuthTokens("/oauth/s1/tokens.json", fs)).toBeNull();
	});

	it("returns parsed tokens when file exists", () => {
		const tokens = { access_token: "abc", token_type: "bearer", expiresAt: Date.now() + 60000 };
		const fs = { existsSync: () => true, readFileSync: () => JSON.stringify(tokens) };
		const result = loadOAuthTokens("/oauth/s1/tokens.json", fs);
		expect(result?.access_token).toBe("abc");
	});

	it("returns null on invalid JSON", () => {
		const fs = { existsSync: () => true, readFileSync: () => "bad" };
		expect(loadOAuthTokens("/oauth/s1/tokens.json", fs)).toBeNull();
	});

	it("returns null when access_token is not a string", () => {
		const tokens = { access_token: 123 };
		const fs = { existsSync: () => true, readFileSync: () => JSON.stringify(tokens) };
		expect(loadOAuthTokens("/oauth/s1/tokens.json", fs)).toBeNull();
	});

	it("returns null for arrays and null JSON", () => {
		const fs1 = { existsSync: () => true, readFileSync: () => JSON.stringify([1, 2]) };
		expect(loadOAuthTokens("/path", fs1)).toBeNull();
		const fs2 = { existsSync: () => true, readFileSync: () => "null" };
		expect(loadOAuthTokens("/path", fs2)).toBeNull();
	});
	it("parses refresh_token when present", () => {
		const t = { access_token: "abc", token_type: "bearer", refresh_token: "rt123" };
		const fs = { existsSync: () => true, readFileSync: () => JSON.stringify(t) };
		expect(loadOAuthTokens("/path", fs)?.refresh_token).toBe("rt123");
	});
	it("refresh_token is undefined when not a string", () => {
		const t = { access_token: "abc", refresh_token: 42 };
		const fs = { existsSync: () => true, readFileSync: () => JSON.stringify(t) };
		expect(loadOAuthTokens("/path", fs)?.refresh_token).toBeUndefined();
	});

	it("computes expiresAt from savedAt + expires_in", () => {
		const t = { access_token: "abc", savedAt: 1000, expires_in: 3600 };
		const fs = { existsSync: () => true, readFileSync: () => JSON.stringify(t) };
		expect(loadOAuthTokens("/path", fs)?.expiresAt).toBe(1000 + 3600 * 1000);
	});
	it("prefers expiresAt over expires_in", () => {
		const t = { access_token: "abc", expiresAt: 9999, savedAt: 1000, expires_in: 3600 };
		const fs = { existsSync: () => true, readFileSync: () => JSON.stringify(t) };
		expect(loadOAuthTokens("/path", fs)?.expiresAt).toBe(9999);
	});
	it("ignores expires_in without savedAt", () => {
		const t = { access_token: "abc", expires_in: 3600 };
		const fs = { existsSync: () => true, readFileSync: () => JSON.stringify(t) };
		expect(loadOAuthTokens("/path", fs)?.expiresAt).toBeUndefined();
	});
});

describe("isOAuthTokenValid", () => {
	it("returns false for null tokens", () => {
		expect(isOAuthTokenValid(null, Date.now)).toBe(false);
	});

	it("returns false when expired", () => {
		const tokens = { access_token: "a", token_type: "bearer", expiresAt: Date.now() - 1000 };
		expect(isOAuthTokenValid(tokens, Date.now)).toBe(false);
	});

	it("returns true when not expired", () => {
		const tokens = { access_token: "a", token_type: "bearer", expiresAt: Date.now() + 60000 };
		expect(isOAuthTokenValid(tokens, Date.now)).toBe(true);
	});

	it("returns true when no expiresAt (never expires)", () => {
		const tokens = { access_token: "a", token_type: "bearer" };
		expect(isOAuthTokenValid(tokens, Date.now)).toBe(true);
	});

	it("defaults token_type to bearer", () => {
		const tokens = { access_token: "a" };
		const fs = { existsSync: () => true, readFileSync: () => JSON.stringify(tokens) };
		const result = loadOAuthTokens("/path", fs);
		expect(result?.token_type).toBe("bearer");
	});
});

describe("oauthTokenPath", () => {
	it("builds path from server name", () => {
		expect(oauthTokenPath("my-server")).toBe("~/.pi/agent/mcp-oauth/my-server/tokens.json");
	});

	it("sanitizes dangerous characters", () => {
		expect(oauthTokenPath("bad/server\\name")).toBe("~/.pi/agent/mcp-oauth/badservername/tokens.json");
	});
});
