export declare const WebSearchParams: import("@sinclair/typebox").TObject<{
    query: import("@sinclair/typebox").TString;
    numResults: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
}>;
export declare const CodeSearchParams: import("@sinclair/typebox").TObject<{
    query: import("@sinclair/typebox").TString;
    maxTokens: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
}>;
export declare const FetchContentParams: import("@sinclair/typebox").TObject<{
    url: import("@sinclair/typebox").TString;
}>;
export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}
export interface ExtractedContent {
    url: string;
    title: string;
    content: string;
    error: string | null;
}
export interface McpRpcResponse {
    result?: {
        content?: Array<{
            type?: string;
            text?: string;
        }>;
        isError?: boolean;
    };
    error?: {
        code?: number;
        message?: string;
    };
}
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
