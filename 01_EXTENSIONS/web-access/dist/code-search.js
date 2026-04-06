import { callExaMcp } from "./exa-mcp.js";
export async function codeSearch(query, maxTokens, fetchImpl = fetch, signal) {
    return callExaMcp("get_code_context_exa", { query, tokensNum: maxTokens }, fetchImpl, signal);
}
