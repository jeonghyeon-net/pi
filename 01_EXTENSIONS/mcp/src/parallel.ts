export async function parallelLimit<T, R>(
	items: T[],
	fn: (item: T) => Promise<R>,
	limit: number,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let nextIndex = 0;

	async function worker(): Promise<void> {
		while (nextIndex < items.length) {
			const i = nextIndex++;
			results[i] = await fn(items[i]);
		}
	}

	const workers: Promise<void>[] = [];
	for (let w = 0; w < Math.min(limit, items.length); w++) {
		workers.push(worker());
	}
	await Promise.all(workers);
	return results;
}
