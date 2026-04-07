export interface CacheServerData {
	tools: unknown[];
	savedAt: number;
	configHash?: string;
}

export interface CacheData {
	hash: string;
	servers: Record<string, CacheServerData>;
}
