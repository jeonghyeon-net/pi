import type { FetchFn } from "./types.js";
import { WebSearchParams, CodeSearchParams, FetchContentParams } from "./types.js";
import { webSearch } from "./search.js";
import { codeSearch } from "./code-search.js";
import { fetchContent } from "./fetch.js";

function textResult(text: string) {
	return { content: [{ type: "text" as const, text }], details: undefined };
}

function errorMsg(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

export function createWebSearchTool(fetchImpl?: FetchFn) {
	return {
		name: "web_search",
		label: "Web Search",
		description: "Search the web using Exa. Returns answer text and source URLs.",
		parameters: WebSearchParams,
		async execute(_id: string, params: { query: string; numResults?: number }, signal?: AbortSignal) {
			try {
				const { answer, results } = await webSearch(params.query, params.numResults ?? 5, fetchImpl, signal);
				const sources = results.map((r) => `- [${r.title}](${r.url})`).join("\n");
				return textResult(sources ? `${answer}\n\n## Sources\n${sources}` : answer);
			} catch (e) { return textResult(`Error: ${errorMsg(e)}`); }
		},
	};
}

export function createCodeSearchTool(fetchImpl?: FetchFn) {
	return {
		name: "code_search",
		label: "Code Search",
		description: "Search code across the web using Exa. Returns relevant code context.",
		parameters: CodeSearchParams,
		async execute(_id: string, params: { query: string; maxTokens?: number }, signal?: AbortSignal) {
			try {
				return textResult(await codeSearch(params.query, params.maxTokens ?? 5000, fetchImpl, signal));
			} catch (e) { return textResult(`Error: ${errorMsg(e)}`); }
		},
	};
}

export function createFetchContentTool(fetchImpl?: FetchFn) {
	return {
		name: "fetch_content",
		label: "Fetch Content",
		description: "Fetch a URL and extract readable content as markdown.",
		parameters: FetchContentParams,
		async execute(_id: string, params: { url: string }, signal?: AbortSignal) {
			try {
				const result = await fetchContent(params.url, fetchImpl, signal);
				if (result.error) return textResult(`Error: ${result.error}`);
				const lines = result.title ? [`# ${result.title}`, "", result.content] : [result.content];
				return textResult(lines.join("\n"));
			} catch (e) { return textResult(`Error: ${errorMsg(e)}`); }
		},
	};
}
