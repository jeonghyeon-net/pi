/**
 * Agent discovery, matching, and configuration.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseFrontmatter } from "@mariozechner/pi-coding-agent";
import type {
  AgentAliasMatch,
  AgentConfig,
  AgentDiscoveryResult,
  AgentThinkingLevel,
} from "../core/types.js";
import { AGENT_THINKING_LEVELS } from "../core/types.js";

// ━━━ Normalization ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function normalizeTools(rawTools: string | undefined): string[] | undefined {
  if (!rawTools) return undefined;
  const parsed = rawTools
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return parsed.length === 0 ? undefined : parsed;
}

export function normalizeModel(rawModel: string | undefined): string | undefined {
  if (!rawModel) return undefined;
  const model = rawModel.trim();
  return model || undefined;
}

export function normalizeThinkingLevel(
  rawThinking: string | undefined,
): AgentThinkingLevel | undefined {
  if (!rawThinking) return undefined;
  const thinking = rawThinking.trim().toLowerCase();
  if ((AGENT_THINKING_LEVELS as readonly string[]).includes(thinking))
    return thinking as AgentThinkingLevel;
  return undefined;
}

// ━━━ System Prompt Rules ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const COMMON_SUBAGENT_NO_RECURSION_RULE = [
  "Global Runtime Rule (subagent):",
  "- Never invoke the `subagent` tool.",
  "- Never trigger subagent commands/shorthands such as `/sub:*` or `>>` or `>>>`.",
  "- If delegation is requested, explain that recursive subagent invocation is disabled and continue with available tools.",
].join("\n");

const COMMON_SUBAGENT_ESCALATION_GUIDELINE = [
  "ask_master Guideline:",
  "- The `ask_master` tool asks the master for a decision. WARNING: calling it terminates your session immediately.",
  "- Use `ask_master` when:",
  "  - You encounter ambiguity that cannot be resolved from the task context or codebase",
  "  - A decision has significant impact (deletion, architecture change, deployment) and you are unsure of the correct choice",
  "  - You discover unexpected issues that fundamentally change the scope of the task",
  "  - Task instructions conflict with each other and you need clarification",
  "- DO NOT use `ask_master` for:",
  "  - Routine decisions within your domain expertise",
  "  - Issues you can resolve with available tools and context",
  "  - Minor style, formatting, or naming choices",
  "  - Pre-existing problems unrelated to the current task",
  "- When calling, always include:",
  "  - Clear description of the blocker or decision needed",
  "  - Options you have considered with pros/cons",
  "  - Your recommendation, if you have one",
].join("\n");

function attachCommonSubagentRule(systemPrompt: string): string {
  const parts: string[] = [];
  const trimmed = systemPrompt.trimEnd();
  if (trimmed) parts.push(trimmed);
  if (!trimmed.includes("Global Runtime Rule (subagent):"))
    parts.push(COMMON_SUBAGENT_NO_RECURSION_RULE);
  const joined = parts.join("\n\n");
  if (!joined.includes("ask_master Guideline:")) parts.push(COMMON_SUBAGENT_ESCALATION_GUIDELINE);
  return parts.join("\n\n");
}

// ━━━ Discovery ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function listMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    if (!entry.name.endsWith(".md")) continue;
    files.push(path.join(dir, entry.name));
  }
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function loadAgentsFromDir(dir: string, source: "user" | "project"): AgentConfig[] {
  const agents: AgentConfig[] = [];
  if (!fs.existsSync(dir)) return agents;
  const files = listMarkdownFiles(dir);
  for (const filePath of files) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }
    const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);
    if (!frontmatter.name || !frontmatter.description) continue;
    const tools = normalizeTools(frontmatter.tools);
    const model = normalizeModel(frontmatter.model);
    const thinking = normalizeThinkingLevel(frontmatter.thinking);
    const character = frontmatter.character || undefined;
    const config: AgentConfig = {
      name: frontmatter.name,
      description: frontmatter.description,
      systemPrompt: attachCommonSubagentRule(body),
      source,
      filePath,
    };
    if (tools !== undefined) config.tools = tools;
    if (model !== undefined) config.model = model;
    if (thinking !== undefined) config.thinking = thinking;
    if (character !== undefined) config.character = character;
    agents.push(config);
  }
  return agents;
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function findNearestDir(cwd: string, ...segments: string[]): string | null {
  let currentDir = cwd;
  while (true) {
    const candidate = path.join(currentDir, ...segments);
    if (isDirectory(candidate)) return candidate;
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) return null;
    currentDir = parentDir;
  }
}

export function discoverAgents(cwd: string): AgentDiscoveryResult {
  const userDir = path.join(os.homedir(), ".pi", "agent", "agents");
  const projectPiDir = findNearestDir(cwd, ".pi", "agents");
  const projectAgentsDir = findNearestDir(cwd, "agents");
  const userAgents = loadAgentsFromDir(userDir, "user");
  const projectAgents = projectAgentsDir ? loadAgentsFromDir(projectAgentsDir, "project") : [];
  const projectPiAgents = projectPiDir ? loadAgentsFromDir(projectPiDir, "project") : [];
  const agentMap = new Map<string, AgentConfig>();
  for (const agent of [...userAgents, ...projectAgents, ...projectPiAgents])
    agentMap.set(agent.name, agent);
  const projectSources = [projectAgentsDir, projectPiDir].filter((d): d is string => Boolean(d));
  return {
    agents: Array.from(agentMap.values()),
    projectAgentsDir: projectSources.length > 0 ? projectSources.join(", ") : null,
  };
}

// ━━━ Matching ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function normalizeAlias(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function getInitials(name: string): string {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("");
}
function uniqueByName<T extends { name: string }>(arr: T[]): T[] {
  const m = new Map<string, T>();
  for (const a of arr) if (!m.has(a.name)) m.set(a.name, a);
  return Array.from(m.values());
}

export function matchSubCommandAgent(agents: AgentConfig[], token: string): AgentAliasMatch {
  const raw = token.trim().toLowerCase();
  if (!raw) return { ambiguousAgents: [] };
  const normalized = normalizeAlias(raw);
  const exact = uniqueByName(
    agents.filter((a) => {
      const n = a.name.toLowerCase();
      return n === raw || normalizeAlias(n) === normalized;
    }),
  );
  if (exact.length === 1) return { matchedAgent: exact[0], ambiguousAgents: [] };
  if (exact.length > 1) return { ambiguousAgents: exact };
  const prefix = uniqueByName(
    agents.filter((a) => {
      const n = a.name.toLowerCase();
      const nn = normalizeAlias(n);
      const parts = n.split(/[^a-z0-9]+/).filter(Boolean);
      return (
        n.startsWith(raw) ||
        nn.startsWith(normalized) ||
        parts.some((p) => p.startsWith(raw) || normalizeAlias(p).startsWith(normalized))
      );
    }),
  );
  if (prefix.length === 1) return { matchedAgent: prefix[0], ambiguousAgents: [] };
  if (prefix.length > 1) return { ambiguousAgents: prefix };
  const initials = uniqueByName(agents.filter((a) => normalized === getInitials(a.name)));
  if (initials.length === 1) return { matchedAgent: initials[0], ambiguousAgents: [] };
  if (initials.length > 1) return { ambiguousAgents: initials };
  const contains = uniqueByName(
    agents.filter((a) => {
      const n = a.name.toLowerCase();
      return n.includes(raw) || normalizeAlias(n).includes(normalized);
    }),
  );
  if (contains.length === 1) return { matchedAgent: contains[0], ambiguousAgents: [] };
  if (contains.length > 1) return { ambiguousAgents: contains };
  return { ambiguousAgents: [] };
}

export function getSubCommandAgentCompletions(
  agents: AgentConfig[],
  argumentPrefix: string,
): { value: string; label: string; description?: string }[] | null {
  const trimmedStart = argumentPrefix.trimStart();
  if (trimmedStart.includes(" ")) return null;
  const raw = trimmedStart.toLowerCase();
  const normalized = normalizeAlias(raw);
  const scored = agents
    .map((agent) => {
      const name = agent.name.toLowerCase();
      const nn = normalizeAlias(name);
      const parts = name.split(/[^a-z0-9]+/).filter(Boolean);
      const ai = getInitials(name);
      let score = Number.POSITIVE_INFINITY;
      if (!raw) score = 100;
      else if (name === raw || nn === normalized) score = 0;
      else if (name.startsWith(raw) || nn.startsWith(normalized)) score = 1;
      else if (parts.some((p) => p.startsWith(raw) || normalizeAlias(p).startsWith(normalized)))
        score = 2;
      else if (normalized && ai === normalized) score = 3;
      else if (name.includes(raw) || nn.includes(normalized)) score = 4;
      return { agent, score };
    })
    .filter((r) => Number.isFinite(r.score))
    .sort((a, b) => a.score - b.score || a.agent.name.localeCompare(b.agent.name))
    .slice(0, 20)
    .map(({ agent }) => ({
      value: `${agent.name} `,
      label: agent.name,
      description: agent.description || `[${agent.source}]`,
    }));
  return scored.length > 0 ? scored : null;
}

export function computeAgentAliasHints(agents: AgentConfig[]): string {
  const hints: string[] = [];
  for (const agent of agents) {
    const name = agent.name.toLowerCase();
    let shortestAlias = name;
    for (let i = 1; i <= name.length; i++) {
      const c = name.slice(0, i);
      const r = matchSubCommandAgent(agents, c);
      if (r.matchedAgent?.name === agent.name) {
        shortestAlias = c;
        break;
      }
    }
    const initials = getInitials(name);
    if (initials.length >= 2 && initials.length <= shortestAlias.length) {
      const r = matchSubCommandAgent(agents, initials);
      if (r.matchedAgent?.name === agent.name) shortestAlias = initials;
    }
    hints.push(shortestAlias === name ? name : `${shortestAlias}→${name}`);
  }
  return hints.join("  ");
}
