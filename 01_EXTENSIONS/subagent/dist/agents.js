export function parseFrontmatter(raw) {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match)
        return { data: {}, content: raw };
    const data = {};
    for (const line of match[1].split("\n")) {
        const idx = line.indexOf(":");
        if (idx > 0)
            data[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    return { data, content: match[2].trim() };
}
export function loadAgentFromString(raw, filePath) {
    const { data, content } = parseFrontmatter(raw);
    return {
        name: data.name ?? "",
        description: data.description ?? "",
        model: data.model || undefined,
        thinking: data.thinking || undefined,
        tools: data.tools ? data.tools.split(/,\s*/) : undefined,
        systemPrompt: content,
        filePath,
    };
}
export function loadAgentsFromDir(dir, readDir, readFile) {
    return readDir(dir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => loadAgentFromString(readFile(`${dir}/${f}`, "utf-8"), `${dir}/${f}`));
}
export function getAgent(name, agents) {
    return agents.find((a) => a.name === name);
}
