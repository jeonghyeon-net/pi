import { METADATA_CACHE_TTL_MS } from "./constants.js";

export interface ServerCacheEntry {
	tools: unknown;
	savedAt: number;
	configHash?: string;
}

export interface MetadataCache {
	version: number;
	servers: Record<string, ServerCacheEntry>;
	configHash: string;
}

interface CacheFsOps {
	existsSync(p: string): boolean; readFileSync(p: string): string; writeFileSync(p: string, data: string): void;
	renameSync(src: string, dest: string): void; mkdirSync(p: string): void; getPid(): number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function validateCache(parsed: unknown): MetadataCache | null {
	if (!isRecord(parsed)) return null;
	if (typeof parsed.version !== "number") return null;
	if (typeof parsed.configHash !== "string") return null;
	if (!isRecord(parsed.servers)) return null;
	return {
		version: parsed.version,
		servers: parsed.servers as Record<string, ServerCacheEntry>,
		configHash: parsed.configHash,
	};
}

export function loadMetadataCache(path: string, fs: CacheFsOps): MetadataCache | null {
	if (!fs.existsSync(path)) return null;
	try { return validateCache(JSON.parse(fs.readFileSync(path))); } catch { return null; }
}

function dirname(path: string): string {
	const normalized = path.replace(/\\/g, "/");
	const idx = normalized.lastIndexOf("/");
	return idx === 0 ? "/" : idx < 0 ? "." : normalized.slice(0, idx);
}

export function saveMetadataCache(path: string, cache: MetadataCache, fs: CacheFsOps): void {
	const tmp = `${path}.${fs.getPid()}.tmp`;
	fs.mkdirSync(dirname(path)); fs.writeFileSync(tmp, JSON.stringify(cache)); fs.renameSync(tmp, path);
}

export function isMetadataCacheValid(
	cache: MetadataCache | null,
	configHash: string,
	serverHashes: Record<string, string>,
	now: () => number,
): boolean {
	if (!cache) return false;
	const currentTime = now();
	const names = Object.keys(serverHashes);
	if (names.length === 0) {
		return cache.configHash === configHash && Object.keys(cache.servers).length === 0;
	}
	for (const name of names) {
		if (isServerCacheValid(cache.servers[name], serverHashes[name], cache.configHash, configHash, currentTime)) {
			return true;
		}
	}
	return false;
}

export function isServerCacheFresh(entry: ServerCacheEntry | undefined, now: number): boolean {
	return !!entry && now - entry.savedAt < METADATA_CACHE_TTL_MS;
}

export function isServerCacheValid(
	entry: ServerCacheEntry | undefined,
	serverHash: string,
	cacheConfigHash: string,
	expectedConfigHash: string,
	now: number,
): boolean {
	if (!isServerCacheFresh(entry, now)) return false;
	if (typeof entry?.configHash === "string") return entry.configHash === serverHash;
	return cacheConfigHash === expectedConfigHash;
}

export function invalidateServer(cache: MetadataCache, server: string): MetadataCache {
	const { [server]: _, ...rest } = cache.servers;
	return { ...cache, servers: rest };
}

