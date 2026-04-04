import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseInterval } from "./interval.js";
import type { UntilPreset } from "./types.js";

const PRESETS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "presets");

interface FrontmatterResult {
  meta: Record<string, string>;
  body: string;
}

function parseFrontmatter(content: string): FrontmatterResult {
  // UTF-8 BOM 제거
  const cleaned = content.replace(/^\uFEFF/, "");
  // body가 없는 frontmatter-only 파일도 정상 파싱 (닫는 --- 후 EOF 허용)
  const match = cleaned.match(/^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n([\s\S]*))?$/);
  if (!match) return { meta: {}, body: cleaned.trim() };

  const meta: Record<string, string> = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key && value) meta[key] = value;
  }
  return { meta, body: (match[2] ?? "").trim() };
}

function tryLoadPresetFromFile(filePath: string): UntilPreset | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const { meta, body } = parseFrontmatter(raw);
    if (!body) return null;

    const interval = parseInterval(meta.interval ?? "5m");
    if (!interval) return null;

    return {
      defaultInterval: { ms: interval.ms, label: interval.label },
      description: meta.description ?? "",
      prompt: body,
    };
  } catch {
    return null;
  }
}

export async function loadPresets(): Promise<Record<string, UntilPreset>> {
  const presets: Record<string, UntilPreset> = {};

  let files: string[];
  try {
    files = await readdir(PRESETS_DIR);
  } catch {
    return presets;
  }

  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const key = file.slice(0, -3).toUpperCase();

    try {
      const raw = await readFile(join(PRESETS_DIR, file), "utf-8");
      const { meta, body } = parseFrontmatter(raw);
      if (!body) continue;

      const interval = parseInterval(meta.interval ?? "5m");
      if (!interval) continue;

      presets[key] = {
        defaultInterval: { ms: interval.ms, label: interval.label },
        description: meta.description ?? key,
        prompt: body,
      };
    } catch {
      // skip unreadable files
    }
  }

  return presets;
}

export function getPresetCompletions(
  prefix: string,
): Array<{ value: string; label: string }> | null {
  let files: string[];
  try {
    files = readdirSync(PRESETS_DIR);
  } catch {
    return null;
  }

  const upper = prefix.toUpperCase();
  const items: Array<{ value: string; label: string }> = [];

  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    const key = f.slice(0, -3).toUpperCase();
    if (!key.startsWith(upper)) continue;

    const preset = tryLoadPresetFromFile(join(PRESETS_DIR, f));
    if (!preset) continue;

    const desc = preset.description || key;
    items.push({
      value: key,
      label: `${key} — ${desc} (${preset.defaultInterval.label})`,
    });
  }

  return items.length > 0 ? items : null;
}

export function presetFileExists(name: string): boolean {
  return existsSync(join(PRESETS_DIR, `${name}.md`));
}
