import { callExaMcp } from "./exa-mcp.js";
export function parseMcpResults(text) {
    return text
        .split(/(?=^Title: )/m)
        .filter((b) => b.trim().length > 0)
        .map((block) => {
        const title = block.match(/^Title: (.+)/m)?.[1]?.trim() ?? "";
        const url = block.match(/^URL: (.+)/m)?.[1]?.trim() ?? "";
        const idx = block.indexOf("\nText: ");
        const content = idx >= 0 ? block.slice(idx + 7).trim() : "";
        return { title, url, content };
    })
        .filter((r) => r.url.length > 0);
}
export function buildAnswer(results) {
    return results
        .map((r, i) => {
        const snippet = r.content.replace(/\s+/g, " ").trim().slice(0, 500);
        if (!snippet)
            return null;
        return `${snippet}\nSource: ${r.title || `Source ${i + 1}`} (${r.url})`;
    })
        .filter(Boolean)
        .join("\n\n");
}
export function mapResults(results) {
    return results.map((r, i) => ({
        title: r.title || `Source ${i + 1}`,
        url: r.url,
        snippet: r.content.replace(/\s+/g, " ").trim().slice(0, 200),
    }));
}
export async function webSearch(query, numResults, fetchImpl = fetch, signal) {
    const text = await callExaMcp("web_search_exa", { query, numResults, livecrawl: "fallback", type: "auto" }, fetchImpl, signal);
    const parsed = parseMcpResults(text);
    return { answer: buildAnswer(parsed), results: mapResults(parsed) };
}
