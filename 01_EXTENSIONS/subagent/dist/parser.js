export function parseLine(line) {
    if (!line.trim())
        return null;
    try {
        const evt = JSON.parse(line);
        switch (evt.type) {
            case "message_end": return parseMessageEnd(evt);
            case "tool_execution_start": return { type: "tool_start", toolName: evt.toolName };
            case "tool_execution_end": return { type: "tool_end", toolName: evt.toolName };
            case "agent_end": return { type: "agent_end" };
            default: return null;
        }
    }
    catch {
        return null;
    }
}
function parseMessageEnd(evt) {
    const msg = evt.message;
    if (!msg || msg.role !== "assistant")
        return null;
    const text = msg.content?.filter((c) => c.type === "text").map((c) => c.text).join("\n") ?? "";
    const usage = msg.usage ? { inputTokens: msg.usage.inputTokens ?? 0, outputTokens: msg.usage.outputTokens ?? 0, turns: 1 } : undefined;
    return { type: "message", text, usage };
}
