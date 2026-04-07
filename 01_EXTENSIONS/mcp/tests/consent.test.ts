import { describe, expect, it, beforeEach } from "vitest";
import { createConsentManager } from "../src/consent.js";

describe("consent - never mode", () => {
	it("always returns approved without prompting", () => {
		const mgr = createConsentManager("never");
		expect(mgr.needsConsent("server1")).toBe(false);
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
});

describe("consent - reset", () => {
	it("clears all consent state", () => {
		const mgr = createConsentManager("once-per-server");
		mgr.recordApproval("s1");
		mgr.reset();
		expect(mgr.needsConsent("s1")).toBe(true);
	});
});
