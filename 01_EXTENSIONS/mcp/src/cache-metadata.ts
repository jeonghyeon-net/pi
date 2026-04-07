import { METADATA_CACHE_TTL_MS } from "./constants.js";

export interface MetadataCache {
	version: number;
	servers: Record<string, unknown>;
	savedAt: number;
	configHash: string;
}

interface CacheFsOps {
	existsSync(p: string): boolean;
	readFileSync(p: string): string;
	writeFileSync(p: string, data: string): void;
	renameSync(src: string, dest: string): void;
	getPid(): number;
}

export function loadMetadataCache(path: string, fs: CacheFsOps): MetadataCache | null {
	if (!fs.existsSync(path)) return null;
	try {
		const raw = fs.readFileSync(path);
		const parsed: unknown = JSON.parse(raw);
		return parsed as MetadataCache;
	} catch {
		return null;
	}
}

export function saveMetadataCache(path: string, cache: MetadataCache, fs: CacheFsOps): void {
	const tmp = `${path}.${fs.getPid()}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(cache));
	fs.renameSync(tmp, path);
}

export function isMetadataCacheValid(
	cache: MetadataCache | null,
	configHash: string,
	now: () => number,
): boolean {
	if (!cache) return false;
	if (cache.configHash !== configHash) return false;
	return now() - cache.savedAt < METADATA_CACHE_TTL_MS;
}
