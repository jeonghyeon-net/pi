const EXA_MCP_URL = "https://mcp.exa.ai/mcp";
export function buildRpcBody(toolName, args) {
    return JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: toolName, arguments: args },
    });
}
export function parseSseResponse(body) {
    for (const line of body.split("\n")) {
        if (!line.startsWith("data:"))
            continue;
        const payload = line.slice(5).trim();
        if (!payload)
            continue;
        try {
            const c = JSON.parse(payload);
            if (c?.result || c?.error)
                return c;
        }
        catch { }
    }
    try {
        const c = JSON.parse(body);
        if (c?.result || c?.error)
            return c;
    }
    catch { }
    return null;
}
export function extractText(parsed) {
    if (parsed.error) {
        const code = typeof parsed.error.code === "number" ? ` ${parsed.error.code}` : "";
        throw new Error(`Exa MCP error${code}: ${parsed.error.message || "Unknown"}`);
    }
    if (parsed.result?.isError) {
        const msg = parsed.result.content?.find((c) => c.type === "text")?.text?.trim();
        throw new Error(msg || "Exa MCP returned an error");
    }
    const text = parsed.result?.content?.find((c) => c.type === "text" && typeof c.text === "string" && c.text.trim().length > 0)?.text;
    if (!text)
        throw new Error("Exa MCP returned empty content");
    return text;
}
export async function callExaMcp(toolName, args, fetchImpl = fetch, signal) {
    const res = await fetchImpl(EXA_MCP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: buildRpcBody(toolName, args),
        signal,
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Exa MCP HTTP ${res.status}: ${errText.slice(0, 300)}`);
    }
    const body = await res.text();
    const parsed = parseSseResponse(body);
    if (!parsed)
        throw new Error("Exa MCP returned an empty response");
    return extractText(parsed);
}
