const DEFAULT_MAX_PAGES = 100;

export interface PaginatedResult<T> {
	items: T[];
	nextCursor?: string;
}

export type PageFetcher<T> = (cursor: string | undefined) => Promise<PaginatedResult<T>>;

export async function paginateAll<T>(
	fetcher: PageFetcher<T>,
	maxPages: number = DEFAULT_MAX_PAGES,
): Promise<T[]> {
	const all: T[] = [];
	let cursor: string | undefined;
	let pages = 0;

	do {
		const result = await fetcher(cursor);
		all.push(...result.items);
		cursor = result.nextCursor;
		pages++;
	} while (cursor && pages < maxPages);

	return all;
}
