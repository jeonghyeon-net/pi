import type { FetchFn } from "./types.js";
export declare function codeSearch(query: string, maxTokens: number, fetchImpl?: FetchFn, signal?: AbortSignal): Promise<string>;
