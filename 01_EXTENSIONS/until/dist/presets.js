import { readdir } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseInterval } from "./interval.js";
import { parseFrontmatter } from "./frontmatter.js";
function tryLoadPreset(dir, file) {
    let raw;
    try {
        raw = readFileSync(join(dir, file), "utf-8");
    }
    catch {
        raw = null;
    }
    if (!raw)
        return null;
    const { meta, body } = parseFrontmatter(raw);
    if (!body)
        return null;
    const interval = parseInterval(meta.interval ?? "5m");
    if (!interval)
        return null;
    const key = file.slice(0, -3).toUpperCase();
    return [
        key,
        {
            defaultInterval: interval,
            description: meta.description ?? key,
            prompt: body,
        },
    ];
}
export async function loadPresets(dir) {
    const presets = {};
    let files;
    try {
        files = await readdir(dir);
    }
    catch {
        return presets;
    }
    for (const file of files) {
        if (!file.endsWith(".md"))
            continue;
        const result = tryLoadPreset(dir, file);
        if (result)
            presets[result[0]] = result[1];
    }
    return presets;
}
export function getPresetCompletions(dir, prefix) {
    let files;
    try {
        files = readdirSync(dir);
    }
    catch {
        return null;
    }
    const upper = prefix.toUpperCase();
    const items = [];
    for (const f of files) {
        if (!f.endsWith(".md"))
            continue;
        const result = tryLoadPreset(dir, f);
        if (!result)
            continue;
        const [key, preset] = result;
        if (!key.startsWith(upper))
            continue;
        items.push({
            value: key,
            label: `${key} — ${preset.description} (${preset.defaultInterval.label})`,
        });
    }
    return items.length > 0 ? items : null;
}
