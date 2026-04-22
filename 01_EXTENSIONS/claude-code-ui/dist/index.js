// src/bash-tool.ts
import { defineTool, createBashToolDefinition } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

// src/tool-utils.ts
function toolPrefix(theme, label) {
  return `${theme.fg("accent", "\u25CF")} ${theme.fg("toolTitle", theme.bold(label))}`;
}
function summarizeTextPreview(theme, text, maxLines) {
  const lines = text.split("\n");
  const preview = lines.slice(0, maxLines).map((line) => theme.fg("toolOutput", line));
  if (lines.length > maxLines) preview.push(theme.fg("dim", `\u2026 ${lines.length - maxLines} more lines`));
  return preview.join("\n");
}

// src/bash-tool.ts
function createClaudeBashTool(cwd) {
  const base = createBashToolDefinition(cwd);
  return defineTool({
    ...base,
    renderCall(args, theme) {
      const command = args.command.length > 88 ? `${args.command.slice(0, 85)}\u2026` : args.command;
      return new Text(`${toolPrefix(theme, "Bash")} ${theme.fg("muted", command)}`, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "running\u2026"), 0, 0);
      const first = result.content[0];
      const output = first?.type === "text" ? first.text : "";
      const exitCode = output.match(/exit code: (\d+)/)?.[1];
      let text = exitCode && exitCode !== "0" ? theme.fg("error", `exit ${exitCode}`) : theme.fg("success", "done");
      text += theme.fg("dim", ` \xB7 ${output.split("\n").filter((line) => line.trim()).length} lines`);
      if (result.details?.truncation?.truncated) text += theme.fg("dim", " \xB7 truncated");
      if (expanded && output.trim()) text += `
${summarizeTextPreview(theme, output, 18)}`;
      return new Text(text, 0, 0);
    }
  });
}

// src/edit-tool.ts
import { defineTool as defineTool2, createEditToolDefinition } from "@mariozechner/pi-coding-agent";
import { Text as Text2 } from "@mariozechner/pi-tui";
function renderDiffLine(theme, line) {
  if (line.startsWith("+") && !line.startsWith("+++")) return theme.fg("toolDiffAdded", line);
  if (line.startsWith("-") && !line.startsWith("---")) return theme.fg("toolDiffRemoved", line);
  return theme.fg("toolDiffContext", line);
}
function createClaudeEditTool(cwd) {
  const base = createEditToolDefinition(cwd);
  return defineTool2({
    ...base,
    renderCall(args, theme) {
      return new Text2(`${toolPrefix(theme, "Edit")} ${theme.fg("muted", args.path)}`, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text2(theme.fg("warning", "editing\u2026"), 0, 0);
      const content = result.content[0];
      if (content?.type === "text" && content.text.startsWith("Error")) return new Text2(theme.fg("error", content.text.split("\n")[0]), 0, 0);
      if (!result.details?.diff) return new Text2(theme.fg("success", "applied"), 0, 0);
      const diffLines = result.details.diff.split("\n");
      let text = theme.fg("success", `+${diffLines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length}`);
      text += theme.fg("dim", " \xB7 ") + theme.fg("error", `-${diffLines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length}`);
      if (!expanded) return new Text2(text, 0, 0);
      const preview = diffLines.slice(0, 24).map((line) => renderDiffLine(theme, line));
      if (diffLines.length > 24) preview.push(theme.fg("dim", `\u2026 ${diffLines.length - 24} more diff lines`));
      return new Text2(`${text}
${preview.join("\n")}`, 0, 0);
    }
  });
}

// src/read-tool.ts
import { defineTool as defineTool3, createReadToolDefinition } from "@mariozechner/pi-coding-agent";
import { Text as Text3 } from "@mariozechner/pi-tui";
function createClaudeReadTool(cwd) {
  const base = createReadToolDefinition(cwd);
  return defineTool3({
    ...base,
    renderCall(args, theme) {
      return new Text3(`${toolPrefix(theme, "Read")} ${theme.fg("muted", args.path)}`, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text3(theme.fg("warning", "reading\u2026"), 0, 0);
      const content = result.content[0];
      if (content?.type !== "text") return new Text3(theme.fg("success", "loaded"), 0, 0);
      let text = theme.fg("success", `${content.text.split("\n").length} lines`);
      if (result.details?.truncation?.truncated) text += theme.fg("dim", ` \xB7 truncated from ${result.details.truncation.totalLines}`);
      if (expanded) text += `
${summarizeTextPreview(theme, content.text, 14)}`;
      return new Text3(text, 0, 0);
    }
  });
}

// src/editor.ts
import { CustomEditor } from "@mariozechner/pi-coding-agent";

// src/ansi.ts
var ANSI_RESET_FG = "\x1B[39m";
var ANSI_RE = /\x1b\[[0-9;]*m/g;
function colorizeRgb(text, rgb) {
  const [r, g, b] = rgb;
  return `\x1B[38;2;${r};${g};${b}m${text}${ANSI_RESET_FG}`;
}
function stripAnsi(text) {
  return text.replace(ANSI_RE, "");
}

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
import { truncateToWidth as truncateToWidth2, visibleWidth as visibleWidth2 } from "@mariozechner/pi-tui";

// src/header.ts
import * as path from "node:path";
function getProjectName(ctx) {
  return path.basename(ctx.cwd) || ctx.cwd;
}

// src/footer.ts
function getContextTone(percent) {
  if (percent == null) return "muted";
  if (percent < 50) return "success";
  if (percent < 75) return "accent";
  if (percent < 90) return "warning";
  return "error";
}
function renderContextBadge(theme, percent) {
  const rounded = percent == null ? "--" : `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
  return theme.bg("selectedBg", theme.fg(getContextTone(percent), ` context ${rounded} `));
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
      const gap = Math.max(1, width - visibleWidth2(left) - visibleWidth2(right));
      return [truncateToWidth2(left + " ".repeat(gap) + right, width, "")];
    }
  });
}

// src/indicator.ts
var CLAUDE_ORANGE = [215, 119, 87];
var CLAUDE_ORANGE_SOFT = [235, 159, 127];
var CLAUDE_BLUE = [177, 185, 249];
var WORKING_INDICATOR = {
  frames: [
    colorizeRgb("\u273B", CLAUDE_ORANGE),
    colorizeRgb("\u2726", CLAUDE_BLUE),
    colorizeRgb("\u25CF", CLAUDE_ORANGE_SOFT),
    colorizeRgb("\u2726", CLAUDE_BLUE)
  ],
  intervalMs: 110
};

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
  ctx.ui.setHeader(void 0);
  ctx.ui.setFooter(createClaudeFooter(ctx));
  ctx.ui.setWidget("claude-code-ui-prompt", void 0);
  ctx.ui.setEditorComponent((tui, theme, keybindings) => new ClaudeCodeEditor(tui, theme, keybindings));
  ctx.ui.setWorkingIndicator(WORKING_INDICATOR);
  ctx.ui.setHiddenThinkingLabel("thinking");
  ctx.ui.setTitle(`Claude Code \xB7 ${getProjectName(ctx)}`);
  if (!themeResult.success) {
    ctx.ui.notify(
      `Claude UI applied, but theme switch failed: ${themeResult.error ?? "unknown error"}`,
      "warning"
    );
  }
}

// src/session-start.ts
async function onSessionStart(_event, ctx) {
  if (!ctx.hasUI) return;
  applyClaudeChrome(ctx);
}

// src/working-line-format.ts
var PHRASES = ["Thinking", "Reasoning", "Planning", "Working"];
function pickWorkingPhrase(random = Math.random) {
  const index = Math.min(PHRASES.length - 1, Math.floor(random() * PHRASES.length));
  return `${PHRASES[index] ?? "Working"}...`;
}
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
var activeCtx;
var startedAt = 0;
var phrase = "Thinking...";
var suffix;
var thinkingStartedAt;
var thoughtDurationMs;
var timer;
function toolLabel(toolName) {
  return { bash: "running bash", read: "reading file", write: "writing file", edit: "editing file" }[toolName] ?? `running ${toolName}`;
}
function thinkingLabel() {
  if (thinkingStartedAt !== void 0) return "thinking";
  if (thoughtDurationMs !== void 0) return `thought for ${Math.max(1, Math.round(thoughtDurationMs / 1e3))}s`;
}
function renderWorkingLine() {
  activeCtx?.ui.setWorkingMessage(formatWorkingLine([phrase, suffix, formatElapsed(Date.now() - startedAt), thinkingLabel()]));
}
function resetWorkingLine(ctx) {
  if (timer) clearInterval(timer);
  timer = void 0;
  startedAt = 0;
  suffix = void 0;
  thinkingStartedAt = void 0;
  thoughtDurationMs = void 0;
  (activeCtx ?? ctx)?.ui.setWorkingMessage();
  activeCtx = void 0;
}
function onAgentStart(_event, ctx) {
  if (!ctx.hasUI) return;
  resetWorkingLine();
  activeCtx = ctx;
  startedAt = Date.now();
  phrase = pickWorkingPhrase();
  renderWorkingLine();
  timer = setInterval(renderWorkingLine, 1e3);
}
function onToolExecutionStart(event) {
  if (!activeCtx) return;
  suffix = toolLabel(event.toolName);
  renderWorkingLine();
}
function onToolExecutionEnd(_event) {
  if (!activeCtx) return;
  suffix = void 0;
  renderWorkingLine();
}
function onMessageUpdate(event) {
  if (!activeCtx) return;
  if (event.assistantMessageEvent.type === "thinking_start") thinkingStartedAt = Date.now();
  if (event.assistantMessageEvent.type === "thinking_end" && thinkingStartedAt !== void 0) {
    thoughtDurationMs = Date.now() - thinkingStartedAt;
    thinkingStartedAt = void 0;
  }
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
import { Text as Text4 } from "@mariozechner/pi-tui";
function createClaudeWriteTool(cwd) {
  const base = createWriteToolDefinition(cwd);
  return defineTool4({
    ...base,
    renderCall(args, theme) {
      const suffix2 = theme.fg("dim", ` \xB7 ${args.content.split("\n").length} lines`);
      return new Text4(`${toolPrefix(theme, "Write")} ${theme.fg("muted", args.path)}${suffix2}`, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text4(theme.fg("warning", "writing\u2026"), 0, 0);
      const content = result.content[0];
      if (content?.type === "text" && content.text.startsWith("Error")) return new Text4(theme.fg("error", content.text.split("\n")[0]), 0, 0);
      return new Text4(theme.fg("success", "written"), 0, 0);
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
  _pi.on("tool_execution_start", onToolExecutionStart);
  _pi.on("tool_execution_end", onToolExecutionEnd);
  _pi.on("message_update", onMessageUpdate);
  _pi.on("agent_end", onAgentEnd);
  _pi.on("session_shutdown", onSessionShutdown);
}
export {
  index_default as default
};
