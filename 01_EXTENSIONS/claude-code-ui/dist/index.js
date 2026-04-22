// src/bash-tool.ts
import { defineTool, createBashToolDefinition } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";

// src/ansi.ts
var ANSI_RESET_BG = "\x1B[49m";
var ANSI_RE = /\x1b\[[0-9;]*m/g;
var OSC_RE = /\x1b\][\s\S]*?(?:\u0007|\x1b\\)/g;
function colorizeBgRgb(text, rgb) {
  const [r, g, b] = rgb;
  return `\x1B[48;2;${r};${g};${b}m${text}${ANSI_RESET_BG}`;
}
function stripAnsi(text) {
  return text.replace(OSC_RE, "").replace(ANSI_RE, "");
}

// src/tool-utils.ts
var META_LINE = /^(prompt|timestamp|frames|model):/i;
var TOOLISH_LINE = /^(fetch|get_|web_|code_|search|read|write|edit|bash|list|describe|connect|status)\b/i;
function clip(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}\u2026` : text;
}
function summarizeActionArgs(record, max) {
  const action = typeof record.action === "string" ? record.action : "";
  if (!action) return "";
  const tool = typeof record.tool === "string" ? toolLabel(record.tool) : "";
  const server = typeof record.server === "string" ? record.server : "";
  const query = typeof record.query === "string" ? `"${record.query}"` : "";
  const parts = [action === "call" && tool ? tool : action];
  if (action !== "call" && tool) parts.push(tool);
  if (server) parts.push(server);
  else if (query) parts.push(query);
  return clip(parts.join(" \xB7 "), max);
}
function cleanPreviewLine(line) {
  const text = stripAnsi(line).trim().replace(/\s+/g, " ");
  if (!text || text === "---" || text.startsWith("Use get_search_content(")) return "";
  if (META_LINE.test(text)) return "";
  const heading = text.match(/^\*\*(.+)\*\*$/)?.[1];
  const search = text.match(/^search \((.+)\)$/i)?.[1];
  return search ? `search \xB7 ${search}` : heading ?? text;
}
function shouldMergePreviewLine(line, next) {
  return !!next && !line.includes(" \xB7 ") && !TOOLISH_LINE.test(next) && line.length <= 24 && !/[.!?…:]$/.test(line);
}
function toolPrefix(theme, label) {
  return `${theme.fg("accent", "\u23FA")} ${theme.fg("toolTitle", theme.bold(label))}`;
}
function inlineSuffix(theme, text) {
  return text ? `${theme.fg("dim", " \xB7 ")}${text}` : "";
}
function toolLabel(name) {
  if (name === "mcp") return "MCP";
  return name.split(/[-_]/).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");
}
function summarizeArgs(args, max = 72) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return "";
  const record = args;
  const action = summarizeActionArgs(record, max);
  if (action) return action;
  const keys = ["tool", "server", "query", "path", "taskId", "agent_id", "subject", "url", "command"];
  const parts = keys.map((key) => record[key]).filter((value) => typeof value === "string" || typeof value === "number").slice(0, 2).map(String);
  if (!parts.length) {
    for (const [key, value] of Object.entries(record)) if ((typeof value === "string" || typeof value === "number" || typeof value === "boolean") && parts.push(`${key}=${value}`) >= 2) break;
  }
  return clip(parts.join(" \xB7 "), max);
}
function branchBlock(theme, text) {
  const [first = "", ...rest] = text.split("\n");
  return [`${theme.fg("dim", "\u2514 ")}${first}`, ...rest.map((line) => `${theme.fg("dim", "  ")}${line}`)].join("\n");
}
function compactPreviewLines(text, maxLines, maxWidth = 88) {
  const raw = text.split("\n").map(cleanPreviewLine).filter(Boolean);
  const lines = [];
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i];
    if (line === lines[lines.length - 1]) continue;
    const next = raw[i + 1];
    if (shouldMergePreviewLine(line, next)) {
      lines.push(clip(`${line} \u2014 ${next}`, maxWidth));
      i++;
      continue;
    }
    lines.push(clip(line, maxWidth));
  }
  if (lines.length <= maxLines) return lines;
  return [...lines.slice(0, maxLines - 1), clip(`\u2026 ${lines.length - maxLines + 1} more lines`, maxWidth)];
}
function summarizeTextPreview(theme, text, maxLines) {
  return compactPreviewLines(text, maxLines).map((line) => theme.fg("toolOutput", line)).join("\n");
}

// src/bash-tool.ts
function setSummary(context, summary) {
  if (context.state.summary === summary) return;
  context.state.summary = summary;
  context.invalidate();
}
function summarizeCommand(command, max = 88) {
  const lines = command.split("\n").map((line) => line.trim()).filter(Boolean);
  const first = (lines[0] ?? "").replace(/\s+/g, " ");
  const clipped = first.length > max ? `${first.slice(0, max - 1)}\u2026` : first;
  return {
    preview: clipped,
    lineCount: lines.length,
    multiline: lines.length > 1
  };
}
function createClaudeBashTool(cwd) {
  const base = createBashToolDefinition(cwd);
  return defineTool({
    ...base,
    renderShell: "self",
    renderCall(args, theme, context) {
      const command = summarizeCommand(args.command);
      const text = context.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0);
      const meta = command.multiline && !context.state.summary ? theme.fg("dim", ` \xB7 ${command.lineCount} lines`) : "";
      text.setText(`${toolPrefix(theme, "Bash")} ${theme.fg("muted", command.preview)}${meta}${inlineSuffix(theme, context.state.summary)}`);
      return text;
    },
    renderResult(result, { expanded, isPartial }, theme, context) {
      const output = result.content[0]?.type === "text" ? result.content[0].text : "";
      const exitCode = output.match(/exit code: (\d+)/)?.[1];
      const status2 = isPartial ? theme.fg("warning", "running\u2026") : exitCode && exitCode !== "0" ? theme.fg("error", `exit ${exitCode}`) : theme.fg("success", "done");
      const summary = `${status2}${theme.fg("dim", ` \xB7 ${output.split("\n").filter((line) => line.trim()).length} lines`)}${result.details?.truncation?.truncated ? theme.fg("dim", " \xB7 truncated") : ""}`;
      setSummary(context, summary);
      if (!expanded || !output.trim()) return context.lastComponent instanceof Container ? context.lastComponent : new Container();
      return new Text(branchBlock(theme, summarizeTextPreview(theme, output, 18)), 0, 0);
    }
  });
}

// src/edit-tool.ts
import { defineTool as defineTool2, createEditToolDefinition } from "@mariozechner/pi-coding-agent";
import { Container as Container2, Text as Text2 } from "@mariozechner/pi-tui";
function setSummary2(context, summary) {
  if (context.state.summary === summary) return;
  context.state.summary = summary;
  context.invalidate();
}
function renderDiffLine(theme, line) {
  if (line.startsWith("+") && !line.startsWith("+++")) return theme.fg("toolDiffAdded", line);
  if (line.startsWith("-") && !line.startsWith("---")) return theme.fg("toolDiffRemoved", line);
  return theme.fg("toolDiffContext", line);
}
function createClaudeEditTool(cwd) {
  const base = createEditToolDefinition(cwd);
  return defineTool2({
    ...base,
    renderShell: "self",
    renderCall(args, theme, context) {
      const text = context.lastComponent instanceof Text2 ? context.lastComponent : new Text2("", 0, 0);
      text.setText(`${toolPrefix(theme, "Edit")} ${theme.fg("muted", args.path)}${inlineSuffix(theme, context.state.summary)}`);
      return text;
    },
    renderResult(result, { expanded, isPartial }, theme, context) {
      const content = result.content[0];
      const diffLines = result.details?.diff?.split("\n") ?? [];
      const additions = diffLines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
      const removals = diffLines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
      const summary = isPartial ? theme.fg("warning", "editing\u2026") : content?.type === "text" && content.text.startsWith("Error") ? theme.fg("error", content.text.split("\n")[0]) : result.details?.diff ? `${theme.fg("success", `+${additions}`)}${theme.fg("dim", " \xB7 ")}${theme.fg("error", `-${removals}`)}` : theme.fg("success", "applied");
      setSummary2(context, summary);
      if (!expanded || !result.details?.diff) return context.lastComponent instanceof Container2 ? context.lastComponent : new Container2();
      const preview = diffLines.slice(0, 24).map((line) => renderDiffLine(theme, line));
      if (diffLines.length > 24) preview.push(theme.fg("dim", `\u2026 ${diffLines.length - 24} more diff lines`));
      return new Text2(branchBlock(theme, preview.join("\n")), 0, 0);
    }
  });
}

// src/read-tool.ts
import { defineTool as defineTool3, createReadToolDefinition } from "@mariozechner/pi-coding-agent";
import { Container as Container3, Text as Text3 } from "@mariozechner/pi-tui";
function setSummary3(context, summary) {
  if (context.state.summary === summary) return;
  context.state.summary = summary;
  context.invalidate();
}
function createClaudeReadTool(cwd) {
  const base = createReadToolDefinition(cwd);
  return defineTool3({
    ...base,
    renderShell: "self",
    renderCall(args, theme, context) {
      const text = context.lastComponent instanceof Text3 ? context.lastComponent : new Text3("", 0, 0);
      text.setText(`${toolPrefix(theme, "Read")} ${theme.fg("muted", args.path)}${inlineSuffix(theme, context.state.summary)}`);
      return text;
    },
    renderResult(result, { expanded, isPartial }, theme, context) {
      const content = result.content[0];
      const summary = isPartial ? theme.fg("warning", "reading\u2026") : content?.type !== "text" ? theme.fg("success", "loaded") : `${theme.fg("success", `${content.text.split("\n").length} lines`)}${result.details?.truncation?.truncated ? theme.fg("dim", ` \xB7 truncated from ${result.details.truncation.totalLines}`) : ""}`;
      setSummary3(context, summary);
      if (!expanded || content?.type !== "text") return context.lastComponent instanceof Container3 ? context.lastComponent : new Container3();
      return new Text3(branchBlock(theme, summarizeTextPreview(theme, content.text, 14)), 0, 0);
    }
  });
}

// src/internal-module.ts
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
function resolveFromModule(mainHref, relativePath) {
  return pathToFileURL(join(dirname(fileURLToPath(mainHref)), relativePath)).href;
}

// src/assistant-message-patch.ts
function trim(lines) {
  while (lines.length && !stripAnsi(lines[0] ?? "").trim()) lines.shift();
  while (lines.length && !stripAnsi(lines.at(-1) ?? "").trim()) lines.pop();
  return lines;
}
function hasVisibleText(message) {
  if (!message) return false;
  for (const content of message.content) if (content.type === "text" && content.text?.trim()) return true;
  return false;
}
function hasHiddenThinking(message) {
  if (!message) return false;
  for (const content of message.content) if (content.type === "thinking" && content.thinking?.trim()) return true;
  return false;
}
function patchAssistantMessagePrototype(prototype) {
  if (!prototype || prototype.__claudeCodeUiPatched) return false;
  const render = prototype.render;
  prototype.render = function renderPatched(width) {
    const lines = trim(render.call(this, width));
    const hiddenLabel = this.hiddenThinkingLabel?.trim();
    const hasText = hasVisibleText(this.lastMessage);
    const shouldHide = this.hideThinkingBlock && !hiddenLabel && hasHiddenThinking(this.lastMessage);
    if (shouldHide && !hasText && !lines.length) return [];
    return hasText && lines.length ? ["", ...lines] : lines;
  };
  prototype.__claudeCodeUiPatched = true;
  return true;
}
async function loadAssistantMessageModule() {
  const main = import.meta.resolve("@mariozechner/pi-coding-agent");
  return import(resolveFromModule(main, "modes/interactive/components/assistant-message.js"));
}
async function applyAssistantMessagePatch(load = loadAssistantMessageModule) {
  const module = await load();
  patchAssistantMessagePrototype(module.AssistantMessageComponent?.prototype);
}

// src/editor.ts
import { CustomEditor } from "@mariozechner/pi-coding-agent";

// src/rules.ts
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
function buildPromptFrame(width, label, leftCorner, rightCorner, borderColor) {
  const left = borderColor(leftCorner);
  const right = borderColor(rightCorner);
  const insideWidth = Math.max(0, width - visibleWidth(left) - visibleWidth(right));
  const labelPart = label ? ` ${label} ` : "";
  const lead = insideWidth > 0 ? borderColor("\u2500") : "";
  const fillWidth = Math.max(0, insideWidth - visibleWidth(lead) - visibleWidth(labelPart));
  return truncateToWidth(left + lead + labelPart + borderColor("\u2500".repeat(fillWidth)) + right, width, "");
}
function frameBodyLine(line, width, borderColor) {
  const innerWidth = Math.max(0, width - 2);
  const content = truncateToWidth(line, innerWidth, "");
  const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(content)));
  return borderColor("\u2502") + content + padding + borderColor("\u2502");
}
function findBottomRuleIndex(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const raw = stripAnsi(lines[i]);
    if (/^─+$/.test(raw) || /^─── ↓ \d+ more /.test(raw)) return i;
  }
  return -1;
}

// src/editor.ts
var ClaudeCodeEditor = class extends CustomEditor {
  constructor(tui, theme, keybindings) {
    super(tui, theme, keybindings, { paddingX: 2 });
  }
  render(width) {
    const lines = super.render(width);
    if (lines.length === 0) return lines;
    const topFramed = this.isTopRule(lines[0]);
    const bottomIndex = findBottomRuleIndex(lines);
    const bottomFramed = bottomIndex >= 0 && this.isBottomRule(lines[bottomIndex]);
    if (topFramed) lines[0] = buildPromptFrame(width, "", "\u250C", "\u2510", this.borderColor);
    if (topFramed && bottomFramed) {
      for (let i = 1; i < bottomIndex; i++) lines[i] = frameBodyLine(lines[i], width, this.borderColor);
    }
    if (bottomFramed) lines[bottomIndex] = buildPromptFrame(width, "", "\u2514", "\u2518", this.borderColor);
    return lines;
  }
  isTopRule(line) {
    const raw = stripAnsi(line);
    return /^─+$/.test(raw) || /^─── ↑ \d+ more /.test(raw);
  }
  isBottomRule(line) {
    const raw = stripAnsi(line);
    return /^─+$/.test(raw) || /^─── ↓ \d+ more /.test(raw);
  }
};

// src/footer.ts
import { truncateToWidth as truncateToWidth3, visibleWidth as visibleWidth4 } from "@mariozechner/pi-tui";

// src/header.ts
import { VERSION } from "@mariozechner/pi-coding-agent";
import { visibleWidth as visibleWidth3 } from "@mariozechner/pi-tui";

// src/header-mascot.ts
function getPiMascot(theme) {
  const blue = (text) => theme.fg("accent", text);
  const white = (text) => theme.fg("text", text);
  const dark = (text) => theme.fg("dim", text);
  const eye = `${white("\u2588")}${dark("\u258C")}`;
  const bar = blue("\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588");
  const legs = blue("\u2588\u2588") + "    " + blue("\u2588\u2588");
  return [
    "",
    `     ${eye}  ${eye}`,
    `  ${bar}`,
    `     ${legs}`,
    `     ${legs}`,
    `     ${legs}`,
    ""
  ];
}

// src/header-utils.ts
import * as os from "node:os";
import * as path from "node:path";
function getProjectName(ctx) {
  return path.basename(ctx.cwd) || ctx.cwd;
}
function getDisplayName() {
  const raw = process.env.PI_DISPLAY_NAME ?? process.env.CLAUDE_CODE_USER ?? process.env.USER ?? process.env.LOGNAME ?? "there";
  return raw.trim().replace(/[._-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) || "there";
}
function isHomeDirectory(cwd) {
  return path.resolve(cwd) === path.resolve(os.homedir());
}
function getEntryCount(ctx) {
  try {
    return ctx.sessionManager.getEntries().length;
  } catch {
    return 0;
  }
}
function shortenPath(value, maxWidth) {
  const home = os.homedir();
  const normalized = value.startsWith(home) ? `~${value.slice(home.length)}` : value;
  return shortenMiddle(normalized, maxWidth);
}
function shortenMiddle(value, maxWidth) {
  if (value.length <= maxWidth) return value;
  if (maxWidth <= 1) return "\u2026";
  const head = Math.max(1, Math.ceil((maxWidth - 1) * 0.6));
  const tail = Math.max(0, maxWidth - head - 1);
  const suffix = value.slice(Math.max(0, value.length - tail));
  return `${value.slice(0, head)}\u2026${suffix}`;
}

// src/header-content.ts
function buildLeftColumn(ctx, theme) {
  const projectName = getProjectName(ctx);
  const modelLabel = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "no-model";
  const entryCount = getEntryCount(ctx);
  const sessionLabel = entryCount === 0 ? "No recent activity yet" : `${entryCount} ${entryCount === 1 ? "entry" : "entries"} loaded in this session`;
  const workspaceLabel = isHomeDirectory(ctx.cwd) ? theme.fg("warning", "Launched from your home directory. A project folder works best.") : theme.fg("success", "Project directory detected and ready for work.");
  return [
    ...getPiMascot(theme),
    theme.bold(`Welcome back ${getDisplayName()}!`),
    formatDetail(theme, "Project", projectName),
    formatDetail(theme, "Directory", shortenPath(ctx.cwd, 34)),
    formatDetail(theme, "Model", shortenMiddle(modelLabel, 34)),
    formatDetail(theme, "Session", sessionLabel),
    workspaceLabel
  ];
}
function buildRightColumn(ctx, theme) {
  const projectNote = isHomeDirectory(ctx.cwd) ? theme.fg("muted", "Tip: launch pi inside a repository for stronger file and git context.") : theme.fg("muted", "Workspace note: pi can now reason over the current repository immediately.");
  return [
    theme.bold(theme.fg("accent", "Tips for getting started")),
    bullet(theme, "Ask pi to inspect the codebase before making edits."),
    bullet(theme, "Use TaskCreate for multi-step work and track progress."),
    bullet(theme, "Run /model to switch models and /reload to refresh extensions."),
    bullet(theme, "Ask for a plan first when the change touches several files."),
    "",
    theme.bold(theme.fg("accent", "Workspace status")),
    projectNote
  ];
}
function bullet(theme, text) {
  return `${theme.fg("accent", "\u2022")} ${text}`;
}
function formatDetail(theme, label, value) {
  return `${theme.fg("muted", `${label.padEnd(9, " ")}`)} ${value}`;
}

// src/header-frame.ts
import { truncateToWidth as truncateToWidth2, visibleWidth as visibleWidth2 } from "@mariozechner/pi-tui";
function renderTopBorder(theme, width, title) {
  if (width <= 1) return theme.fg("borderAccent", "\u256D");
  if (width <= 4) return theme.fg("borderAccent", truncateToWidth2("\u256D\u2500\u2500\u256E", width, ""));
  const prefix = "\u256D\u2500\u2500 ";
  const suffix = "\u256E";
  const titleWidth = Math.max(0, width - visibleWidth2(prefix) - visibleWidth2(suffix) - 1);
  const clipped = truncateToWidth2(title, titleWidth, "");
  const fillWidth = Math.max(0, width - visibleWidth2(prefix) - visibleWidth2(clipped) - visibleWidth2(suffix) - 1);
  return `${theme.fg("borderAccent", prefix)}${theme.bold(theme.fg("accent", clipped))}${theme.fg("borderAccent", ` ${"\u2500".repeat(fillWidth)}${suffix}`)}`;
}
function renderBottomBorder(theme, width) {
  if (width <= 1) return theme.fg("borderAccent", "\u256F");
  return theme.fg("borderAccent", `\u2570${"\u2500".repeat(Math.max(0, width - 2))}\u256F`);
}
function renderFrameLine(theme, width, content) {
  if (width <= 1) return theme.fg("borderAccent", "\u2502");
  if (width <= 3) return theme.fg("borderAccent", truncateToWidth2("\u2502 \u2502", width, ""));
  const innerWidth = Math.max(0, width - 4);
  return `${theme.fg("borderAccent", "\u2502")} ${fitText(content, innerWidth, "")} ${theme.fg("borderAccent", "\u2502")}`;
}
function fitText(text, width, ellipsis = "\u2026") {
  if (width <= 0) return "";
  const clipped = truncateToWidth2(text, width, ellipsis);
  return clipped + " ".repeat(Math.max(0, width - visibleWidth2(clipped)));
}

// src/header.ts
var MIN_TWO_COLUMN_WIDTH = 96;
function createPiWelcomeHeader(ctx) {
  return (_tui, theme) => ({
    invalidate() {
    },
    render(width) {
      const safeWidth = Math.max(1, width);
      const innerWidth = Math.max(1, safeWidth - 4);
      const leftLines = buildLeftColumn(ctx, theme);
      const rightLines = buildRightColumn(ctx, theme);
      const lines = [renderTopBorder(theme, safeWidth, `Pi v${VERSION}`), renderFrameLine(theme, safeWidth, "")];
      const wide = safeWidth >= MIN_TWO_COLUMN_WIDTH;
      for (const row of wide ? renderWideRows(theme, innerWidth, leftLines, rightLines) : renderStackedRows(theme, leftLines, rightLines)) {
        lines.push(renderFrameLine(theme, safeWidth, row));
      }
      lines.push(renderFrameLine(theme, safeWidth, ""));
      lines.push(renderBottomBorder(theme, safeWidth));
      return lines;
    }
  });
}
function renderWideRows(theme, innerWidth, leftLines, rightLines) {
  const divider = ` ${theme.fg("borderMuted", "\u2502")} `;
  const minRightWidth = 36;
  const maxLeftWidth = Math.max(24, innerWidth - visibleWidth3(divider) - minRightWidth);
  const desiredLeftWidth = Math.max(24, ...leftLines.map((line) => visibleWidth3(line)));
  const leftWidth = Math.min(maxLeftWidth, desiredLeftWidth);
  const rightWidth = Math.max(24, innerWidth - visibleWidth3(divider) - leftWidth);
  const totalRows = Math.max(leftLines.length, rightLines.length);
  const paddedLeft = padLines(leftLines, totalRows);
  const paddedRight = padLines(rightLines, totalRows);
  return paddedLeft.map((line, index) => `${fitText(line, leftWidth)}${divider}${fitText(paddedRight[index], rightWidth)}`);
}
function padLines(lines, totalRows) {
  return [...lines, ...Array.from({ length: Math.max(0, totalRows - lines.length) }, () => "")];
}
function renderStackedRows(theme, leftLines, rightLines) {
  return [...leftLines, "", theme.bold(theme.fg("accent", "Tips for getting started")), ...rightLines.slice(1)];
}

// src/footer.ts
var FILL_BG = [215, 119, 87];
function paintBase(theme, fg, text) {
  return theme.bg("selectedBg", theme.fg(fg, text));
}
function paintFill(theme, text) {
  return colorizeBgRgb(theme.fg("text", text), FILL_BG);
}
function clampPercent(percent) {
  if (percent == null) return null;
  return Math.max(0, Math.min(100, Math.round(percent)));
}
function renderContextBadge(theme, percent) {
  const value = clampPercent(percent);
  const label = `context ${value == null ? "--" : `${value}%`}`;
  if (value == null || value <= 0) return paintBase(theme, "muted", ` ${label} `);
  if (value >= 100) return paintFill(theme, ` ${label} `);
  const fill = Math.min(label.length - 1, Math.max(1, Math.ceil(label.length * value / 100)));
  return [paintBase(theme, "muted", " "), paintFill(theme, label.slice(0, fill)), paintBase(theme, "muted", label.slice(fill)), paintBase(theme, "muted", " ")].join("");
}
function createClaudeFooter(ctx) {
  const projectName = getProjectName(ctx);
  return (tui, theme, footerData) => ({
    dispose: footerData.onBranchChange(() => tui.requestRender()),
    invalidate() {
    },
    render(width) {
      const branch = footerData.getGitBranch();
      const usage = ctx.getContextUsage();
      const leftParts = [theme.fg("text", projectName), branch ? theme.fg("dim", branch) : ""];
      const left = leftParts.filter(Boolean).join(theme.fg("dim", " \xB7 "));
      const rightParts = [theme.fg("muted", ctx.model?.id ?? "no-model"), renderContextBadge(theme, usage?.percent)];
      const right = rightParts.join("  ");
      const gap = Math.max(1, width - visibleWidth4(left) - visibleWidth4(right));
      return [truncateToWidth3(left + " ".repeat(gap) + right, width, "")];
    }
  });
}

// src/theme.ts
var THEME_NAME = "claude-code-dark";
function applyClaudeTheme(ctx) {
  const result = ctx.ui.setTheme(THEME_NAME);
  return {
    themeName: THEME_NAME,
    success: result.success,
    error: result.error
  };
}

// src/chrome.ts
function applyClaudeChrome(ctx) {
  const themeResult = applyClaudeTheme(ctx);
  ctx.ui.setHeader(createPiWelcomeHeader(ctx));
  ctx.ui.setFooter(createClaudeFooter(ctx));
  ctx.ui.setWidget("claude-code-ui-prompt", void 0);
  ctx.ui.setEditorComponent((tui, theme, keybindings) => new ClaudeCodeEditor(tui, theme, keybindings));
  ctx.ui.setHiddenThinkingLabel("");
  ctx.ui.setTitle(`\u03C0 \xB7 ${getProjectName(ctx)}`);
  if (!themeResult.success) {
    ctx.ui.notify(
      `Claude UI applied, but theme switch failed: ${themeResult.error ?? "unknown error"}`,
      "warning"
    );
  }
}

// src/loader-patch.ts
function trim2(lines) {
  while (lines.length && !stripAnsi(lines[0] ?? "").trim()) lines.shift();
  while (lines.length && !stripAnsi(lines.at(-1) ?? "").trim()) lines.pop();
  return lines;
}
function isDefaultWorkingLine(lines) {
  const text = stripAnsi(lines.join("\n")).trim().replace(/^[^\p{L}\p{N}]+/u, "").trimStart();
  return /^Working\.\.\.(?: \(.*\))?$/.test(text);
}
function patchLoaderPrototype(prototype) {
  if (!prototype || prototype.__claudeCodeUiPatched) return false;
  const render = prototype.render;
  prototype.render = function renderPatched(width) {
    const lines = trim2(render.call(this, width));
    return !lines.length || isDefaultWorkingLine(lines) ? [] : ["", ...lines];
  };
  prototype.__claudeCodeUiPatched = true;
  return true;
}
async function loadLoaderModule() {
  const main = import.meta.resolve("@mariozechner/pi-coding-agent");
  return import(resolveFromModule(main, "../node_modules/@mariozechner/pi-tui/dist/components/loader.js"));
}
async function applyLoaderPatch(load = loadLoaderModule) {
  const module = await load();
  patchLoaderPrototype(module.Loader?.prototype);
}

// src/generic-tool-renderer.ts
import { Container as Container4, Text as Text4 } from "@mariozechner/pi-tui";
function summarize(details) {
  if (typeof details?.totalResults === "number") return `${details.totalResults} sources`;
  if (typeof details?.successful === "number" && typeof details?.urlCount === "number") return `${details.successful}/${details.urlCount} URLs`;
  if (typeof details?.totalChars === "number") return `${details.totalChars} chars`;
}
function status(theme, isPartial, isError, details) {
  if (isPartial) return theme.fg("warning", "running\u2026");
  if (isError) return theme.fg("error", "error");
  return theme.fg("success", summarize(details) ?? "done");
}
function outputOf(result) {
  return result.content?.filter((item) => item.type === "text" && !!item.text).map((item) => item.text).join("\n") ?? "";
}
function setSummary4(context, summary) {
  if (context.state.summary === summary) return;
  context.state.summary = summary;
  context.invalidate();
}
function createCallRenderer(name) {
  return (args, theme, context) => {
    const text = context.lastComponent instanceof Text4 ? context.lastComponent : new Text4("", 0, 0);
    const suffix = inlineSuffix(theme, context.state.summary);
    const preview = summarizeArgs(args);
    text.setText(`${toolPrefix(theme, toolLabel(name))}${preview ? ` ${theme.fg("muted", preview)}` : ""}${suffix}`);
    return text;
  };
}
function createResultRenderer(isError) {
  return (result, options, theme, context) => {
    const output = outputOf(result);
    setSummary4(context, `${status(theme, options.isPartial, isError(), result.details)}${result.details?.truncation?.truncated ? theme.fg("dim", " \xB7 truncated") : ""}`);
    if (!options.expanded || !output.trim()) return context.lastComponent instanceof Container4 ? context.lastComponent : new Container4();
    return new Text4(branchBlock(theme, summarizeTextPreview(theme, output, 4)), 0, 0);
  };
}
function renderCallFallback(name, args, summary, theme) {
  const preview = summarizeArgs(args);
  return new Text4(`${toolPrefix(theme, toolLabel(name))}${preview ? ` ${theme.fg("muted", preview)}` : ""}${inlineSuffix(theme, summary)}`, 0, 0);
}
function renderResultFallback(output, isPartial, isError, details, expanded, theme) {
  const summary = `${status(theme, isPartial, isError, details)}${details?.truncation?.truncated ? theme.fg("dim", " \xB7 truncated") : ""}`;
  return { summary, component: !expanded || !output.trim() ? new Container4() : new Text4(branchBlock(theme, summarizeTextPreview(theme, output, 4)), 0, 0) };
}

// src/tool-execution-patch.ts
function isGenericTool(tool) {
  return !!tool.toolDefinition && !tool.builtInToolDefinition;
}
function patchToolExecutionPrototype(prototype, theme) {
  if (!prototype || !theme || prototype.__claudeCodeUiPatched) return false;
  const shell = prototype.getRenderShell;
  const getCallRenderer = prototype.getCallRenderer;
  const getResultRenderer = prototype.getResultRenderer;
  const call = prototype.createCallFallback;
  const result = prototype.createResultFallback;
  prototype.getCallRenderer = function getCallRendererPatched() {
    return isGenericTool(this) ? createCallRenderer(this.toolName) : getCallRenderer.call(this);
  };
  prototype.getResultRenderer = function getResultRendererPatched() {
    return isGenericTool(this) ? createResultRenderer(() => this.result?.isError) : getResultRenderer.call(this);
  };
  prototype.getRenderShell = function getRenderShellPatched() {
    return isGenericTool(this) ? "self" : shell.call(this);
  };
  prototype.createCallFallback = function createCallFallbackPatched() {
    return isGenericTool(this) ? renderCallFallback(this.toolName, this.args, this.rendererState.summary, theme) : call.call(this);
  };
  prototype.createResultFallback = function createResultFallbackPatched() {
    if (!isGenericTool(this)) return result.call(this);
    const rendered = renderResultFallback(this.getTextOutput() ?? "", this.isPartial, this.result?.isError, this.result?.details, this.expanded, theme);
    this.rendererState.summary = rendered.summary;
    return rendered.component;
  };
  prototype.__claudeCodeUiPatched = true;
  return true;
}
async function loadToolExecutionModule() {
  const main = import.meta.resolve("@mariozechner/pi-coding-agent");
  const [toolExecution, interactiveTheme] = await Promise.all([
    import(resolveFromModule(main, "modes/interactive/components/tool-execution.js")),
    import(resolveFromModule(main, "modes/interactive/theme/theme.js"))
  ]);
  return { ToolExecutionComponent: toolExecution.ToolExecutionComponent, theme: interactiveTheme.theme };
}
async function applyToolExecutionPatch(load = loadToolExecutionModule) {
  const module = await load();
  patchToolExecutionPrototype(module.ToolExecutionComponent?.prototype, module.theme);
}

// src/session-start.ts
async function applyRuntimePatch(run) {
  try {
    await run();
  } catch {
  }
}
async function onSessionStart(_event, ctx) {
  if (!ctx.hasUI) return;
  await applyRuntimePatch(applyAssistantMessagePatch);
  await applyRuntimePatch(applyLoaderPatch);
  await applyRuntimePatch(applyToolExecutionPatch);
  applyClaudeChrome(ctx);
}

// src/working-line-format.ts
function formatElapsed(elapsedMs) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1e3));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
}
function formatWorkingLine(parts) {
  return parts.filter(Boolean).join(" \xB7 ");
}

// src/working-line.ts
var idleCtx = { hasPendingMessages: () => false, ui: { setWorkingMessage() {
} } };
var activeCtx = idleCtx;
var activeTool;
var hasVisibleOutput = false;
var startedAt = 0;
var timer;
function toolLabel2(toolName) {
  return { bash: "Running bash", read: "Reading file", write: "Writing file", edit: "Editing file" }[toolName] ?? `Running ${toolName}`;
}
function renderWorkingLine() {
  if (activeTool) return activeCtx.ui.setWorkingMessage(formatWorkingLine([toolLabel2(activeTool), formatElapsed(Date.now() - startedAt)]));
  if (hasVisibleOutput && !activeCtx.hasPendingMessages()) return activeCtx.ui.setWorkingMessage("");
  activeCtx.ui.setWorkingMessage(formatWorkingLine(["Working", formatElapsed(Date.now() - startedAt)]));
}
function beginTurn(ctx) {
  activeCtx = ctx;
  startedAt = Date.now();
  hasVisibleOutput = false;
  activeTool = void 0;
  renderWorkingLine();
  if (!timer) timer = setInterval(renderWorkingLine, 1e3);
}
function resetWorkingLine(ctx = activeCtx) {
  if (timer) clearInterval(timer);
  timer = void 0;
  startedAt = 0;
  activeTool = void 0;
  hasVisibleOutput = false;
  ctx.ui.setWorkingMessage("");
  activeCtx = idleCtx;
}
function onAgentStart(_event, ctx) {
  if (!ctx.hasUI) return;
  resetWorkingLine();
  beginTurn(ctx);
}
function onTurnStart(_event, ctx) {
  if (ctx.hasUI) beginTurn(ctx);
}
function onToolExecutionStart(event) {
  activeTool = event.toolName;
  renderWorkingLine();
}
function onToolExecutionEnd(_event) {
  activeTool = void 0;
  renderWorkingLine();
}
function onMessageUpdate(event) {
  if (event.assistantMessageEvent.type.startsWith("text_")) hasVisibleOutput = true;
  renderWorkingLine();
}
function onAgentEnd(_event, ctx) {
  resetWorkingLine(ctx);
}
function onSessionShutdown(_event, ctx) {
  resetWorkingLine(ctx);
}

// src/write-tool.ts
import { defineTool as defineTool4, createWriteToolDefinition } from "@mariozechner/pi-coding-agent";
import { Container as Container5, Text as Text5 } from "@mariozechner/pi-tui";
function setSummary5(context, summary) {
  if (context.state.summary === summary) return;
  context.state.summary = summary;
  context.invalidate();
}
function createClaudeWriteTool(cwd) {
  const base = createWriteToolDefinition(cwd);
  return defineTool4({
    ...base,
    renderShell: "self",
    renderCall(args, theme, context) {
      const suffix = theme.fg("dim", ` \xB7 ${args.content.split("\n").length} lines`);
      const text = context.lastComponent instanceof Text5 ? context.lastComponent : new Text5("", 0, 0);
      text.setText(`${toolPrefix(theme, "Write")} ${theme.fg("muted", args.path)}${suffix}${inlineSuffix(theme, context.state.summary)}`);
      return text;
    },
    renderResult(result, { isPartial }, theme, context) {
      const content = result.content[0];
      const summary = isPartial ? theme.fg("warning", "writing\u2026") : content?.type === "text" && content.text.startsWith("Error") ? theme.fg("error", content.text.split("\n")[0]) : theme.fg("success", "written");
      setSummary5(context, summary);
      return context.lastComponent instanceof Container5 ? context.lastComponent : new Container5();
    }
  });
}

// src/index.ts
function index_default(_pi) {
  _pi.registerTool(createClaudeReadTool(process.cwd()));
  _pi.registerTool(createClaudeBashTool(process.cwd()));
  _pi.registerTool(createClaudeEditTool(process.cwd()));
  _pi.registerTool(createClaudeWriteTool(process.cwd()));
  _pi.on("session_start", onSessionStart);
  _pi.on("agent_start", onAgentStart);
  _pi.on("turn_start", onTurnStart);
  _pi.on("tool_execution_start", onToolExecutionStart);
  _pi.on("tool_execution_end", onToolExecutionEnd);
  _pi.on("message_update", onMessageUpdate);
  _pi.on("agent_end", onAgentEnd);
  _pi.on("session_shutdown", onSessionShutdown);
}
export {
  index_default as default
};
