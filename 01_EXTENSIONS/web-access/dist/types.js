import { Type } from "@sinclair/typebox";
export const WebSearchParams = Type.Object({
    query: Type.String({ description: "Search query" }),
    numResults: Type.Optional(Type.Number({ description: "Number of results (default 5)" })),
});
export const CodeSearchParams = Type.Object({
    query: Type.String({ description: "Code search query" }),
    maxTokens: Type.Optional(Type.Number({ description: "Max tokens (default 5000)" })),
});
export const FetchContentParams = Type.Object({
    url: Type.String({ description: "URL to fetch and extract content from" }),
});
