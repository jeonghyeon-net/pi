import { describe, expect, it, beforeEach } from "vitest";
import { createConsentManager } from "../src/consent.js";
import { McpError } from "../src/errors.js";

describe("consent - never mode", () => {
	it("always returns approved without prompting", () => {
		const mgr = createConsentManager("never");
		expect(mgr.needsConsent("server1")).toBe(false);
		expect(() => mgr.ensureApproved("server1")).not.toThrow();
	});
});

describe("consent - once-per-server mode", () => {
	let mgr: ReturnType<typeof createConsentManager>;
	beforeEach(() => { mgr = createConsentManager("once-per-server"); });

	it("needs consent on first call for a server", () => {
		expect(mgr.needsConsent("s1")).toBe(true);
	});

	it("does not need consent after approval", () => {
		mgr.recordApproval("s1");
		expect(mgr.needsConsent("s1")).toBe(false);
	});

	it("does not need consent after denial", () => {
		mgr.recordDenial("s1");
		expect(mgr.needsConsent("s1")).toBe(false);
	});

	it("tracks servers independently", () => {
		mgr.recordApproval("s1");
		expect(mgr.needsConsent("s2")).toBe(true);
	});

	it("isDenied returns true after denial", () => {
		mgr.recordDenial("s1");
		expect(mgr.isDenied("s1")).toBe(true);
	});

	it("isDenied returns false after approval", () => {
		mgr.recordApproval("s1");
		expect(mgr.isDenied("s1")).toBe(false);
	});

	it("isDenied returns false for unknown server", () => {
		expect(mgr.isDenied("s1")).toBe(false);
	});

	it("ensureApproved throws CONSENT_PENDING for unapproved", () => {
		expect(() => mgr.ensureApproved("s1")).toThrow(McpError);
		try { mgr.ensureApproved("s1"); } catch (e) {
			expect(e).toBeInstanceOf(McpError);
			expect((e as McpError).code).toBe("CONSENT_PENDING");
		}
	});

	it("ensureApproved throws CONSENT_DENIED for denied", () => {
		mgr.recordDenial("s1");
		try { mgr.ensureApproved("s1"); } catch (e) {
			expect(e).toBeInstanceOf(McpError);
			expect((e as McpError).code).toBe("CONSENT_DENIED");
		}
	});

	it("ensureApproved succeeds after approval", () => {
		mgr.recordApproval("s1");
		expect(() => mgr.ensureApproved("s1")).not.toThrow();
	});
});

describe("consent - always mode", () => {
	it("always needs consent even after approval", () => {
		const mgr = createConsentManager("always");
		mgr.recordApproval("s1");
		expect(mgr.needsConsent("s1")).toBe(true);
	});

	it("isDenied tracks denial even in always mode", () => {
		const mgr = createConsentManager("always");
		mgr.recordDenial("s1");
		expect(mgr.isDenied("s1")).toBe(true);
	});

	it("ensureApproved throws CONSENT_PENDING for unapproved in always mode", () => {
		const mgr = createConsentManager("always");
		expect(() => mgr.ensureApproved("s1")).toThrow(McpError);
	});
});

describe("consent - reset", () => {
	it("clears all consent state", () => {
		const mgr = createConsentManager("once-per-server");
		mgr.recordApproval("s1");
		mgr.reset();
		expect(mgr.needsConsent("s1")).toBe(true);
	});
});
