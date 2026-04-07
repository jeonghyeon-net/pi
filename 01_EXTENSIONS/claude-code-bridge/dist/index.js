// src/hooks/tools.ts
import { resolve as resolve2 } from "node:path";

// src/core/pathing.ts
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import crypto from "node:crypto";
function normalizePath(value) {
  return value.replace(/\\/g, "/");
}
function relativePosix(from, to) {
  return normalizePath(relative(from, to));
}
function sha(input) {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 12);
}
function scopeLabel(scope) {
  return scope === "user" ? "User" : scope === "local" ? "Local" : "Project";
}
function isPathInside(root, target) {
  const rel = relative(root, target);
  return rel === "" || !rel.startsWith("..") && !isAbsolute(rel);
}
function resolveImportPath(token, baseFile) {
  if (token.startsWith("~/")) return join(process.env.HOME || "", token.slice(2));
  if (isAbsolute(token)) return token;
  return resolve(dirname(baseFile), token);
}
function isImportAllowed(scope, ownerRoot, resolvedPath) {
  return scope === "user" || isPathInside(ownerRoot, resolvedPath);
}

// src/core/globs.ts
function braceExpand(pattern) {
  const match = pattern.match(/\{([^{}]+)\}/);
  if (!match) return [pattern];
  const start = match.index ?? 0;
  const before = pattern.slice(0, start);
  const after = pattern.slice(start + match[0].length);
  return match[1].split(",").flatMap((option) => braceExpand(`${before}${option}${after}`));
}
function escapeRegex(text) {
  return text.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
function globToRegex(glob) {
  let re = "^";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      re += glob[i + 2] === "/" ? "(?:.*/)?" : ".*";
      i += glob[i + 2] === "/" ? 2 : 1;
    } else if (char === "*") re += "[^/]*";
    else if (char === "?") re += ".";
    else re += escapeRegex(char);
  }
  return new RegExp(`${re}$`);
}
function matchesGlobs(value, globs) {
  return globs.some((glob) => braceExpand(glob).some((item) => matchesGlobValue(item, value)));
}
function matchesGlobValue(glob, value) {
  return hasGlobMeta(value) ? globsOverlap(glob, value) : globToRegex(glob).test(value);
}
function hasGlobMeta(value) {
  return /[?*{[]/u.test(value);
}
function globsOverlap(left, right) {
  if (left === right) return true;
  const a = globShape(left);
  const b = globShape(right);
  const sameTree = a.root === b.root || a.root.startsWith(`${b.root}/`) || b.root.startsWith(`${a.root}/`);
  return sameTree && (!a.ext || !b.ext || a.ext === b.ext);
}
function globShape(value) {
  const normalized = normalizePath(value);
  const root = normalized.split(/[?*{[]/u)[0].replace(/\/+$/u, "") || ".";
  const ext = normalized.match(/\.[A-Za-z0-9]+$/u)?.[0] || "";
  return { root, ext };
}
function matchesAnyGlob(ownerRoot, targetPath, globs) {
  const rel = relativePosix(ownerRoot, targetPath);
  if (!rel || rel.startsWith("..")) return false;
  return matchesGlobs(rel, globs);
}
function matchesAbsoluteGlobs(targetPath, globs) {
  return matchesGlobs(normalizePath(targetPath), globs.map(normalizePath));
}

// src/hooks/tools.ts
function buildClaudeInputBase(ctx, eventName) {
  const sessionFile = ctx.sessionManager.getSessionFile();
  return { session_id: sessionFile || "pi-session", transcript_path: sessionFile, cwd: ctx.cwd, permission_mode: "default", hook_event_name: eventName };
}
function toClaudeToolInput(toolName, rawInput, cwd) {
  if (toolName === "bash") return { tool_name: "Bash", tool_input: { command: rawInput.command, timeout: typeof rawInput.timeout === "number" ? rawInput.timeout * 1e3 : void 0 } };
  if (toolName === "read") return { tool_name: "Read", tool_input: { file_path: resolve2(cwd, String(rawInput.path || "")), offset: rawInput.offset, limit: rawInput.limit } };
  if (toolName === "write") return { tool_name: "Write", tool_input: { file_path: resolve2(cwd, String(rawInput.path || "")), content: rawInput.content } };
  if (toolName === "edit") return mapEdit(rawInput, cwd);
  if (toolName === "grep") return { tool_name: "Grep", tool_input: { pattern: rawInput.pattern, path: rawInput.path ? resolve2(cwd, String(rawInput.path)) : void 0, glob: rawInput.glob, ignoreCase: rawInput.ignoreCase, literal: rawInput.literal, context: rawInput.context, limit: rawInput.limit } };
  if (toolName === "find") return { tool_name: "Glob", tool_input: { pattern: rawInput.pattern, path: rawInput.path ? resolve2(cwd, String(rawInput.path)) : cwd } };
  if (toolName === "fetch_content") return { tool_name: "WebFetch", tool_input: { url: rawInput.url, prompt: rawInput.prompt } };
  if (toolName === "web_search") return { tool_name: "WebSearch", tool_input: { query: rawInput.query } };
  if (toolName === "subagent") return { tool_name: "Agent", tool_input: { prompt: rawInput.command, subagent_type: extractSubagentType(rawInput.command) } };
  return void 0;
}
function mapEdit(rawInput, cwd) {
  const firstEdit = Array.isArray(rawInput.edits) ? rawInput.edits[0] : void 0;
  return { tool_name: "Edit", tool_input: { file_path: resolve2(cwd, String(rawInput.path || "")), old_string: firstEdit?.oldText, new_string: firstEdit?.newText, replace_all: Array.isArray(rawInput.edits) && rawInput.edits.length > 1 ? true : void 0 } };
}
function applyUpdatedInput(toolName, eventInput, updatedInput) {
  if (!updatedInput || typeof updatedInput !== "object") return;
  if (toolName === "bash") return updateBash(eventInput, updatedInput);
  if (toolName === "read") return updateFileInput(eventInput, updatedInput);
  if (toolName === "write") return updateFileInput(eventInput, updatedInput, true);
  if (toolName === "edit" && Array.isArray(eventInput.edits) && eventInput.edits.length >= 1) {
    if (typeof updatedInput.file_path === "string") eventInput.path = updatedInput.file_path;
    if (typeof updatedInput.old_string === "string") eventInput.edits[0].oldText = updatedInput.old_string;
    if (typeof updatedInput.new_string === "string") eventInput.edits[0].newText = updatedInput.new_string;
  }
}
function updateBash(eventInput, updatedInput) {
  if (typeof updatedInput.command === "string") eventInput.command = updatedInput.command;
  if (typeof updatedInput.timeout === "number") eventInput.timeout = Math.ceil(updatedInput.timeout / 1e3);
}
function updateFileInput(eventInput, updatedInput, includeContent = false) {
  if (typeof updatedInput.file_path === "string") eventInput.path = updatedInput.file_path;
  if (typeof updatedInput.offset === "number") eventInput.offset = updatedInput.offset;
  if (typeof updatedInput.limit === "number") eventInput.limit = updatedInput.limit;
  if (includeContent && typeof updatedInput.content === "string") eventInput.content = updatedInput.content;
}
function extractTouchedPaths(toolName, rawInput, cwd) {
  if (["read", "write", "edit"].includes(toolName)) return rawInput.path ? [resolve2(cwd, String(rawInput.path))] : [];
  if (toolName === "grep") return withExpressions(resolve2(cwd, String(rawInput.path || cwd)), [rawInput.glob]);
  if (toolName === "find") return withExpressions(resolve2(cwd, String(rawInput.path || cwd)), [rawInput.pattern]);
  return [];
}
function withExpressions(base, expressions) {
  const extras = expressions.filter((value) => typeof value === "string" && value.length > 0).map((value) => resolve2(base, value));
  return [base, ...extras];
}
function activateConditionalRules(state, touchedPaths) {
  const activated = [];
  for (const rule of state.conditionalRules) if (!state.activeConditionalRuleIds.has(rule.id) && touchedPaths.some((path) => matchesAnyGlob(rule.ownerRoot, path, rule.conditionalGlobs))) state.activeConditionalRuleIds.add(rule.id), activated.push(rule);
  return activated;
}
function extractSubagentType(command) {
  return command?.match(/^run\s+([^\s]+)\s+--/)?.[1];
}

// src/core/instructions.ts
import { readdirSync as readdirSync2 } from "node:fs";
import { join as join3, resolve as resolve4 } from "node:path";

// src/core/fs-utils.ts
import { accessSync, constants, existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname as dirname2, join as join2, resolve as resolve3 } from "node:path";
function fileExists(path) {
  try {
    accessSync(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return void 0;
  }
}
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return void 0;
  }
}
function resolveRealPath(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve3(path);
  }
}
function listMarkdownFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const walk2 = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const next = join2(current, entry.name);
      if (entry.isDirectory()) walk2(next);
      else if (entry.isFile() && entry.name.endsWith(".md")) out.push(next);
    }
  };
  walk2(dir);
  return out.sort();
}
function walkAncestors(start) {
  const out = [];
  let current = resolve3(start);
  while (true) {
    out.push(current);
    const parent = dirname2(current);
    if (parent === current) return out.reverse();
    current = parent;
  }
}

// src/core/instructions.ts
function stripHtmlComments(content) {
  return content.replace(/<!--([\s\S]*?)-->/g, "");
}
function expandImportsWithTrace(content, filePath, scope, ownerRoot, depth = 0, seen = /* @__PURE__ */ new Set()) {
  if (depth >= 5) return { text: content, includes: [] };
  const importRegex = /(^|[\s(])@([^\s)]+)/gm;
  const includes = [];
  const text = content.replace(importRegex, (match, prefix, rawToken) => {
    const token = rawToken.trim();
    if (!token || token.includes("://")) return match;
    const resolved = resolveImportPath(token, filePath);
    if (!fileExists(resolved)) return match;
    const canonical = resolveRealPath(resolved);
    const allowedRoot = scope === "user" ? ownerRoot : resolveRealPath(ownerRoot);
    if (!isImportAllowed(scope, allowedRoot, canonical)) return `${prefix}[Blocked import outside allowed root: ${token}]`;
    if (seen.has(canonical)) return `${prefix}[Skipped recursive import: ${token}]`;
    const nextContent = readText(canonical);
    if (!nextContent) return match;
    const nextSeen = new Set(seen);
    nextSeen.add(canonical);
    includes.push({ path: canonical, parentPath: filePath });
    const next = expandImportsWithTrace(nextContent, canonical, scope, ownerRoot, depth + 1, nextSeen);
    includes.push(...next.includes);
    return `${prefix}

[Imported from ${canonical}]
${next.text.trim()}
`;
  });
  return { text, includes };
}
function parseFrontmatter(content) {
  if (!content.startsWith("---\n")) return { body: content, paths: [] };
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) return { body: content, paths: [] };
  const raw = content.slice(4, end).split(/\r?\n/);
  const paths = [];
  let inPaths = false;
  for (const line of raw) {
    const trimmed = line.trim();
    if (!inPaths && trimmed === "paths:") inPaths = true;
    else if (inPaths && trimmed.startsWith("- ")) paths.push(trimmed.slice(2).replace(/^['"]|['"]$/g, ""));
    else if (inPaths && trimmed && /^[A-Za-z0-9_-]+:/.test(trimmed)) break;
  }
  return { body: content.slice(end + 5), paths: paths.filter(Boolean) };
}
function findProjectRoot(cwd) {
  const ancestors = [...walkAncestors(cwd)].reverse();
  for (const dir of ancestors) if (fileExists(join3(dir, ".git"))) return dir;
  for (const dir of ancestors) {
    const names = ["CLAUDE.md", "CLAUDE.local.md", ".claude/CLAUDE.md"];
    if (names.some((name) => fileExists(join3(dir, name))) || hasClaudeSettings(dir)) return dir;
  }
  return resolve4(cwd);
}
function hasClaudeSettings(dir) {
  const claudeDir = join3(dir, ".claude");
  if (!fileExists(claudeDir)) return false;
  try {
    return readdirSync2(claudeDir).some((name) => /^settings.*\.json$/u.test(name));
  } catch {
    return false;
  }
}
function buildInstructionSection(title, path, content) {
  return `### ${title}
Source: ${path}

${content.trim()}`;
}

// src/state/env.ts
import { existsSync as existsSync2 } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as join4 } from "node:path";
async function ensureEnvFile(projectRoot) {
  const dir = join4(tmpdir(), "pi-claude-code-bridge", sha(projectRoot));
  await mkdir(dir, { recursive: true });
  const path = join4(dir, "claude-env.sh");
  if (!existsSync2(path)) await writeFile(path, "", "utf8");
  return path;
}
function mergeStringArrays(base, next) {
  if (!base && !next) return void 0;
  return [.../* @__PURE__ */ new Set([...base || [], ...next || []])];
}

// src/state/instructions.ts
import { join as join5 } from "node:path";
function collectInstructions(cwd, excludes) {
  const projectRoot = findProjectRoot(cwd);
  const instructionFiles = [];
  const instructions = [];
  const add = (path, scope, kind, ownerRoot, content, globs = []) => {
    if (shouldSkip(path, excludes)) return;
    const expanded = expandImportsWithTrace(stripHtmlComments(content), path, scope, ownerRoot);
    const text = expanded.text.trim();
    if (!text) return;
    instructions.push({ id: sha(`${path}:${globs.join(",")}`), path, scope, kind, ownerRoot, content: text, conditionalGlobs: globs, includes: expanded.includes });
    instructionFiles.push(path);
  };
  loadUserFiles(add, excludes);
  loadAncestorFiles(cwd, projectRoot, add, excludes);
  const unconditionalPromptText = instructions.filter((item) => item.conditionalGlobs.length === 0).map((item) => buildInstructionSection(item.kind === "rule" ? `Claude rule (${scopeLabel(item.scope)})` : `Claude instructions (${scopeLabel(item.scope)})`, item.path, item.content)).join("\n\n");
  const conditionalRules = instructions.filter((item) => item.conditionalGlobs.length > 0);
  const eagerLoads = instructions.filter((item) => item.conditionalGlobs.length === 0).flatMap((item) => blockToLoads(item, "session_start"));
  return { instructionFiles, instructions, unconditionalPromptText, conditionalRules, eagerLoads };
}
function blockToLoads(block, loadReason, triggerFilePath) {
  const base = [{ filePath: block.path, scope: block.scope, loadReason, globs: block.conditionalGlobs.length > 0 ? block.conditionalGlobs : void 0, triggerFilePath }];
  return [...base, ...block.includes.map((item) => ({ filePath: item.path, scope: block.scope, loadReason: "include", triggerFilePath, parentFilePath: item.parentPath }))];
}
function loadUserFiles(add, excludes) {
  const home = process.env.HOME || "";
  if (!home) return;
  const claude = join5(home, ".claude", "CLAUDE.md");
  if (fileExists(claude) && !shouldSkip(claude, excludes)) add(claude, "user", "claude", home, readText(claude) || "");
  for (const path of listMarkdownFiles(join5(home, ".claude", "rules")).filter((item) => !shouldSkip(item, excludes))) {
    const parsed = parseFrontmatter(readText(path) || "");
    add(path, "user", "rule", home, parsed.body, parsed.paths);
  }
}
function loadAncestorFiles(cwd, projectRoot, add, excludes) {
  for (const dir of walkAncestors(cwd).filter((item) => item === projectRoot || isPathInside(projectRoot, item))) {
    for (const [path, scope] of [[join5(dir, "CLAUDE.md"), "project"], [join5(dir, ".claude", "CLAUDE.md"), "project"], [join5(dir, "CLAUDE.local.md"), "local"]]) if (fileExists(path) && !shouldSkip(path, excludes)) add(path, scope, "claude", projectRoot, readText(path) || "");
    for (const path of listMarkdownFiles(join5(dir, ".claude", "rules")).filter((item) => !shouldSkip(item, excludes))) {
      const parsed = parseFrontmatter(readText(path) || "");
      add(path, "project", "rule", projectRoot, parsed.body, parsed.paths);
    }
  }
}
function shouldSkip(path, excludes) {
  return Array.isArray(excludes) && excludes.length > 0 && matchesAbsoluteGlobs(path, excludes);
}

// src/core/constants.ts
var SUPPORTED_EVENTS = /* @__PURE__ */ new Set([
  "SessionStart",
  "UserPromptSubmit",
  "InstructionsLoaded",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PreCompact",
  "PostCompact",
  "SessionEnd",
  "Stop",
  "SubagentStart",
  "SubagentStop",
  "ConfigChange",
  "FileChanged"
]);
var PROMPT_AGENT_EVENTS = /* @__PURE__ */ new Set([
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
  "SubagentStop"
]);
var DEFAULT_TIMEOUT_SECONDS = {
  command: 600,
  http: 30,
  prompt: 30,
  agent: 60
};
function hookTypeAllowed(eventName, type) {
  if (eventName === "SessionStart") return type === "command";
  return type === "command" || type === "http" || PROMPT_AGENT_EVENTS.has(eventName);
}

// src/state/hook-parser.ts
function addHookGroups(eventName, groups, path, scope, warnings, hooksByEvent) {
  if (!SUPPORTED_EVENTS.has(eventName)) return warnings.push(`Claude event '${eventName}' exists in ${path} but is not bridged by this extension.`);
  if (!Array.isArray(groups)) return;
  for (const group of groups) for (const hookDef of Array.isArray(group?.hooks) ? group.hooks : []) addHook(eventName, group, hookDef, path, scope, warnings, hooksByEvent);
}
function addHook(eventName, group, hookDef, path, scope, warnings, hooksByEvent) {
  if (!isHookType(hookDef?.type)) return warnings.push(`Claude hook type '${String(hookDef?.type)}' in ${path} is not supported.`);
  if (!hookTypeAllowed(eventName, hookDef.type)) return warnings.push(`Claude ${hookDef.type} hooks are not supported for ${eventName} in ${path}.`);
  if (hookDef?.if) return warnings.push(`Ignoring Claude hook with unsupported 'if' filter: ${path}`);
  const handler = buildHookDef(eventName, group, hookDef, path, scope);
  if (!handler) return warnings.push(`Claude hook in ${path} is missing its required handler field.`);
  if (handler.async && handler.type !== "command") warnings.push(`Ignoring async=true for non-command hook in ${path}.`), handler.async = false;
  if (handler.type === "http" && !handler.url) return;
  if (handler.type === "command" && !handler.command) return;
  if ((handler.type === "prompt" || handler.type === "agent") && !handler.prompt) return;
  if (!hooksByEvent.has(eventName)) hooksByEvent.set(eventName, []);
  hooksByEvent.get(eventName)?.push(handler);
}
function buildHookDef(eventName, group, hookDef, path, scope) {
  const type = hookDef.type;
  const base = { eventName, type, scope, sourcePath: path, matcher: typeof group?.matcher === "string" ? group.matcher : void 0, timeoutSeconds: typeof hookDef?.timeout === "number" ? hookDef.timeout : DEFAULT_TIMEOUT_SECONDS[type], async: hookDef?.async === true };
  if (type === "command") return typeof hookDef?.command === "string" ? { ...base, command: hookDef.command } : void 0;
  if (type === "http") return typeof hookDef?.url === "string" ? { ...base, url: hookDef.url, headers: hookDef?.headers && typeof hookDef.headers === "object" ? hookDef.headers : void 0, allowedEnvVars: Array.isArray(hookDef?.allowedEnvVars) ? hookDef.allowedEnvVars.filter((value) => typeof value === "string") : void 0 } : void 0;
  return typeof hookDef?.prompt === "string" ? { ...base, prompt: hookDef.prompt, model: typeof hookDef?.model === "string" ? hookDef.model : void 0 } : void 0;
}
function isHookType(value) {
  return value === "command" || value === "http" || value === "prompt" || value === "agent";
}

// src/state/settings-discovery.ts
import { readdirSync as readdirSync3 } from "node:fs";
import { basename, join as join6 } from "node:path";
function discoverSettingsEntries(cwd) {
  const entries = [];
  const home = process.env.HOME || "";
  if (home) entries.push(...readUserSettings(home));
  for (const dir of projectDirs(cwd)) entries.push(...readProjectSettings(dir));
  return entries.filter((entry) => fileExists(entry.path));
}
function listConfigFiles(cwd) {
  const entries = [];
  const home = process.env.HOME || "";
  if (home) entries.push(...readUserSettings(home));
  for (const dir of projectDirs(cwd)) entries.push(...readProjectSettings(dir));
  return dedupe(entries);
}
function readUserSettings(home) {
  return readSettings(join6(home, ".claude"), "user");
}
function readProjectSettings(dir) {
  return readSettings(join6(dir, ".claude"));
}
function readSettings(dir, overrideScope) {
  if (!fileExists(dir)) return [];
  return readdirSync3(dir).filter((name) => /^settings.*\.json$/u.test(name)).sort().map((name) => ({ path: join6(dir, name), scope: overrideScope || classifyScope(name) }));
}
function classifyScope(name) {
  return basename(name).includes(".local.") || name === "settings.local.json" ? "local" : "project";
}
function projectDirs(cwd) {
  const projectRoot = findProjectRoot(cwd);
  return walkAncestors(cwd).filter((dir) => dir === projectRoot || isPathInside(projectRoot, dir));
}
function dedupe(entries) {
  const seen = /* @__PURE__ */ new Set();
  return entries.filter((entry) => seen.has(entry.path) ? false : (seen.add(entry.path), true));
}

// src/state/settings.ts
function collectSettings(cwd) {
  const warnings = [];
  const settingsFiles = [];
  const hooksByEvent = /* @__PURE__ */ new Map();
  const mergedEnv = {};
  let httpHookAllowedEnvVars;
  let allowedHttpHookUrls;
  let claudeMdExcludes;
  let disableAllHooks = false;
  for (const entry of discoverSettingsEntries(cwd)) {
    const json = readJson(entry.path);
    settingsFiles.push(entry.path);
    if (!json || typeof json !== "object") {
      warnings.push(`Could not parse Claude settings: ${entry.path}`);
      continue;
    }
    if (json.env && typeof json.env === "object") entry.scope === "user" ? Object.entries(json.env).forEach(([key, value]) => typeof value === "string" && (mergedEnv[key] = value)) : warnings.push(`Ignoring project/local Claude env from ${entry.path}; only user-scope env is applied.`);
    httpHookAllowedEnvVars = mergeAllowlist(httpHookAllowedEnvVars, json.httpHookAllowedEnvVars, entry.path, entry.scope, warnings, "Ignoring project/local httpHookAllowedEnvVars from");
    allowedHttpHookUrls = mergeAllowlist(allowedHttpHookUrls, json.allowedHttpHookUrls, entry.path, entry.scope, warnings, "Ignoring project/local allowedHttpHookUrls from");
    claudeMdExcludes = mergeAllowlist(claudeMdExcludes, json.claudeMdExcludes, entry.path, entry.scope, warnings, "Ignoring project/local claudeMdExcludes from");
    if (typeof json.disableAllHooks === "boolean") entry.scope === "user" ? disableAllHooks = json.disableAllHooks : warnings.push(`Ignoring project/local disableAllHooks from ${entry.path}.`);
    for (const [eventName, groups] of Object.entries(json.hooks || {})) addHookGroups(eventName, groups, entry.path, entry.scope, warnings, hooksByEvent);
  }
  return { settingsFiles, hooksByEvent, mergedEnv, httpHookAllowedEnvVars, allowedHttpHookUrls, claudeMdExcludes, disableAllHooks, warnings };
}
function mergeAllowlist(base, value, path, scope, warnings, ignoredPrefix) {
  if (!Array.isArray(value)) return base;
  if (scope && scope !== "user" && warnings && ignoredPrefix) return value.length > 0 ? (warnings.push(`${ignoredPrefix} ${path}.`), base) : base;
  return mergeStringArrays(base, value.filter((item) => typeof item === "string"));
}

// src/runtime/watch-config.ts
import { basename as basename2, isAbsolute as isAbsolute2, resolve as resolve5 } from "node:path";
function extractFileWatchBasenames(hooks) {
  const tokens = hooks.flatMap((hook) => literalBasenames(hook.matcher));
  return [...new Set(tokens.length > 0 ? tokens : [])];
}
function literalBasenames(matcher) {
  if (!matcher || matcher === "" || matcher === "*") return ["*"];
  const tokens = matcher.split("|").map((item) => item.trim()).filter(Boolean);
  return tokens.every(isLiteralFileName) ? [...new Set(tokens.map((item) => basename2(item)))] : ["*"];
}
function replaceDynamicWatchPaths(results, cwd) {
  for (const result of results) {
    const value = result.parsedJson?.watchPaths;
    if (!Array.isArray(value)) continue;
    return value.filter((item) => typeof item === "string").map((item) => isAbsolute2(item) ? item : resolve5(cwd, item));
  }
  return void 0;
}
function isLiteralFileName(value) {
  return !/[()[\]{}+?^$\\*]/u.test(value);
}

// src/state/collect.ts
async function loadState(cwd) {
  const settings = collectSettings(cwd);
  const projectRoot = findProjectRoot(cwd);
  const instructionState = collectInstructions(cwd, settings.claudeMdExcludes);
  const enabled = instructionState.instructions.length > 0 || settings.hooksByEvent.size > 0 || Object.keys(settings.mergedEnv).length > 0;
  return {
    cwd,
    projectRoot,
    enabled,
    instructionFiles: instructionState.instructionFiles,
    settingsFiles: settings.settingsFiles,
    instructions: instructionState.instructions,
    eagerLoads: instructionState.eagerLoads,
    unconditionalPromptText: instructionState.unconditionalPromptText,
    conditionalRules: instructionState.conditionalRules,
    activeConditionalRuleIds: /* @__PURE__ */ new Set(),
    hooksByEvent: settings.hooksByEvent,
    mergedEnv: settings.mergedEnv,
    httpHookAllowedEnvVars: settings.httpHookAllowedEnvVars,
    allowedHttpHookUrls: settings.allowedHttpHookUrls,
    claudeMdExcludes: settings.claudeMdExcludes,
    fileWatchBasenames: extractFileWatchBasenames(settings.hooksByEvent.get("FileChanged") || []),
    disableAllHooks: settings.disableAllHooks,
    hasRepoScopedHooks: Array.from(settings.hooksByEvent.values()).some((items) => items.some((item) => item.scope !== "user")),
    envFilePath: enabled ? await ensureEnvFile(projectRoot) : void 0,
    warnings: settings.warnings
  };
}

// src/runtime/store.ts
var activeState = null;
var queuedHookContext = [];
var stopHookActive = false;
var warned = /* @__PURE__ */ new Set();
var trustedRoots = /* @__PURE__ */ new Set();
var promptedRoots = /* @__PURE__ */ new Set();
function getState() {
  return activeState;
}
async function refreshState(ctx) {
  const next = await loadState(ctx.cwd);
  if (activeState) next.activeConditionalRuleIds = activeState.activeConditionalRuleIds;
  activeState = next;
  for (const warning of compactWarnings(next.warnings)) appendWarning(ctx, `[claude-bridge] ${warning}`);
  return next;
}
function appendWarning(ctx, message) {
  if (warned.has(message)) return;
  warned.add(message);
  ctx?.ui.notify(message, "warning");
}
function compactWarnings(warnings) {
  return [...new Set(warnings)];
}
function queueAdditionalContext(texts) {
  for (const text of texts) if (text?.trim()) queuedHookContext.push(text.trim());
}
function buildDynamicContext(state) {
  const activeRules = state.conditionalRules.filter((rule) => state.activeConditionalRuleIds.has(rule.id));
  const sections = [
    activeRules.length > 0 ? "## Active path-scoped Claude rules\n" + activeRules.map((rule) => buildInstructionSection(`Conditional rule (${scopeLabel(rule.scope)})`, rule.path, rule.content)).join("\n\n") : "",
    queuedHookContext.length > 0 ? `## Claude hook context
${queuedHookContext.join("\n\n")}` : ""
  ].filter(Boolean);
  queuedHookContext = [];
  return sections.length > 0 ? sections.join("\n\n") : void 0;
}
function getStopHookActive() {
  return stopHookActive;
}
function setStopHookActive(value) {
  stopHookActive = value;
}
function getTrustedRoots() {
  return trustedRoots;
}
function getPromptedRoots() {
  return promptedRoots;
}
function clearTrustState() {
  trustedRoots.clear();
  promptedRoots.clear();
}
function clearSessionState() {
  activeState = null;
  queuedHookContext = [];
  stopHookActive = false;
  warned.clear();
  clearTrustState();
}

// src/runtime/common.ts
function matcherMatches(matcher, value) {
  if (!matcher || matcher === "" || matcher === "*") return true;
  if (!value) return false;
  try {
    return new RegExp(matcher).test(value);
  } catch {
    return false;
  }
}
function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((block) => block?.type === "text" ? String(block.text || "") : block?.type === "thinking" ? String(block.thinking || "") : block?.type === "toolCall" ? `[tool call ${block.name}]` : "").filter(Boolean).join("\n");
}
function extractLastAssistantMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]?.role === "assistant") return textFromContent(messages[i].content);
  return "";
}
function hookSpecificOutput(result, eventName) {
  return result.parsedJson?.hookSpecificOutput?.hookEventName === eventName ? result.parsedJson.hookSpecificOutput : void 0;
}
function plainAdditionalText(result) {
  return result.parsedJson ? void 0 : result.stdout.trim() || void 0;
}
async function ensureProjectHookTrust(ctx, state) {
  if (!state.hasRepoScopedHooks || getTrustedRoots().has(state.projectRoot)) return true;
  if (getPromptedRoots().has(state.projectRoot)) return false;
  getPromptedRoots().add(state.projectRoot);
  if (!ctx.hasUI) return appendWarning(ctx, `[claude-bridge] Repo-scoped Claude hooks are disabled for this session until trusted: ${state.projectRoot}`), false;
  const ok = await ctx.ui.confirm("Trust repo-scoped Claude hooks for this session?", `${state.projectRoot}

This project defines Claude command/http hooks in .claude/settings*.json.
Trusting allows those repo-scoped hooks to run automatically inside pi for this session only.`);
  if (!ok) return ctx.ui.notify(`[claude-bridge] Repo-scoped hooks remain disabled for ${state.projectRoot}`, "warning"), false;
  getTrustedRoots().add(state.projectRoot);
  ctx.ui.notify(`[claude-bridge] Trusted repo-scoped hooks for ${state.projectRoot}`, "info");
  return true;
}

// src/hooks/run.ts
import { spawn } from "node:child_process";

// src/hooks/llm.ts
import { completeSimple } from "@mariozechner/pi-ai";
import { DefaultResourceLoader, SessionManager, createAgentSession, createBashTool, createFindTool, createGrepTool, createReadTool } from "@mariozechner/pi-coding-agent";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir as tmpdir2 } from "node:os";
import { join as join7 } from "node:path";
async function runVerifierHook(handler, input, ctx) {
  const model = resolveModel(handler.model, ctx);
  if (!model) return { code: 1, stdout: "", stderr: `No model available for ${handler.type} hook.` };
  const prompt = buildPrompt(handler, input);
  return handler.type === "prompt" ? await runPrompt(handler, prompt, model, ctx) : await runAgent(handler, prompt, model, ctx);
}
function resolveModel(modelName, ctx) {
  if (!modelName) return ctx.model;
  const [provider, modelId] = modelName.includes("/") ? modelName.split("/", 2) : modelName.split(":", 2);
  return provider && modelId ? ctx.modelRegistry.find(provider, modelId) : ctx.model;
}
function buildPrompt(handler, input) {
  const args = JSON.stringify(input, null, 2);
  const body = handler.prompt?.includes("$ARGUMENTS") ? handler.prompt.replaceAll("$ARGUMENTS", args) : `${handler.prompt}

Hook input JSON:
${args}`;
  return `${body}

Return ONLY valid JSON matching {"ok":boolean,"reason"?:string}. Set ok=false only when this event should be blocked.`;
}
async function runPrompt(handler, prompt, model, ctx) {
  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) return { code: 1, stdout: "", stderr: auth.error };
  const controller = new AbortController();
  try {
    const message = await withTimeout(completeSimple(model, { messages: [{ role: "user", content: prompt, timestamp: Date.now() }] }, { apiKey: auth.apiKey, headers: auth.headers, signal: controller.signal }), handler.timeoutSeconds * 1e3, () => controller.abort());
    return mapVerifierResult(handler.eventName, message.content.filter((item) => item.type === "text").map((item) => item.text).join("\n"));
  } catch (error) {
    return { code: 1, stdout: "", stderr: error?.message || String(error) };
  }
}
async function runAgent(handler, prompt, model, ctx) {
  const agentDir = await mkdtemp(join7(tmpdir2(), "pi-claude-hook-"));
  const loader = new DefaultResourceLoader({ cwd: ctx.cwd, agentDir, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, agentsFilesOverride: () => ({ agentsFiles: [] }), systemPromptOverride: () => "You are a verification agent. Use tools only when needed and answer with JSON only." });
  await loader.reload();
  const { session } = await createAgentSession({ cwd: ctx.cwd, model, modelRegistry: ctx.modelRegistry, resourceLoader: loader, sessionManager: SessionManager.inMemory(), tools: [createReadTool(ctx.cwd), createBashTool(ctx.cwd), createGrepTool(ctx.cwd), createFindTool(ctx.cwd)] });
  try {
    await withTimeout(session.prompt(prompt), handler.timeoutSeconds * 1e3, () => void session.abort());
    const last = session.messages.filter((item) => item.role === "assistant").at(-1);
    return mapVerifierResult(handler.eventName, last ? last.content.filter((item) => item.type === "text").map((item) => item.text).join("\n") : "");
  } catch (error) {
    return { code: 1, stdout: "", stderr: error?.message || String(error) };
  } finally {
    session.dispose();
    await rm(agentDir, { recursive: true, force: true });
  }
}
function mapVerifierResult(eventName, raw) {
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed.ok !== "boolean") return { code: 1, stdout: raw, stderr: "Verifier hook did not return valid JSON." };
  if (parsed.ok) return { code: 0, stdout: raw, stderr: "", parsedJson: {} };
  return eventName === "PreToolUse" ? { code: 0, stdout: raw, stderr: "", parsedJson: { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: parsed.reason || "Denied by Claude verifier hook" } } } : { code: 0, stdout: raw, stderr: "", parsedJson: { decision: "block", reason: parsed.reason || "Blocked by Claude verifier hook" } };
}
function parseJson(raw) {
  try {
    return JSON.parse(raw.trim());
  } catch {
    return void 0;
  }
}
function withTimeout(promise, ms, onTimeout) {
  return new Promise((resolve7, reject) => {
    const timer2 = setTimeout(() => {
      onTimeout();
      reject(new Error(`Hook timed out after ${Math.ceil(ms / 1e3)}s`));
    }, ms);
    void promise.then((value) => (clearTimeout(timer2), resolve7(value)), (error) => (clearTimeout(timer2), reject(error)));
  });
}

// src/hooks/run.ts
async function runHook(handler, input, state, cwd, ctx) {
  if (handler.type === "prompt" || handler.type === "agent") return await runVerifierHook(handler, input, ctx);
  return handler.type === "command" ? await runCommandHook(handler, input, state, cwd) : await runHttpHook(handler, input, state);
}
function parseHookJson(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return void 0;
  try {
    return JSON.parse(trimmed);
  } catch {
    return void 0;
  }
}
async function runCommandHook(handler, input, state, cwd) {
  const child = spawn(process.env.SHELL || "/bin/bash", ["-lc", handler.command || ""], { cwd, env: { ...process.env, ...state.mergedEnv, CLAUDE_PROJECT_DIR: state.projectRoot, CLAUDE_ENV_FILE: state.envFilePath || "" }, stdio: ["pipe", "pipe", "pipe"] });
  return await new Promise((done) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (code) => settled ? void 0 : (settled = true, done({ code, stdout, stderr, parsedJson: parseHookJson(stdout) }));
    const timer2 = setTimeout(() => {
      stderr += `Hook timed out after ${handler.timeoutSeconds}s`;
      child.kill("SIGTERM");
      finish(1);
    }, handler.timeoutSeconds * 1e3);
    child.stdout.on("data", (chunk) => stdout += String(chunk));
    child.stderr.on("data", (chunk) => stderr += String(chunk));
    child.on("error", (error) => {
      clearTimeout(timer2);
      stderr += error.message;
      finish(1);
    });
    child.on("close", (code) => {
      clearTimeout(timer2);
      finish(code ?? 1);
    });
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}
async function runHttpHook(handler, input, state) {
  if (!urlAllowed(handler.url || "", state.allowedHttpHookUrls)) return { code: 1, stdout: "", stderr: "HTTP hook blocked by allowedHttpHookUrls." };
  const controller = new AbortController();
  const timer2 = setTimeout(() => controller.abort(), handler.timeoutSeconds * 1e3);
  try {
    const response = await fetch(handler.url || "", { method: "POST", headers: { "Content-Type": "application/json", ...interpolateHeaders(handler.headers, handler.allowedEnvVars, state.httpHookAllowedEnvVars, state.mergedEnv) || {} }, body: JSON.stringify(input), signal: controller.signal });
    const text = await response.text();
    clearTimeout(timer2);
    return { code: response.ok ? 0 : 1, stdout: text, stderr: response.ok ? "" : `HTTP ${response.status}`, parsedJson: parseHookJson(text) };
  } catch (error) {
    clearTimeout(timer2);
    return { code: 1, stdout: "", stderr: error?.message || String(error) };
  }
}
function interpolateHeaders(headers, allowedEnvVars, globalAllowlist, mergedEnv = {}) {
  if (!headers) return void 0;
  const allowed = new Set(globalAllowlist ? (allowedEnvVars || []).filter((name) => globalAllowlist.includes(name)) : allowedEnvVars || []);
  const env = { ...process.env, ...mergedEnv };
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, value.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (_match, name) => allowed.has(name) ? env[name] || "" : "")]));
}
function urlAllowed(url, patterns) {
  if (!patterns) return true;
  return patterns.some((pattern) => new RegExp(`^${pattern.replace(/[|\\{}()[\]^$+?.]/g, "\\$&").replace(/\*/g, ".*")}$`).test(url));
}

// src/runtime/handlers.ts
async function runHandlers(pi, eventName, matcherValue, input, ctx) {
  const state = getState() ?? await refreshState(ctx);
  if (!state.enabled || state.disableAllHooks) return [];
  const matched = (state.hooksByEvent.get(eventName) || []).filter((handler) => matcherMatches(handler.matcher, matcherValue));
  const needsTrust = matched.some((handler) => handler.scope !== "user");
  const repoHooksTrusted = needsTrust ? await ensureProjectHookTrust(ctx, state) : false;
  const handlers = matched.filter((handler) => handler.scope === "user" || repoHooksTrusted);
  const results = [];
  for (const handler of handlers) {
    if (handler.async && handler.type === "command") {
      void runHook(handler, input, state, ctx.cwd, ctx).then((result) => sendAsyncHookMessage(pi, { ...result, scope: handler.scope }, eventName));
      continue;
    }
    try {
      results.push({ ...await runHook(handler, input, state, ctx.cwd, ctx), scope: handler.scope });
    } catch (error) {
      appendWarning(ctx, `[claude-bridge] Hook failed open for ${eventName}: ${error?.message || String(error)}`);
    }
  }
  return results;
}
function sendAsyncHookMessage(pi, result, eventName) {
  const extra = hookSpecificOutput(result, eventName)?.additionalContext || result.parsedJson?.systemMessage || plainAdditionalText(result);
  if (!extra) return;
  pi.sendMessage({ customType: "claude-bridge-async", content: `[claude-bridge async ${eventName}] ${extra}`, display: true }, { deliverAs: "followUp", triggerTurn: false });
}

// src/runtime/instructions-loaded.ts
async function emitInstructionLoads(pi, ctx, loads) {
  for (const load of loads) await runHandlers(pi, "InstructionsLoaded", load.loadReason, { ...buildClaudeInputBase(ctx, "InstructionsLoaded"), file_path: load.filePath, memory_type: scopeLabel(load.scope), load_reason: load.loadReason, globs: load.globs, trigger_file_path: load.triggerFilePath, parent_file_path: load.parentFilePath }, ctx);
}
function compactLoads() {
  const state = getState();
  if (!state) return [];
  const active = state.conditionalRules.filter((rule) => state.activeConditionalRuleIds.has(rule.id)).flatMap((rule) => blockToLoads(rule, "compact"));
  return [...state.eagerLoads.map((item) => item.loadReason === "include" ? { ...item } : { ...item, loadReason: "compact" }), ...active];
}

// src/runtime/watch-scan.ts
import { lstatSync, readdirSync as readdirSync4 } from "node:fs";
import { basename as basename3, join as join8, resolve as resolve6 } from "node:path";
function scanConfigSnapshot(cwd) {
  const out = /* @__PURE__ */ new Map();
  for (const entry of listConfigFiles(cwd)) out.set(entry.path, signature(entry.path));
  for (const path of listSkillFiles(cwd)) out.set(path, signature(path));
  return out;
}
function diffSnapshots(before, after) {
  const paths = [.../* @__PURE__ */ new Set([...before.keys(), ...after.keys()])].sort();
  return paths.flatMap((path) => before.get(path) === after.get(path) ? [] : [{ path, event: !before.has(path) ? "add" : !after.has(path) ? "unlink" : "change" }]);
}
function classifyConfigSource(path) {
  const userDir = `${process.env.HOME || ""}/.claude/`;
  if (userDir !== "/.claude/" && path.includes(userDir) && /\/\.claude\/settings.*\.json$/u.test(path)) return "user_settings";
  if (path.endsWith("/.claude/settings.local.json") || path.includes("/.claude/settings.local.")) return "local_settings";
  if (path.endsWith("/.claude/settings.json") || /\/\.claude\/settings.*\.json$/u.test(path)) return "project_settings";
  return path.includes("/.claude/skills/") ? "skills" : void 0;
}
function scanFileSnapshot(projectRoot, basenames, dynamicWatchPaths) {
  const out = /* @__PURE__ */ new Map();
  const watchAll = basenames.includes("*");
  if (watchAll || basenames.length > 0) walk(projectRoot, (path) => watchAll || basenames.includes(basename3(path)), (path) => out.set(path, signature(path)));
  for (const path of dynamicWatchPaths.map((item) => resolve6(item))) collect(path, out);
  return out;
}
function listSkillFiles(cwd) {
  const out = [];
  walk(findProjectRoot(cwd), (path) => path.includes("/.claude/skills/"), (path) => out.push(path));
  return out;
}
function walk(root, keep, onFile) {
  for (const entry of safeReadDir(root)) {
    const path = join8(root, entry.name);
    if (entry.isDirectory()) {
      if ([".git", "node_modules", "dist", "coverage"].includes(entry.name)) continue;
      walk(path, keep, onFile);
    } else if (entry.isFile() && keep(path)) onFile(path);
  }
}
function collect(path, out) {
  try {
    const stat = lstatSync(path);
    if (stat.isDirectory()) return walk(path, () => true, (file) => out.set(file, signature(file)));
    if (stat.isFile()) out.set(path, signature(path));
  } catch {
    out.set(path, "missing");
  }
}
function signature(path) {
  try {
    const stat = lstatSync(path);
    return `${stat.isFile() ? "f" : "d"}:${stat.size}:${Math.floor(stat.mtimeMs)}`;
  } catch {
    return "missing";
  }
}
function safeReadDir(path) {
  try {
    return readdirSync4(path, { withFileTypes: true });
  } catch {
    return [];
  }
}

// src/runtime/config-change.ts
async function handleConfigChanges(pi, ctx, paths) {
  for (const path of paths) {
    const source = classifyConfigSource(path);
    if (!source) continue;
    const state = getState();
    if (state?.enabled) {
      const results = await runHandlers(pi, "ConfigChange", source, { ...buildClaudeInputBase(ctx, "ConfigChange"), source, file_path: path }, ctx);
      if (isBlocked(results)) {
        appendWarning(ctx, `[claude-bridge] Blocked Claude config change for ${path}`);
        continue;
      }
    }
    await refreshState(ctx);
  }
}
function isBlocked(results) {
  return results.some((result) => result.code === 2 || result.parsedJson?.decision === "block");
}

// src/runtime/file-change.ts
import { basename as basename4 } from "node:path";

// src/runtime/watch-store.ts
var timer;
var configSnapshot = /* @__PURE__ */ new Map();
var fileSnapshot = /* @__PURE__ */ new Map();
var userDynamicWatchPaths = [];
var repoDynamicWatchPaths = [];
function stopWatchLoop() {
  if (timer) clearInterval(timer);
  timer = void 0;
}
function setWatchLoop(next) {
  stopWatchLoop();
  timer = next;
}
function getConfigSnapshot() {
  return configSnapshot;
}
function setConfigSnapshot(next) {
  configSnapshot = next;
}
function getFileSnapshot() {
  return fileSnapshot;
}
function setFileSnapshot(next) {
  fileSnapshot = next;
}
function getDynamicWatchPaths() {
  return [.../* @__PURE__ */ new Set([...userDynamicWatchPaths, ...repoDynamicWatchPaths])];
}
function setDynamicWatchPaths(next, scope) {
  if (scope === "user") userDynamicWatchPaths = [...new Set(next)];
  else repoDynamicWatchPaths = [...new Set(next)];
}
function clearRepoDynamicWatchPaths() {
  repoDynamicWatchPaths = [];
}
function clearWatchState() {
  configSnapshot = /* @__PURE__ */ new Map();
  fileSnapshot = /* @__PURE__ */ new Map();
  userDynamicWatchPaths = [];
  repoDynamicWatchPaths = [];
}

// src/runtime/file-change.ts
async function handleFileChanges(pi, ctx, changes) {
  const state = getState();
  if (!state?.enabled || (state.hooksByEvent.get("FileChanged") || []).length === 0) return;
  for (const change of changes) {
    const results = await runHandlers(pi, "FileChanged", basename4(change.path), { ...buildClaudeInputBase(ctx, "FileChanged"), file_path: change.path, event: change.event }, ctx);
    applyDynamicWatchPaths(results, ctx.cwd);
  }
}
function applyDynamicWatchPaths(results, cwd) {
  const user = replaceDynamicWatchPaths(results.filter((item) => item.scope === "user"), cwd);
  const repo = replaceDynamicWatchPaths(results.filter((item) => item.scope !== "user"), cwd);
  if (user) setDynamicWatchPaths(user, "user");
  if (repo) setDynamicWatchPaths(repo, "repo");
}
function currentWatchedPaths() {
  return getDynamicWatchPaths();
}

// src/runtime/watch.ts
async function startWatchLoop(pi, ctx) {
  setConfigSnapshot(scanConfigSnapshot(ctx.cwd));
  const state = getState();
  setFileSnapshot(scanFileSnapshot(state?.projectRoot || ctx.cwd, state?.fileWatchBasenames || [], currentWatchedPaths()));
  setWatchLoop(setInterval(() => void tick(pi, ctx), 1e3));
}
function stopBridgeWatchLoop() {
  stopWatchLoop();
}
async function tick(pi, ctx) {
  const beforeConfig = getConfigSnapshot();
  const nextConfig = scanConfigSnapshot(ctx.cwd);
  setConfigSnapshot(nextConfig);
  await handleConfigChanges(pi, ctx, diffSnapshots(beforeConfig, nextConfig).map((item) => item.path));
  const state = getState();
  const beforeFile = getFileSnapshot();
  const nextFile = scanFileSnapshot(state?.projectRoot || ctx.cwd, state?.fileWatchBasenames || [], currentWatchedPaths());
  setFileSnapshot(nextFile);
  await handleFileChanges(pi, ctx, diffSnapshots(beforeFile, nextFile).filter((item) => item.event !== "unlink" || beforeFile.get(item.path) !== void 0));
}

// src/runtime/agent.ts
function createAgentEndHandler(pi) {
  return async (event, ctx) => {
    const state = getState() ?? await refreshState(ctx);
    if (!state.enabled) return;
    const results = await runHandlers(pi, "Stop", void 0, { ...buildClaudeInputBase(ctx, "Stop"), stop_hook_active: getStopHookActive(), last_assistant_message: extractLastAssistantMessage(event.messages || []) }, ctx);
    for (const result of results) {
      if (result.code !== 2 && result.parsedJson?.decision !== "block") continue;
      setStopHookActive(true);
      pi.sendUserMessage(result.stderr.trim() || result.parsedJson?.reason || "Claude Stop hook requested continuation.");
      return;
    }
    setStopHookActive(false);
  };
}
function createSessionBeforeCompactHandler(pi) {
  return async (event, ctx) => void await runCompactHook(pi, "PreCompact", { trigger: "manual", custom_instructions: event.customInstructions || "" }, ctx);
}
function createSessionCompactHandler(pi) {
  return async (event, ctx) => {
    await runCompactHook(pi, "PostCompact", { trigger: "manual", compact_summary: event.compactionEntry?.summary || "" }, ctx);
    await emitInstructionLoads(pi, ctx, compactLoads());
  };
}
function createSessionShutdownHandler(pi) {
  return async (_event, ctx) => {
    stopBridgeWatchLoop();
    await runCompactHook(pi, "SessionEnd", { reason: "other" }, ctx);
    clearSessionState();
    clearWatchState();
  };
}
async function runCompactHook(pi, eventName, extra, ctx) {
  const state = getState() ?? await refreshState(ctx);
  if (!state.enabled) return;
  await runHandlers(pi, eventName, eventName === "SessionEnd" ? "other" : "manual", { ...buildClaudeInputBase(ctx, eventName), ...extra }, ctx);
}

// src/runtime/watch-reset.ts
function clearDynamicWatchPaths(projectRoot, basenames) {
  clearRepoDynamicWatchPaths();
  setFileSnapshot(scanFileSnapshot(projectRoot, basenames, getDynamicWatchPaths()));
}

// src/runtime/commands.ts
function createClaudeBridgeCommand() {
  return { description: "Show Claude Code bridge status for the current cwd", handler: async (_args, ctx) => {
    const state = await refreshState(ctx);
    if (!state.enabled) return ctx.ui.notify("[claude-bridge] No Claude Code files detected for this cwd.", "info");
    const activeRules = state.conditionalRules.filter((rule) => state.activeConditionalRuleIds.has(rule.id));
    const lines = [`[claude-bridge] projectRoot=${state.projectRoot}`, `trustedProjectHooks=${getTrustedRoots().has(state.projectRoot)}`, `instructions=${state.instructionFiles.length}`, `settings=${state.settingsFiles.length}`, `conditionalRules=${state.conditionalRules.length}`, `activeConditionalRules=${activeRules.length}`, `hookEvents=${Array.from(state.hooksByEvent.keys()).join(", ") || "none"}`];
    if (state.warnings.length > 0) lines.push(`warnings=${compactWarnings(state.warnings).join(" | ")}`);
    ctx.ui.notify(lines.join("\n"), "info");
  } };
}
function createTrustHooksCommand() {
  return { description: "Trust repo-scoped Claude hooks for the current project in this session", handler: async (_args, ctx) => {
    const state = await refreshState(ctx);
    getTrustedRoots().add(state.projectRoot);
    ctx.ui.notify(`[claude-bridge] Trusted repo-scoped hooks for ${state.projectRoot}`, "info");
  } };
}
function createUntrustHooksCommand() {
  return { description: "Disable repo-scoped Claude hooks for the current project in this session", handler: async (_args, ctx) => {
    const state = await refreshState(ctx);
    getTrustedRoots().delete(state.projectRoot);
    getPromptedRoots().delete(state.projectRoot);
    clearDynamicWatchPaths(state.projectRoot, state.fileWatchBasenames);
    ctx.ui.notify(`[claude-bridge] Untrusted repo-scoped hooks for ${state.projectRoot}`, "info");
  } };
}

// src/runtime/context.ts
function createSessionStartHandler(pi) {
  return async (event, ctx) => {
    const state = await refreshState(ctx);
    await startWatchLoop(pi, ctx);
    if (!state.enabled) return;
    ctx.ui.notify(`[claude-bridge] detected ${state.instructionFiles.length} instruction file(s), ${state.settingsFiles.length} settings file(s).`, "info");
    const source = event.reason === "resume" ? "resume" : "startup";
    const results = await runHandlers(pi, "SessionStart", source, { ...buildClaudeInputBase(ctx, "SessionStart"), source, pi_source: event.reason, model: `${ctx.model?.provider || "unknown"}/${ctx.model?.id || "unknown"}` }, ctx);
    await emitInstructionLoads(pi, ctx, state.eagerLoads);
    queueAdditionalContext(results.flatMap((result) => [hookSpecificOutput(result, "SessionStart")?.additionalContext, plainAdditionalText(result)]));
  };
}
async function handleBeforeAgentStart(event, ctx) {
  const state = await refreshState(ctx);
  if (!state.enabled || !state.unconditionalPromptText.trim()) return;
  return { systemPrompt: `${event.systemPrompt}

## Claude Code Bridge
The current project contains Claude Code instructions. Follow them as project policy.

${state.unconditionalPromptText}` };
}
async function handleContext(event, ctx) {
  const state = getState() ?? await refreshState(ctx);
  const dynamicContext = state.enabled ? buildDynamicContext(state) : void 0;
  if (!dynamicContext) return;
  return { messages: [...event.messages, { role: "custom", customType: "claude-bridge", content: dynamicContext, display: false, timestamp: Date.now() }] };
}

// src/runtime/input.ts
function createInputHandler(pi) {
  return async (event, ctx) => {
    const state = await refreshState(ctx);
    if (!state.enabled) return { action: "continue" };
    const results = await runHandlers(pi, "UserPromptSubmit", void 0, { ...buildClaudeInputBase(ctx, "UserPromptSubmit"), prompt: event.text }, ctx);
    for (const result of results) {
      if (result.code === 2) return ctx.ui.notify(result.stderr.trim() || "Blocked by Claude hook", "warning"), { action: "handled" };
      if (result.parsedJson?.continue === false) return ctx.ui.notify(result.parsedJson.stopReason || "Stopped by Claude hook", "warning"), { action: "handled" };
      if (result.parsedJson?.decision === "block") return ctx.ui.notify(result.parsedJson.reason || "Blocked by Claude hook", "warning"), { action: "handled" };
      queueAdditionalContext([hookSpecificOutput(result, "UserPromptSubmit")?.additionalContext, plainAdditionalText(result)]);
    }
    return { action: "continue" };
  };
}

// src/runtime/tool-call.ts
function createToolCallHandler(pi) {
  return async (event, ctx) => {
    const state = getState() ?? await refreshState(ctx);
    if (!state.enabled) return;
    const touchedPaths = extractTouchedPaths(event.toolName, event.input, ctx.cwd);
    const activated = activateConditionalRules(state, touchedPaths);
    if (activated.length > 0) {
      for (const rule of activated) await emitInstructionLoads(pi, ctx, blockToLoads(rule, "path_glob_match", touchedPaths[0]));
      queueAdditionalContext([`Activated Claude path-scoped rules for ${touchedPaths.join(", ")}. These rules will apply on the next model turn.`]);
      if (["edit", "write"].includes(event.toolName) && touchedPaths.length > 0) return { block: true, reason: `Claude path-scoped rules became active for ${touchedPaths.join(", ")}. Retry after considering the newly loaded rules.` };
    }
    const mapped = toClaudeToolInput(event.toolName, event.input, ctx.cwd);
    if (!mapped) return;
    const agentReason = mapped.tool_name === "Agent" ? await onSubagentStart(pi, event, ctx) : void 0;
    if (agentReason) queueAdditionalContext(agentReason);
    const results = await runHandlers(pi, "PreToolUse", mapped.tool_name, { ...buildClaudeInputBase(ctx, "PreToolUse"), tool_name: mapped.tool_name, tool_input: mapped.tool_input, tool_use_id: event.toolCallId }, ctx);
    return await resolveDecision(results, event, ctx, mapped.tool_name, state);
  };
}
async function onSubagentStart(pi, event, ctx) {
  const type = event.input.command ? String(event.input.command).match(/^run\s+([^\s]+)\s+--/)?.[1] : void 0;
  const results = await runHandlers(pi, "SubagentStart", type, { ...buildClaudeInputBase(ctx, "SubagentStart"), agent_id: event.toolCallId, agent_type: type }, ctx);
  return results.map((result) => hookSpecificOutput(result, "SubagentStart")?.additionalContext).filter(Boolean);
}
async function resolveDecision(results, event, ctx, name, state) {
  const decision = { additionalContext: [] };
  for (const result of results) {
    const specific = hookSpecificOutput(result, "PreToolUse");
    if (result.code === 2) return { block: true, reason: result.stderr.trim() || "Blocked by Claude PreToolUse hook" };
    if (specific?.additionalContext) decision.additionalContext.push(String(specific.additionalContext));
    if (specific?.updatedInput) decision.updatedInput = specific.updatedInput;
    if (specific?.permissionDecision === "deny") return { block: true, reason: specific.permissionDecisionReason || "Denied by Claude PreToolUse hook" };
    if (specific?.permissionDecision === "defer") return { block: true, reason: "Claude hook requested defer, which pi does not support." };
    if (specific?.permissionDecision === "ask") decision.ask = specific.permissionDecisionReason || "Claude hook requests confirmation";
  }
  queueAdditionalContext(decision.additionalContext);
  if (decision.updatedInput) applyUpdatedInput(event.toolName, event.input, decision.updatedInput);
  if (decision.ask && (!ctx.hasUI || !await ctx.ui.confirm("Claude hook confirmation", `${decision.ask}

Allow ${name}?`))) return { block: true, reason: ctx.hasUI ? "Blocked by Claude ask hook" : `${decision.ask} (no UI available)` };
  if (event.toolName === "bash") event.input.command = `${buildShellPreamble(state)}
${event.input.command}`.trim();
}
function buildShellPreamble(state) {
  const exports = Object.entries(state.mergedEnv).map(([key, value]) => `export ${key}=${JSON.stringify(value)}`);
  if (state.envFilePath) exports.push(`[ -f ${JSON.stringify(state.envFilePath)} ] && . ${JSON.stringify(state.envFilePath)}`);
  return exports.join("\n");
}

// src/runtime/tool-result.ts
function createToolResultHandler(pi) {
  return async (event, ctx) => {
    const state = getState() ?? await refreshState(ctx);
    if (!state.enabled) return;
    const mapped = toClaudeToolInput(event.toolName, event.input, ctx.cwd);
    if (!mapped) return;
    const hookEventName = event.isError ? "PostToolUseFailure" : "PostToolUse";
    const payload = { ...buildClaudeInputBase(ctx, hookEventName), tool_name: mapped.tool_name, tool_input: mapped.tool_input, tool_use_id: event.toolCallId, ...event.isError ? { error: textFromContent(event.content), is_interrupt: false } : { tool_response: { content: textFromContent(event.content), details: event.details } } };
    const patches = buildPatches(await runHandlers(pi, hookEventName, mapped.tool_name, payload, ctx), hookEventName);
    if (mapped.tool_name === "Agent") patches.push(...buildSubagentPatches(await runHandlers(pi, "SubagentStop", extractSubagentType(event.input.command), { ...buildClaudeInputBase(ctx, "SubagentStop"), stop_hook_active: false, agent_id: event.toolCallId, agent_type: extractSubagentType(event.input.command), agent_transcript_path: void 0, last_assistant_message: textFromContent(event.content) }, ctx)));
    return applyPatches(event, patches);
  };
}
function buildPatches(results, eventName) {
  return results.flatMap((result) => {
    const specific = hookSpecificOutput(result, eventName);
    if (result.code === 2 || result.parsedJson?.decision === "block") return [{ text: result.stderr.trim() || result.parsedJson?.reason || specific?.additionalContext || `Blocked by Claude ${eventName} hook`, isError: true }];
    const extra = specific?.additionalContext || plainAdditionalText(result);
    return extra ? [{ text: `[claude-bridge ${eventName}] ${extra}`, isError: false }] : [];
  });
}
function buildSubagentPatches(results) {
  return results.flatMap((result) => result.code === 2 || result.parsedJson?.decision === "block" ? [{ text: result.stderr.trim() || result.parsedJson?.reason || "Claude SubagentStop hook requested continuation.", isError: true }] : hookSpecificOutput(result, "SubagentStop")?.additionalContext ? [{ text: `[claude-bridge SubagentStop] ${hookSpecificOutput(result, "SubagentStop")?.additionalContext}`, isError: false }] : []);
}
function applyPatches(event, patches) {
  if (patches.length === 0) return;
  let content = Array.isArray(event.content) ? [...event.content] : [];
  let isError = event.isError;
  for (const patch of patches) if (patch.text.trim()) content = [...content, { type: "text", text: patch.text.trim() }], isError = patch.isError ?? isError;
  return { content, isError };
}

// src/runtime/user-bash.ts
import { createLocalBashOperations } from "@mariozechner/pi-coding-agent";
function createUserBashHandler(pi) {
  return async (event, ctx) => {
    const state = getState() ?? await refreshState(ctx);
    if (!state.enabled) return;
    const results = await runHandlers(pi, "PreToolUse", "Bash", { ...buildClaudeInputBase(ctx, "PreToolUse"), tool_name: "Bash", tool_input: { command: event.command }, tool_use_id: `user-bash-${Date.now()}` }, ctx);
    for (const result of results) {
      if (result.code === 2) return blocked(result.stderr.trim() || "Blocked by Claude PreToolUse hook");
      const specific = hookSpecificOutput(result, "PreToolUse");
      if (specific?.permissionDecision === "deny") return blocked(specific.permissionDecisionReason || "Denied by Claude PreToolUse hook");
      if (specific?.permissionDecision === "ask" && (!ctx.hasUI || !await ctx.ui.confirm("Claude hook confirmation", specific.permissionDecisionReason || "Allow bash command?"))) return blocked(ctx.hasUI ? "Blocked by Claude ask hook" : `${specific.permissionDecisionReason || "Blocked by Claude ask hook"} (no UI available)`);
    }
    const local = createLocalBashOperations();
    const preamble = buildShellPreamble2(state);
    return { operations: { exec(command, cwd, options) {
      return local.exec(preamble.trim() ? `${preamble}
${command}` : command, cwd, options);
    } } };
  };
}
function blocked(output) {
  return { result: { output, exitCode: 1, cancelled: false, truncated: false } };
}
function buildShellPreamble2(state) {
  const exports = Object.entries(state.mergedEnv).map(([key, value]) => `export ${key}=${JSON.stringify(value)}`);
  if (state.envFilePath) exports.push(`[ -f ${JSON.stringify(state.envFilePath)} ] && . ${JSON.stringify(state.envFilePath)}`);
  return exports.join("\n");
}

// src/index.ts
function index_default(pi) {
  pi.on("session_start", createSessionStartHandler(pi));
  pi.on("input", createInputHandler(pi));
  pi.on("before_agent_start", handleBeforeAgentStart);
  pi.on("context", handleContext);
  pi.on("tool_call", createToolCallHandler(pi));
  pi.on("user_bash", createUserBashHandler(pi));
  pi.on("tool_result", createToolResultHandler(pi));
  pi.on("agent_end", createAgentEndHandler(pi));
  pi.on("session_before_compact", createSessionBeforeCompactHandler(pi));
  pi.on("session_compact", createSessionCompactHandler(pi));
  pi.on("session_shutdown", createSessionShutdownHandler(pi));
  pi.registerCommand("claude-bridge", createClaudeBridgeCommand());
  pi.registerCommand("claude-bridge-trust-hooks", createTrustHooksCommand());
  pi.registerCommand("claude-bridge-untrust-hooks", createUntrustHooksCommand());
}
export {
  index_default as default
};
