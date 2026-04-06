import type { SearchResult, FetchFn } from "./types.js";
interface McpParsedResult {
    title: string;
    url: string;
    content: string;
}
export declare function parseMcpResults(text: string): McpParsedResult[];
export declare function buildAnswer(results: McpParsedResult[]): string;
export declare function mapResults(results: McpParsedResult[]): SearchResult[];
export declare function webSearch(query: string, numResults: number, fetchImpl?: FetchFn, signal?: AbortSignal): Promise<{
    answer: string;
    results: SearchResult[];
}>;
export {};
