import type { FetchFn } from "./types.js";
import { callExaMcp } from "./exa-mcp.js";

export async function codeSearch(
	query: string,
	maxTokens: number,
	fetchImpl: FetchFn = fetch,
	signal?: AbortSignal,
): Promise<string> {
	return callExaMcp("get_code_context_exa", { query, tokensNum: maxTokens }, fetchImpl, signal);
}
