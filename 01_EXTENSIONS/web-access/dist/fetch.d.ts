import type { ExtractedContent, FetchFn } from "./types.js";
export declare function fetchContent(url: string, fetchImpl?: FetchFn, signal?: AbortSignal): Promise<ExtractedContent>;
