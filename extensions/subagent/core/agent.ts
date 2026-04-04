// @ts-nocheck — forked from Jonghakseo/my-pi
/**
 * Agent discovery, matching, and configuration.
 * Merges: agents.ts + agent-utils.ts
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
} from "./types.js";
import { AGENT_THINKING_LEVELS, CLAUDE_MODEL_ALIAS_MAP, CLAUDE_TOOL_MAP } from "./types.js";

// ━━━ Normalization ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function normalizeTools(
  rawTools: string | undefined,
  format: "pi" | "claude",
): string[] | undefined {
  if (!rawTools) return undefined;
  const parsed = rawTools
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (parsed.length === 0) return undefined;
  if (format === "pi") return parsed;
  const mapped = parsed
    .map((tool) => CLAUDE_TOOL_MAP[tool.toLowerCase()] ?? undefined)
    .filter((t): t is string => Boolean(t));
  return mapped.length === 0 ? undefined : Array.from(new Set(mapped));
}

export function normalizeModel(
  rawModel: string | undefined,
  format: "pi" | "claude",
): string | undefined {
  if (!rawModel) return undefined;
  const model = rawModel.trim();
  if (!model) return undefined;
  if (format === "claude") {
    if (model.includes("/")) return model;
    return CLAUDE_MODEL_ALIAS_MAP[model.toLowerCase()] ?? model;
  }
  return model;
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
  let prompt = systemPrompt.trimEnd();
  if (!prompt.includes("Global Runtime Rule (subagent):"))
    prompt = prompt
      ? `${prompt}\n\n${COMMON_SUBAGENT_NO_RECURSION_RULE}`
      : COMMON_SUBAGENT_NO_RECURSION_RULE;
  if (!prompt.includes("ask_master Guideline:"))
    prompt = prompt
      ? `${prompt}\n\n${COMMON_SUBAGENT_ESCALATION_GUIDELINE}`
      : COMMON_SUBAGENT_ESCALATION_GUIDELINE;
  return prompt;
}

// ━━━ Discovery ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function listMarkdownFiles(dir: string, recursive: boolean): string[] {
  const files: string[] = [];
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const currentDir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (recursive) stack.push(fullPath);
        continue;
      }
      if (!entry.name.endsWith(".md")) continue;
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;
      files.push(fullPath);
    }
  }
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function loadAgentsFromDir(
  dir: string,
  source: "user" | "project",
  options: { recursive?: boolean; format?: "pi" | "claude" } = {},
): AgentConfig[] {
  const agents: AgentConfig[] = [];
  if (!fs.existsSync(dir)) return agents;
  const files = listMarkdownFiles(dir, options.recursive ?? false);
  for (const filePath of files) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }
    const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);
    if (!frontmatter.name || !frontmatter.description) continue;
    agents.push({
      name: frontmatter.name,
      description: frontmatter.description,
      tools: normalizeTools(frontmatter.tools, options.format ?? "pi"),
      model: normalizeModel(frontmatter.model, options.format ?? "pi"),
      thinking: normalizeThinkingLevel(frontmatter.thinking),
      systemPrompt: attachCommonSubagentRule(body),
      source,
      filePath,
      character: frontmatter.character || undefined,
    });
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
  const projectAgentsDir = findNearestDir(cwd, ".pi", "agents");
  const claudeAgentsDir = findNearestDir(cwd, ".claude", "agents");
  const userAgents = loadAgentsFromDir(userDir, "user", { format: "pi" });
  const projectPiAgents = projectAgentsDir
    ? loadAgentsFromDir(projectAgentsDir, "project", { format: "pi" })
    : [];
  const projectClaudeAgents = claudeAgentsDir
    ? loadAgentsFromDir(claudeAgentsDir, "project", { format: "claude", recursive: true })
    : [];
  const agentMap = new Map<string, AgentConfig>();
  for (const agent of userAgents) agentMap.set(agent.name, agent);
  for (const agent of [...projectClaudeAgents, ...projectPiAgents]) agentMap.set(agent.name, agent);
  const projectSources = [projectAgentsDir, claudeAgentsDir].filter((d): d is string => Boolean(d));
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
      let score = Infinity;
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
