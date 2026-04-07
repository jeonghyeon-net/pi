import type { ConsentMode } from "./types-config.js";

export interface ConsentManager {
	needsConsent(server: string): boolean;
	recordApproval(server: string): void;
	recordDenial(server: string): void;
	isDenied(server: string): boolean;
	reset(): void;
}

export function createConsentManager(mode: ConsentMode): ConsentManager {
	const approved = new Set<string>();
	const denied = new Set<string>();

	return {
		needsConsent(server: string): boolean {
			if (mode === "never") return false;
			if (mode === "always") return true;
			return !approved.has(server) && !denied.has(server);
		},

		recordApproval(server: string): void {
			approved.add(server);
			denied.delete(server);
		},

		recordDenial(server: string): void {
			denied.add(server);
			approved.delete(server);
		},

		isDenied(server: string): boolean {
			return denied.has(server);
		},

		reset(): void {
			approved.clear();
			denied.clear();
		},
	};
}
