import { htmlToMarkdown } from "./readability.js";
const TIMEOUT_MS = 30000;
const MAX_SIZE = 5 * 1024 * 1024;
const BINARY_PREFIXES = ["image/", "audio/", "video/", "application/zip", "application/octet-stream"];
function isBinary(ct) {
    return BINARY_PREFIXES.some((p) => ct.includes(p));
}
function isHtml(ct) {
    return ct.includes("text/html") || ct.includes("application/xhtml+xml");
}
export async function fetchContent(url, fetchImpl = fetch, signal) {
    const res = await fetchImpl(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (compatible; pi-web-access/1.0)",
            Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        },
        signal: signal ?? AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok)
        return { url, title: "", content: "", error: `HTTP ${res.status}: ${res.statusText}` };
    const ct = res.headers.get("content-type") || "";
    if (isBinary(ct))
        return { url, title: "", content: "", error: `Unsupported: ${ct.split(";")[0]}` };
    const cl = res.headers.get("content-length");
    if (cl && Number.parseInt(cl, 10) > MAX_SIZE) {
        return { url, title: "", content: "", error: `Response too large (${Math.round(Number.parseInt(cl, 10) / 1024 / 1024)}MB)` };
    }
    const text = await res.text();
    if (!isHtml(ct))
        return { url, title: url, content: text, error: null };
    const result = htmlToMarkdown(text);
    if (!result)
        return { url, title: "", content: "", error: "Could not extract readable content" };
    return { url, title: result.title, content: result.content, error: null };
}
