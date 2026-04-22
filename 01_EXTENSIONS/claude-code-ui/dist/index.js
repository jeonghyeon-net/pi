// src/bash-tool.ts
import { defineTool, createBashToolDefinition } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";

// src/tool-utils.ts
function toolPrefix(theme, label) {
  return `${theme.fg("accent", "\u23FA")} ${theme.fg("toolTitle", theme.bold(label))}`;
}
function inlineSuffix(theme, text) {
  return text ? `${theme.fg("dim", " \xB7 ")}${text}` : "";
}
function branchBlock(theme, text) {
  const [first = "", ...rest] = text.split("\n");
  return [`${theme.fg("dim", "  \u2514 ")}${first}`, ...rest.map((line) => `${theme.fg("dim", "    ")}${line}`)].join("\n");
}
function summarizeTextPreview(theme, text, maxLines) {
  const lines = text.split("\n");
  const preview = lines.slice(0, maxLines).map((line) => theme.fg("toolOutput", line));
  if (lines.length > maxLines) preview.push(theme.fg("dim", `\u2026 ${lines.length - maxLines} more lines`));
  return preview.join("\n");
}

// src/bash-tool.ts
function setSummary(context, summary) {
  if (context.state.summary === summary) return;
  context.state.summary = summary;
  context.invalidate();
}
function createClaudeBashTool(cwd) {
  const base = createBashToolDefinition(cwd);
  return defineTool({
    ...base,
    renderShell: "self",
    renderCall(args, theme, context) {
      const command = args.command.length > 88 ? `${args.command.slice(0, 85)}\u2026` : args.command;
      const text = context.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0);
      text.setText(`${toolPrefix(theme, "Bash")} ${theme.fg("muted", command)}${inlineSuffix(theme, context.state.summary)}`);
      return text;
    },
    renderResult(result, { expanded, isPartial }, theme, context) {
      const output = result.content[0]?.type === "text" ? result.content[0].text : "";
      const exitCode = output.match(/exit code: (\d+)/)?.[1];
      const status = isPartial ? theme.fg("warning", "running\u2026") : exitCode && exitCode !== "0" ? theme.fg("error", `exit ${exitCode}`) : theme.fg("success", "done");
      const summary = `${status}${theme.fg("dim", ` \xB7 ${output.split("\n").filter((line) => line.trim()).length} lines`)}${result.details?.truncation?.truncated ? theme.fg("dim", " \xB7 truncated") : ""}`;
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

// src/ansi.ts
var ANSI_RE = /\x1b\[[0-9;]*m/g;
var OSC_RE = /\x1b\][\s\S]*?(?:\u0007|\x1b\\)/g;
function stripAnsi(text) {
  return text.replace(OSC_RE, "").replace(ANSI_RE, "");
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
    return shouldHide && !hasText && !lines.length ? [] : lines;
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
import { truncateToWidth as truncateToWidth2, visibleWidth as visibleWidth2 } from "@mariozechner/pi-tui";

// src/header.ts
import * as path from "node:path";
function getProjectName(ctx) {
  return path.basename(ctx.cwd) || ctx.cwd;
}

// src/footer.ts
function renderContextBadge(theme, percent) {
  const rounded = percent == null ? "--" : `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
  return theme.bg("selectedBg", theme.fg("muted", ` context ${rounded} `));
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
var WORKING_INDICATOR = {
  frames: []
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
  ctx.ui.setHiddenThinkingLabel("");
  ctx.ui.setTitle(`Claude Code \xB7 ${getProjectName(ctx)}`);
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
function isDefaultWorkingLine(loader, lines) {
  const text = stripAnsi(lines.join("\n")).trim();
  return !loader.frames?.length && /^Working\.\.\.(?: \(.*\))?$/.test(text);
}
function patchLoaderPrototype(prototype) {
  if (!prototype || prototype.__claudeCodeUiPatched) return false;
  const render = prototype.render;
  prototype.render = function renderPatched(width) {
    const lines = trim2(render.call(this, width));
    return !lines.length || isDefaultWorkingLine(this, lines) ? [] : lines;
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
var activeCtx;
var activeTool;
var hasVisibleOutput = false;
var startedAt = 0;
var timer;
function toolLabel(toolName) {
  return { bash: "Running bash", read: "Reading file", write: "Writing file", edit: "Editing file" }[toolName] ?? `Running ${toolName}`;
}
function renderWorkingLine() {
  activeCtx?.ui.setWorkingIndicator(WORKING_INDICATOR);
  if (!activeTool || hasVisibleOutput) {
    activeCtx?.ui.setWorkingMessage("");
    return;
  }
  activeCtx?.ui.setWorkingMessage(formatWorkingLine([toolLabel(activeTool), formatElapsed(Date.now() - startedAt)]));
}
function resetWorkingLine(ctx) {
  if (timer) clearInterval(timer);
  timer = void 0;
  startedAt = 0;
  activeTool = void 0;
  hasVisibleOutput = false;
  (activeCtx ?? ctx)?.ui.setWorkingIndicator(WORKING_INDICATOR);
  (activeCtx ?? ctx)?.ui.setWorkingMessage("");
  activeCtx = void 0;
}
function onAgentStart(_event, ctx) {
  if (!ctx.hasUI) return;
  resetWorkingLine();
  activeCtx = ctx;
  startedAt = Date.now();
  renderWorkingLine();
  timer = setInterval(renderWorkingLine, 1e3);
}
function onToolExecutionStart(event) {
  if (!activeCtx) return;
  activeTool = event.toolName;
  renderWorkingLine();
}
function onToolExecutionEnd(_event) {
  if (!activeCtx) return;
  activeTool = void 0;
  renderWorkingLine();
}
function onMessageUpdate(event) {
  if (!activeCtx) return;
  if (event.assistantMessageEvent.type !== "thinking_start" && event.assistantMessageEvent.type !== "thinking_end") {
    hasVisibleOutput = true;
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
import { Container as Container4, Text as Text4 } from "@mariozechner/pi-tui";
function setSummary4(context, summary) {
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
      const text = context.lastComponent instanceof Text4 ? context.lastComponent : new Text4("", 0, 0);
      text.setText(`${toolPrefix(theme, "Write")} ${theme.fg("muted", args.path)}${suffix}${inlineSuffix(theme, context.state.summary)}`);
      return text;
    },
    renderResult(result, { isPartial }, theme, context) {
      const content = result.content[0];
      const summary = isPartial ? theme.fg("warning", "writing\u2026") : content?.type === "text" && content.text.startsWith("Error") ? theme.fg("error", content.text.split("\n")[0]) : theme.fg("success", "written");
      setSummary4(context, summary);
      return context.lastComponent instanceof Container4 ? context.lastComponent : new Container4();
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
