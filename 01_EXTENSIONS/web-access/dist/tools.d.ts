import type { FetchFn } from "./types.js";
export declare function createWebSearchTool(fetchImpl?: FetchFn): {
    name: string;
    label: string;
    description: string;
    parameters: import("@sinclair/typebox").TObject<{
        query: import("@sinclair/typebox").TString;
        numResults: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
    }>;
    execute(_id: string, params: {
        query: string;
        numResults?: number;
    }, signal?: AbortSignal): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
        details: undefined;
    }>;
};
export declare function createCodeSearchTool(fetchImpl?: FetchFn): {
    name: string;
    label: string;
    description: string;
    parameters: import("@sinclair/typebox").TObject<{
        query: import("@sinclair/typebox").TString;
        maxTokens: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
    }>;
    execute(_id: string, params: {
        query: string;
        maxTokens?: number;
    }, signal?: AbortSignal): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
        details: undefined;
    }>;
};
export declare function createFetchContentTool(fetchImpl?: FetchFn): {
    name: string;
    label: string;
    description: string;
    parameters: import("@sinclair/typebox").TObject<{
        url: import("@sinclair/typebox").TString;
    }>;
    execute(_id: string, params: {
        url: string;
    }, signal?: AbortSignal): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
        details: undefined;
    }>;
};
