import { NPX_CACHE_TTL_MS } from "./constants.js";

export interface NpxEntry {
	resolvedPath: string;
	savedAt: number;
}

export interface NpxCache {
	entries: Record<string, NpxEntry>;
}

interface NpxFsOps {
	existsSync(p: string): boolean;
	readFileSync(p: string): string;
	writeFileSync(p: string, data: string): void;
	renameSync(src: string, dest: string): void;
	getPid(): number;
}

export function loadNpxCache(path: string, fs: NpxFsOps): NpxCache {
	if (!fs.existsSync(path)) return { entries: {} };
	try {
		const raw = fs.readFileSync(path);
		const parsed: unknown = JSON.parse(raw);
		const obj = parsed as NpxCache;
		return obj.entries ? obj : { entries: {} };
	} catch {
		return { entries: {} };
	}
}

export function saveNpxCache(path: string, cache: NpxCache, fs: NpxFsOps): void {
	const tmp = `${path}.${fs.getPid()}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(cache));
	fs.renameSync(tmp, path);
}

export function getNpxEntry(cache: NpxCache, pkg: string): NpxEntry | undefined {
	return cache.entries[pkg];
}

export function setNpxEntry(cache: NpxCache, pkg: string, resolvedPath: string, now: () => number): void {
	cache.entries[pkg] = { resolvedPath, savedAt: now() };
}

export function isNpxEntryValid(entry: NpxEntry | undefined, now: () => number): boolean {
	if (!entry) return false;
	return now() - entry.savedAt < NPX_CACHE_TTL_MS;
}
