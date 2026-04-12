import { DEFAULT_ENABLED } from "./constants.js";

export interface SessionEntryLike {
	type?: string;
	customType?: string;
	data?: unknown;
}

let enabled = DEFAULT_ENABLED;

export function isEnabled(): boolean {
	return enabled;
}

export function setEnabled(next: boolean): boolean {
	const changed = enabled !== next;
	enabled = next;
	return changed;
}

export function resetState(): void {
	enabled = DEFAULT_ENABLED;
}
