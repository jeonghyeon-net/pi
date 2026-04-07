export interface FailureRecord {
	at: number;
	count: number;
}

const failures = new Map<string, FailureRecord>();

export function recordFailure(server: string): void {
	const existing = failures.get(server);
	if (existing) {
		existing.at = Date.now();
		existing.count++;
	} else {
		failures.set(server, { at: Date.now(), count: 1 });
	}
}

export function getFailure(server: string): FailureRecord | undefined {
	return failures.get(server);
}

export function clearFailure(server: string): void {
	failures.delete(server);
}

export function clearAllFailures(): void {
	failures.clear();
}

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

export function getBackoffMs(server: string): number {
	const record = failures.get(server);
	if (!record) return 0;
	return Math.min(BASE_BACKOFF_MS * Math.pow(2, record.count), MAX_BACKOFF_MS);
}
