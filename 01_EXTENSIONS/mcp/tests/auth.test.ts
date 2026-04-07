import { describe, expect, it } from "vitest";
import { resolveBearer, buildAuthHeader } from "../src/auth.js";

describe("resolveBearer", () => {
	it("returns direct token when bearerToken is set", () => {
		const result = resolveBearer({ bearerToken: "tok123" }, {});
		expect(result).toBe("tok123");
	});

	it("resolves token from env var", () => {
		const result = resolveBearer({ bearerTokenEnv: "MY_TOKEN" }, { MY_TOKEN: "envtok" });
		expect(result).toBe("envtok");
	});

	it("returns undefined when env var is missing", () => {
		const result = resolveBearer({ bearerTokenEnv: "MISSING" }, {});
		expect(result).toBeUndefined();
	});

	it("prefers bearerToken over bearerTokenEnv", () => {
		const result = resolveBearer(
			{ bearerToken: "direct", bearerTokenEnv: "MY_TOKEN" },
			{ MY_TOKEN: "envtok" },
		);
		expect(result).toBe("direct");
	});

	it("returns undefined when neither is set", () => {
		const result = resolveBearer({}, {});
		expect(result).toBeUndefined();
	});
});

describe("buildAuthHeader", () => {
	it("returns Bearer header for token", () => {
		expect(buildAuthHeader("tok")).toEqual({ Authorization: "Bearer tok" });
	});

	it("returns empty object for undefined token", () => {
		expect(buildAuthHeader(undefined)).toEqual({});
	});
});
