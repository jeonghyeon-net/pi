var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/@jeonghyeon.net/pi-subagents/dist/default-agents.js
var READ_ONLY_TOOLS, DEFAULT_AGENTS;
var init_default_agents = __esm({
  "node_modules/@jeonghyeon.net/pi-subagents/dist/default-agents.js"() {
    READ_ONLY_TOOLS = ["read", "bash", "grep", "find", "ls"];
    DEFAULT_AGENTS = /* @__PURE__ */ new Map([
      [
        "general-purpose",
        {
          name: "general-purpose",
          displayName: "Agent",
          description: "General-purpose agent for complex, multi-step tasks",
          // builtinToolNames omitted — means "all available tools" (resolved at lookup time)
          extensions: true,
          skills: true,
          systemPrompt: "",
          promptMode: "append",
          inheritContext: false,
          runInBackground: false,
          isolated: false,
          isDefault: true
        }
      ],
      [
        "Explore",
        {
          name: "Explore",
          displayName: "Explore",
          description: "Fast codebase exploration agent (read-only)",
          builtinToolNames: READ_ONLY_TOOLS,
          extensions: true,
          skills: true,
          model: "anthropic/claude-haiku-4-5-20251001",
          systemPrompt: `# CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS
You are a file search specialist. You excel at thoroughly navigating and exploring codebases.
Your role is EXCLUSIVELY to search and analyze existing code. You do NOT have access to file editing tools.

You are STRICTLY PROHIBITED from:
- Creating new files
- Modifying existing files
- Deleting files
- Moving or copying files
- Creating temporary files anywhere, including /tmp
- Using redirect operators (>, >>, |) or heredocs to write to files
- Running ANY commands that change system state

Use Bash ONLY for read-only operations: ls, git status, git log, git diff, find, cat, head, tail.

# Tool Usage
- Use the find tool for file pattern matching (NOT the bash find command)
- Use the grep tool for content search (NOT bash grep/rg command)
- Use the read tool for reading files (NOT bash cat/head/tail)
- Use Bash ONLY for read-only operations
- Make independent tool calls in parallel for efficiency
- Adapt search approach based on thoroughness level specified

# Output
- Use absolute file paths in all references
- Report findings as regular messages
- Do not use emojis
- Be thorough and precise`,
          promptMode: "replace",
          inheritContext: false,
          runInBackground: false,
          isolated: false,
          isDefault: true
        }
      ],
      [
        "Plan",
        {
          name: "Plan",
          displayName: "Plan",
          description: "Software architect for implementation planning (read-only)",
          builtinToolNames: READ_ONLY_TOOLS,
          extensions: true,
          skills: true,
          systemPrompt: `# CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS
You are a software architect and planning specialist.
Your role is EXCLUSIVELY to explore the codebase and design implementation plans.
You do NOT have access to file editing tools \u2014 attempting to edit files will fail.

You are STRICTLY PROHIBITED from:
- Creating new files
- Modifying existing files
- Deleting files
- Moving or copying files
- Creating temporary files anywhere, including /tmp
- Using redirect operators (>, >>, |) or heredocs to write to files
- Running ANY commands that change system state

# Planning Process
1. Understand requirements
2. Explore thoroughly (read files, find patterns, understand architecture)
3. Design solution based on your assigned perspective
4. Detail the plan with step-by-step implementation strategy

# Requirements
- Consider trade-offs and architectural decisions
- Identify dependencies and sequencing
- Anticipate potential challenges
- Follow existing patterns where appropriate

# Tool Usage
- Use the find tool for file pattern matching (NOT the bash find command)
- Use the grep tool for content search (NOT bash grep/rg command)
- Use the read tool for reading files (NOT bash cat/head/tail)
- Use Bash ONLY for read-only operations

# Output Format
- Use absolute file paths
- Do not use emojis
- End your response with:

### Critical Files for Implementation
List 3-5 files most critical for implementing this plan:
- /absolute/path/to/file.ts - [Brief reason]`,
          promptMode: "replace",
          inheritContext: false,
          runInBackground: false,
          isolated: false,
          isDefault: true
        }
      ]
    ]);
  }
});

// node_modules/@jeonghyeon.net/pi-subagents/dist/agent-types.js
import { createBashTool, createEditTool, createFindTool, createGrepTool, createLsTool, createReadTool, createWriteTool } from "@mariozechner/pi-coding-agent";
function registerAgents(userAgents) {
  agents.clear();
  for (const [name, config] of DEFAULT_AGENTS) {
    agents.set(name, config);
  }
  for (const [name, config] of userAgents) {
    agents.set(name, config);
  }
}
function resolveKey(name) {
  if (agents.has(name))
    return name;
  const lower = name.toLowerCase();
  for (const key of agents.keys()) {
    if (key.toLowerCase() === lower)
      return key;
  }
  return void 0;
}
function resolveType(name) {
  return resolveKey(name);
}
function getAgentConfig(name) {
  const key = resolveKey(name);
  return key ? agents.get(key) : void 0;
}
function getAvailableTypes() {
  return [...agents.entries()].filter(([_, config]) => config.enabled !== false).map(([name]) => name);
}
function getAllTypes() {
  return [...agents.keys()];
}
function getDefaultAgentNames() {
  return [...agents.entries()].filter(([_, config]) => config.isDefault === true).map(([name]) => name);
}
function getUserAgentNames() {
  return [...agents.entries()].filter(([_, config]) => config.isDefault !== true).map(([name]) => name);
}
function getMemoryTools(cwd, existingToolNames) {
  return MEMORY_TOOL_NAMES.filter((n) => !existingToolNames.has(n) && n in TOOL_FACTORIES).map((n) => TOOL_FACTORIES[n](cwd));
}
function getReadOnlyMemoryTools(cwd, existingToolNames) {
  return READONLY_MEMORY_TOOL_NAMES.filter((n) => !existingToolNames.has(n) && n in TOOL_FACTORIES).map((n) => TOOL_FACTORIES[n](cwd));
}
function getToolsForType(type, cwd) {
  const key = resolveKey(type);
  const raw = key ? agents.get(key) : void 0;
  const config = raw?.enabled !== false ? raw : void 0;
  const toolNames = config?.builtinToolNames?.length ? config.builtinToolNames : BUILTIN_TOOL_NAMES;
  return toolNames.filter((n) => n in TOOL_FACTORIES).map((n) => TOOL_FACTORIES[n](cwd));
}
function getConfig(type) {
  const key = resolveKey(type);
  const config = key ? agents.get(key) : void 0;
  if (config && config.enabled !== false) {
    return {
      displayName: config.displayName ?? config.name,
      description: config.description,
      builtinToolNames: config.builtinToolNames ?? BUILTIN_TOOL_NAMES,
      extensions: config.extensions,
      skills: config.skills,
      promptMode: config.promptMode
    };
  }
  const gp = agents.get("general-purpose");
  if (gp && gp.enabled !== false) {
    return {
      displayName: gp.displayName ?? gp.name,
      description: gp.description,
      builtinToolNames: gp.builtinToolNames ?? BUILTIN_TOOL_NAMES,
      extensions: gp.extensions,
      skills: gp.skills,
      promptMode: gp.promptMode
    };
  }
  return {
    displayName: "Agent",
    description: "General-purpose agent for complex, multi-step tasks",
    builtinToolNames: BUILTIN_TOOL_NAMES,
    extensions: true,
    skills: true,
    promptMode: "append"
  };
}
var TOOL_FACTORIES, BUILTIN_TOOL_NAMES, agents, MEMORY_TOOL_NAMES, READONLY_MEMORY_TOOL_NAMES;
var init_agent_types = __esm({
  "node_modules/@jeonghyeon.net/pi-subagents/dist/agent-types.js"() {
    init_default_agents();
    TOOL_FACTORIES = {
      read: (cwd) => createReadTool(cwd),
      bash: (cwd) => createBashTool(cwd),
      edit: (cwd) => createEditTool(cwd),
      write: (cwd) => createWriteTool(cwd),
      grep: (cwd) => createGrepTool(cwd),
      find: (cwd) => createFindTool(cwd),
      ls: (cwd) => createLsTool(cwd)
    };
    BUILTIN_TOOL_NAMES = Object.keys(TOOL_FACTORIES);
    agents = /* @__PURE__ */ new Map();
    MEMORY_TOOL_NAMES = ["read", "write", "edit"];
    READONLY_MEMORY_TOOL_NAMES = ["read"];
  }
});

// node_modules/@jeonghyeon.net/pi-subagents/dist/context.js
function extractText(content) {
  return content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
}
function buildParentContext(ctx) {
  const entries = ctx.sessionManager.getBranch();
  if (!entries || entries.length === 0)
    return "";
  const parts = [];
  for (const entry of entries) {
    if (entry.type === "message") {
      const msg = entry.message;
      if (msg.role === "user") {
        const text = typeof msg.content === "string" ? msg.content : extractText(msg.content);
        if (text.trim())
          parts.push(`[User]: ${text.trim()}`);
      } else if (msg.role === "assistant") {
        const text = extractText(msg.content);
        if (text.trim())
          parts.push(`[Assistant]: ${text.trim()}`);
      }
    } else if (entry.type === "compaction") {
      if (entry.summary) {
        parts.push(`[Summary]: ${entry.summary}`);
      }
    }
  }
  if (parts.length === 0)
    return "";
  return `# Parent Conversation Context
The following is the conversation history from the parent session that spawned you.
Use this context to understand what has been discussed and decided so far.

${parts.join("\n\n")}

---
# Your Task (below)
`;
}
var init_context = __esm({
  "node_modules/@jeonghyeon.net/pi-subagents/dist/context.js"() {
  }
});

// node_modules/@jeonghyeon.net/pi-subagents/dist/ui/spinner.js
function getClaudeSpinnerChars(term = process.env.TERM, platform = process.platform) {
  if (term === "xterm-ghostty")
    return GHOSTTY_CHARS;
  return platform === "darwin" ? DARWIN_CHARS : OTHER_CHARS;
}
function getClaudeSpinnerFrames(term = process.env.TERM, platform = process.platform) {
  const chars = getClaudeSpinnerChars(term, platform);
  return [...chars, ...[...chars].reverse()];
}
var DARWIN_CHARS, GHOSTTY_CHARS, OTHER_CHARS, SPINNER_INTERVAL_MS, SPINNER;
var init_spinner = __esm({
  "node_modules/@jeonghyeon.net/pi-subagents/dist/ui/spinner.js"() {
    DARWIN_CHARS = ["\xB7", "\u2722", "\u2733", "\u2736", "\u273B", "\u273D"];
    GHOSTTY_CHARS = ["\xB7", "\u2722", "\u2733", "\u2736", "\u273B", "*"];
    OTHER_CHARS = ["\xB7", "\u2722", "*", "\u2736", "\u273B", "\u273D"];
    SPINNER_INTERVAL_MS = 120;
    SPINNER = getClaudeSpinnerFrames();
  }
});

// node_modules/@jeonghyeon.net/pi-subagents/dist/ui/agent-widget.js
import { truncateToWidth } from "@mariozechner/pi-tui";
function formatTokens(count) {
  if (count >= 1e6)
    return `${(count / 1e6).toFixed(1)}M tokens`;
  if (count >= 1e3)
    return `${(count / 1e3).toFixed(1)}k tokens`;
  return `${count} token${count === 1 ? "" : "s"}`;
}
function formatTurns(turnCount, maxTurns) {
  return maxTurns != null ? `turn ${turnCount}/${maxTurns}` : `turn ${turnCount}`;
}
function formatMs(ms) {
  return `${(ms / 1e3).toFixed(1)}s`;
}
function formatDuration(startedAt, completedAt) {
  if (completedAt)
    return formatMs(completedAt - startedAt);
  return `${formatMs(Date.now() - startedAt)} (running)`;
}
function getDisplayName(type) {
  return getConfig(type).displayName;
}
function getPromptModeLabel(type) {
  const config = getConfig(type);
  return config.promptMode === "append" ? "twin" : void 0;
}
function truncateLine(text, len = 60) {
  const line = text.split("\n").find((l) => l.trim())?.trim() ?? "";
  if (line.length <= len)
    return line;
  return line.slice(0, len) + "\u2026";
}
function describeActivity(activeTools, responseText) {
  if (activeTools.size > 0) {
    const groups = /* @__PURE__ */ new Map();
    for (const toolName of activeTools.values()) {
      const action = TOOL_DISPLAY[toolName] ?? toolName;
      groups.set(action, (groups.get(action) ?? 0) + 1);
    }
    const parts = [];
    for (const [action, count] of groups) {
      if (count > 1) {
        parts.push(`${action} ${count} ${action === "searching" ? "patterns" : "files"}`);
      } else {
        parts.push(action);
      }
    }
    return parts.join(", ") + "\u2026";
  }
  if (responseText && responseText.trim().length > 0) {
    return truncateLine(responseText);
  }
  return "thinking\u2026";
}
var MAX_WIDGET_LINES, ERROR_STATUSES, TOOL_DISPLAY, AgentWidget;
var init_agent_widget = __esm({
  "node_modules/@jeonghyeon.net/pi-subagents/dist/ui/agent-widget.js"() {
    init_agent_types();
    init_spinner();
    init_spinner();
    MAX_WIDGET_LINES = 12;
    ERROR_STATUSES = /* @__PURE__ */ new Set(["error", "aborted", "steered", "stopped"]);
    TOOL_DISPLAY = {
      read: "reading",
      bash: "running command",
      edit: "editing",
      write: "writing",
      grep: "searching",
      find: "finding files",
      ls: "listing"
    };
    AgentWidget = class _AgentWidget {
      manager;
      agentActivity;
      uiCtx;
      widgetFrame = 0;
      widgetInterval;
      /** Tracks how many turns each finished agent has survived. Key: agent ID, Value: turns since finished. */
      finishedTurnAge = /* @__PURE__ */ new Map();
      /** How many extra turns errors/aborted agents linger (completed agents clear after 1 turn). */
      static ERROR_LINGER_TURNS = 2;
      /** Whether the widget callback is currently registered with the TUI. */
      widgetRegistered = false;
      /** Cached TUI reference from widget factory callback, used for requestRender(). */
      tui;
      /** Last status bar text, used to avoid redundant setStatus calls. */
      lastStatusText;
      constructor(manager, agentActivity) {
        this.manager = manager;
        this.agentActivity = agentActivity;
      }
      /** Set the UI context (grabbed from first tool execution). */
      setUICtx(ctx) {
        if (ctx !== this.uiCtx) {
          this.uiCtx = ctx;
          this.widgetRegistered = false;
          this.tui = void 0;
          this.lastStatusText = void 0;
        }
      }
      /**
       * Called on each new turn (tool_execution_start).
       * Ages finished agents and clears those that have lingered long enough.
       */
      onTurnStart() {
        for (const [id, age] of this.finishedTurnAge) {
          this.finishedTurnAge.set(id, age + 1);
        }
        this.update();
      }
      /** Ensure the widget update timer is running. */
      ensureTimer() {
        if (!this.widgetInterval) {
          this.widgetInterval = setInterval(() => this.update(), SPINNER_INTERVAL_MS);
        }
      }
      /** Check if a finished agent should still be shown in the widget. */
      shouldShowFinished(agentId, status) {
        const age = this.finishedTurnAge.get(agentId) ?? 0;
        const maxAge = ERROR_STATUSES.has(status) ? _AgentWidget.ERROR_LINGER_TURNS : 1;
        return age < maxAge;
      }
      /** Record an agent as finished (call when agent completes). */
      markFinished(agentId) {
        if (!this.finishedTurnAge.has(agentId)) {
          this.finishedTurnAge.set(agentId, 0);
        }
      }
      /** Render a finished agent line. */
      renderFinishedLine(a, theme) {
        const name = getDisplayName(a.type);
        const modeLabel = getPromptModeLabel(a.type);
        const duration = formatMs((a.completedAt ?? Date.now()) - a.startedAt);
        let icon;
        let statusText;
        if (a.status === "completed") {
          icon = theme.fg("success", "\u2713");
          statusText = "";
        } else if (a.status === "steered") {
          icon = theme.fg("warning", "\u2713");
          statusText = theme.fg("warning", " (turn limit)");
        } else if (a.status === "stopped") {
          icon = theme.fg("dim", "\u25A0");
          statusText = theme.fg("dim", " stopped");
        } else if (a.status === "error") {
          icon = theme.fg("error", "\u2717");
          const errMsg = a.error ? `: ${a.error.slice(0, 60)}` : "";
          statusText = theme.fg("error", ` error${errMsg}`);
        } else {
          icon = theme.fg("error", "\u2717");
          statusText = theme.fg("warning", " aborted");
        }
        const parts = [];
        const activity = this.agentActivity.get(a.id);
        if (activity)
          parts.push(formatTurns(activity.turnCount, activity.maxTurns));
        if (a.toolUses > 0)
          parts.push(`${a.toolUses} tool use${a.toolUses === 1 ? "" : "s"}`);
        parts.push(duration);
        const modeTag = modeLabel ? ` ${theme.fg("dim", `(${modeLabel})`)}` : "";
        return `${icon} ${theme.fg("dim", name)}${modeTag}  ${theme.fg("dim", a.description)} ${theme.fg("dim", "\xB7")} ${theme.fg("dim", parts.join(" \xB7 "))}${statusText}`;
      }
      /**
       * Render the widget content. Called from the registered widget's render() callback,
       * reading live state each time instead of capturing it in a closure.
       */
      renderWidget(tui, theme) {
        const allAgents = this.manager.listAgents();
        const running = allAgents.filter((a) => a.status === "running");
        const queued = allAgents.filter((a) => a.status === "queued");
        const finished = allAgents.filter((a) => a.status !== "running" && a.status !== "queued" && a.completedAt && this.shouldShowFinished(a.id, a.status));
        const hasActive = running.length > 0 || queued.length > 0;
        const hasFinished = finished.length > 0;
        if (!hasActive && !hasFinished)
          return [];
        const w = tui.terminal.columns;
        const truncate = (line) => truncateToWidth(line, w);
        const headingColor = hasActive ? "accent" : "dim";
        const headingIcon = hasActive ? "\u25CF" : "\u25CB";
        const frame = SPINNER[this.widgetFrame % SPINNER.length];
        const finishedLines = [];
        for (const a of finished) {
          finishedLines.push(truncate(theme.fg("dim", "\u251C\u2500") + " " + this.renderFinishedLine(a, theme)));
        }
        const runningLines = [];
        for (const a of running) {
          const name = getDisplayName(a.type);
          const modeLabel = getPromptModeLabel(a.type);
          const modeTag = modeLabel ? ` ${theme.fg("dim", `(${modeLabel})`)}` : "";
          const elapsed = formatMs(Date.now() - a.startedAt);
          const bg = this.agentActivity.get(a.id);
          const toolUses = bg?.toolUses ?? a.toolUses;
          let tokenText = "";
          if (bg?.session) {
            try {
              tokenText = formatTokens(bg.session.getSessionStats().tokens.total);
            } catch {
            }
          }
          const parts = [];
          if (bg)
            parts.push(formatTurns(bg.turnCount, bg.maxTurns));
          if (toolUses > 0)
            parts.push(`${toolUses} tool use${toolUses === 1 ? "" : "s"}`);
          if (tokenText)
            parts.push(tokenText);
          parts.push(elapsed);
          const statsText = parts.join(" \xB7 ");
          const activity = bg ? describeActivity(bg.activeTools, bg.responseText) : "thinking\u2026";
          runningLines.push([
            truncate(theme.fg("dim", "\u251C\u2500") + ` ${theme.fg("accent", frame)} ${theme.bold(name)}${modeTag}  ${theme.fg("muted", a.description)} ${theme.fg("dim", "\xB7")} ${theme.fg("dim", statsText)}`),
            truncate(theme.fg("dim", "\u2502  ") + theme.fg("dim", `  \u23BF  ${activity}`))
          ]);
        }
        const queuedLine = queued.length > 0 ? truncate(theme.fg("dim", "\u251C\u2500") + ` ${theme.fg("muted", "\u25E6")} ${theme.fg("dim", `${queued.length} queued`)}`) : void 0;
        const maxBody = MAX_WIDGET_LINES - 1;
        const totalBody = finishedLines.length + runningLines.length * 2 + (queuedLine ? 1 : 0);
        const lines = [truncate(theme.fg(headingColor, headingIcon) + " " + theme.fg(headingColor, "Agents"))];
        if (totalBody <= maxBody) {
          lines.push(...finishedLines);
          for (const pair of runningLines)
            lines.push(...pair);
          if (queuedLine)
            lines.push(queuedLine);
          if (lines.length > 1) {
            const last = lines.length - 1;
            lines[last] = lines[last].replace("\u251C\u2500", "\u2514\u2500");
            if (runningLines.length > 0 && !queuedLine) {
              if (last >= 2) {
                lines[last - 1] = lines[last - 1].replace("\u251C\u2500", "\u2514\u2500");
                lines[last] = lines[last].replace("\u2502  ", "   ");
              }
            }
          }
        } else {
          let budget = maxBody - 1;
          let hiddenRunning = 0;
          let hiddenFinished = 0;
          for (const pair of runningLines) {
            if (budget >= 2) {
              lines.push(...pair);
              budget -= 2;
            } else {
              hiddenRunning++;
            }
          }
          if (queuedLine && budget >= 1) {
            lines.push(queuedLine);
            budget--;
          }
          for (const fl of finishedLines) {
            if (budget >= 1) {
              lines.push(fl);
              budget--;
            } else {
              hiddenFinished++;
            }
          }
          const overflowParts = [];
          if (hiddenRunning > 0)
            overflowParts.push(`${hiddenRunning} running`);
          if (hiddenFinished > 0)
            overflowParts.push(`${hiddenFinished} finished`);
          const overflowText = overflowParts.join(", ");
          lines.push(truncate(theme.fg("dim", "\u2514\u2500") + ` ${theme.fg("dim", `+${hiddenRunning + hiddenFinished} more (${overflowText})`)}`));
        }
        return lines;
      }
      /** Force an immediate widget update. */
      update() {
        if (!this.uiCtx)
          return;
        const allAgents = this.manager.listAgents();
        let runningCount = 0;
        let queuedCount = 0;
        let hasFinished = false;
        for (const a of allAgents) {
          if (a.status === "running") {
            runningCount++;
          } else if (a.status === "queued") {
            queuedCount++;
          } else if (a.completedAt && this.shouldShowFinished(a.id, a.status)) {
            hasFinished = true;
          }
        }
        const hasActive = runningCount > 0 || queuedCount > 0;
        if (!hasActive && !hasFinished) {
          if (this.widgetRegistered) {
            this.uiCtx.setWidget("agents", void 0);
            this.widgetRegistered = false;
            this.tui = void 0;
          }
          if (this.lastStatusText !== void 0) {
            this.uiCtx.setStatus("subagents", void 0);
            this.lastStatusText = void 0;
          }
          if (this.widgetInterval) {
            clearInterval(this.widgetInterval);
            this.widgetInterval = void 0;
          }
          for (const [id] of this.finishedTurnAge) {
            if (!allAgents.some((a) => a.id === id))
              this.finishedTurnAge.delete(id);
          }
          return;
        }
        let newStatusText;
        if (hasActive) {
          const statusParts = [];
          if (runningCount > 0)
            statusParts.push(`${runningCount} running`);
          if (queuedCount > 0)
            statusParts.push(`${queuedCount} queued`);
          const total = runningCount + queuedCount;
          newStatusText = `${statusParts.join(", ")} agent${total === 1 ? "" : "s"}`;
        }
        if (newStatusText !== this.lastStatusText) {
          this.uiCtx.setStatus("subagents", newStatusText);
          this.lastStatusText = newStatusText;
        }
        this.widgetFrame++;
        if (!this.widgetRegistered) {
          this.uiCtx.setWidget("agents", (tui, theme) => {
            this.tui = tui;
            return {
              render: () => this.renderWidget(tui, theme),
              invalidate: () => {
                this.widgetRegistered = false;
                this.tui = void 0;
              }
            };
          }, { placement: "aboveEditor" });
          this.widgetRegistered = true;
        } else {
          this.tui?.requestRender();
        }
      }
      dispose() {
        if (this.widgetInterval) {
          clearInterval(this.widgetInterval);
          this.widgetInterval = void 0;
        }
        if (this.uiCtx) {
          this.uiCtx.setWidget("agents", void 0);
          this.uiCtx.setStatus("subagents", void 0);
        }
        this.widgetRegistered = false;
        this.tui = void 0;
        this.lastStatusText = void 0;
      }
    };
  }
});

// node_modules/@jeonghyeon.net/pi-subagents/dist/ui/conversation-viewer.js
var conversation_viewer_exports = {};
__export(conversation_viewer_exports, {
  ConversationViewer: () => ConversationViewer
});
import { matchesKey, truncateToWidth as truncateToWidth2, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
var CHROME_LINES, MIN_VIEWPORT, ConversationViewer;
var init_conversation_viewer = __esm({
  "node_modules/@jeonghyeon.net/pi-subagents/dist/ui/conversation-viewer.js"() {
    init_context();
    init_agent_widget();
    CHROME_LINES = 6;
    MIN_VIEWPORT = 3;
    ConversationViewer = class {
      tui;
      session;
      record;
      activity;
      theme;
      done;
      scrollOffset = 0;
      autoScroll = true;
      unsubscribe;
      lastInnerW = 0;
      closed = false;
      constructor(tui, session, record, activity, theme, done) {
        this.tui = tui;
        this.session = session;
        this.record = record;
        this.activity = activity;
        this.theme = theme;
        this.done = done;
        this.unsubscribe = session.subscribe(() => {
          if (this.closed)
            return;
          this.tui.requestRender();
        });
      }
      handleInput(data) {
        if (matchesKey(data, "escape") || matchesKey(data, "q")) {
          this.closed = true;
          this.done(void 0);
          return;
        }
        const totalLines = this.buildContentLines(this.lastInnerW).length;
        const viewportHeight = this.viewportHeight();
        const maxScroll = Math.max(0, totalLines - viewportHeight);
        if (matchesKey(data, "up") || matchesKey(data, "k")) {
          this.scrollOffset = Math.max(0, this.scrollOffset - 1);
          this.autoScroll = this.scrollOffset >= maxScroll;
        } else if (matchesKey(data, "down") || matchesKey(data, "j")) {
          this.scrollOffset = Math.min(maxScroll, this.scrollOffset + 1);
          this.autoScroll = this.scrollOffset >= maxScroll;
        } else if (matchesKey(data, "pageUp")) {
          this.scrollOffset = Math.max(0, this.scrollOffset - viewportHeight);
          this.autoScroll = false;
        } else if (matchesKey(data, "pageDown")) {
          this.scrollOffset = Math.min(maxScroll, this.scrollOffset + viewportHeight);
          this.autoScroll = this.scrollOffset >= maxScroll;
        } else if (matchesKey(data, "home")) {
          this.scrollOffset = 0;
          this.autoScroll = false;
        } else if (matchesKey(data, "end")) {
          this.scrollOffset = maxScroll;
          this.autoScroll = true;
        }
      }
      render(width) {
        if (width < 6)
          return [];
        const th = this.theme;
        const innerW = width - 4;
        this.lastInnerW = innerW;
        const lines = [];
        const pad = (s, len) => {
          const vis = visibleWidth(s);
          return s + " ".repeat(Math.max(0, len - vis));
        };
        const row = (content) => th.fg("border", "\u2502") + " " + truncateToWidth2(pad(content, innerW), innerW) + " " + th.fg("border", "\u2502");
        const hrTop = th.fg("border", `\u256D${"\u2500".repeat(width - 2)}\u256E`);
        const hrBot = th.fg("border", `\u2570${"\u2500".repeat(width - 2)}\u256F`);
        const hrMid = row(th.fg("dim", "\u2500".repeat(innerW)));
        lines.push(hrTop);
        const name = getDisplayName(this.record.type);
        const modeLabel = getPromptModeLabel(this.record.type);
        const modeTag = modeLabel ? ` ${th.fg("dim", `(${modeLabel})`)}` : "";
        const statusIcon = this.record.status === "running" ? th.fg("accent", "\u25CF") : this.record.status === "completed" ? th.fg("success", "\u2713") : this.record.status === "error" ? th.fg("error", "\u2717") : th.fg("dim", "\u25CB");
        const duration = formatDuration(this.record.startedAt, this.record.completedAt);
        const headerParts = [duration];
        const toolUses = this.activity?.toolUses ?? this.record.toolUses;
        if (toolUses > 0)
          headerParts.unshift(`${toolUses} tool${toolUses === 1 ? "" : "s"}`);
        if (this.activity?.session) {
          try {
            const tokens = this.activity.session.getSessionStats().tokens.total;
            if (tokens > 0)
              headerParts.push(formatTokens(tokens));
          } catch {
          }
        }
        lines.push(row(`${statusIcon} ${th.bold(name)}${modeTag}  ${th.fg("muted", this.record.description)} ${th.fg("dim", "\xB7")} ${th.fg("dim", headerParts.join(" \xB7 "))}`));
        lines.push(hrMid);
        const contentLines = this.buildContentLines(innerW);
        const viewportHeight = this.viewportHeight();
        const maxScroll = Math.max(0, contentLines.length - viewportHeight);
        if (this.autoScroll) {
          this.scrollOffset = maxScroll;
        }
        const visibleStart = Math.min(this.scrollOffset, maxScroll);
        const visible = contentLines.slice(visibleStart, visibleStart + viewportHeight);
        for (let i = 0; i < viewportHeight; i++) {
          lines.push(row(visible[i] ?? ""));
        }
        lines.push(hrMid);
        const scrollPct = contentLines.length <= viewportHeight ? "100%" : `${Math.round((visibleStart + viewportHeight) / contentLines.length * 100)}%`;
        const footerLeft = th.fg("dim", `${contentLines.length} lines \xB7 ${scrollPct}`);
        const footerRight = th.fg("dim", "\u2191\u2193 scroll \xB7 PgUp/PgDn \xB7 Esc close");
        const footerGap = Math.max(1, innerW - visibleWidth(footerLeft) - visibleWidth(footerRight));
        lines.push(row(footerLeft + " ".repeat(footerGap) + footerRight));
        lines.push(hrBot);
        return lines;
      }
      invalidate() {
      }
      dispose() {
        this.closed = true;
        if (this.unsubscribe) {
          this.unsubscribe();
          this.unsubscribe = void 0;
        }
      }
      // ---- Private ----
      viewportHeight() {
        return Math.max(MIN_VIEWPORT, this.tui.terminal.rows - CHROME_LINES);
      }
      buildContentLines(width) {
        if (width <= 0)
          return [];
        const th = this.theme;
        const messages = this.session.messages;
        const lines = [];
        if (messages.length === 0) {
          lines.push(th.fg("dim", "(waiting for first message...)"));
          return lines;
        }
        let needsSeparator = false;
        for (const msg of messages) {
          if (msg.role === "user") {
            const text = typeof msg.content === "string" ? msg.content : extractText(msg.content);
            if (!text.trim())
              continue;
            if (needsSeparator)
              lines.push(th.fg("dim", "\u2500\u2500\u2500"));
            lines.push(th.fg("accent", "[User]"));
            for (const line of wrapTextWithAnsi(text.trim(), width)) {
              lines.push(line);
            }
          } else if (msg.role === "assistant") {
            const textParts = [];
            const toolCalls = [];
            for (const c of msg.content) {
              if (c.type === "text" && c.text)
                textParts.push(c.text);
              else if (c.type === "toolCall") {
                toolCalls.push(c.name ?? c.toolName ?? "unknown");
              }
            }
            if (needsSeparator)
              lines.push(th.fg("dim", "\u2500\u2500\u2500"));
            lines.push(th.bold("[Assistant]"));
            if (textParts.length > 0) {
              for (const line of wrapTextWithAnsi(textParts.join("\n").trim(), width)) {
                lines.push(line);
              }
            }
            for (const name of toolCalls) {
              lines.push(truncateToWidth2(th.fg("muted", `  [Tool: ${name}]`), width));
            }
          } else if (msg.role === "toolResult") {
            const text = extractText(msg.content);
            const truncated = text.length > 500 ? text.slice(0, 500) + "... (truncated)" : text;
            if (!truncated.trim())
              continue;
            if (needsSeparator)
              lines.push(th.fg("dim", "\u2500\u2500\u2500"));
            lines.push(th.fg("dim", "[Result]"));
            for (const line of wrapTextWithAnsi(truncated.trim(), width)) {
              lines.push(th.fg("dim", line));
            }
          } else if (msg.role === "bashExecution") {
            const bash = msg;
            if (needsSeparator)
              lines.push(th.fg("dim", "\u2500\u2500\u2500"));
            lines.push(truncateToWidth2(th.fg("muted", `  $ ${bash.command}`), width));
            if (bash.output?.trim()) {
              const out = bash.output.length > 500 ? bash.output.slice(0, 500) + "... (truncated)" : bash.output;
              for (const line of wrapTextWithAnsi(out.trim(), width)) {
                lines.push(th.fg("dim", line));
              }
            }
          } else {
            continue;
          }
          needsSeparator = true;
        }
        if (this.record.status === "running" && this.activity) {
          const act = describeActivity(this.activity.activeTools, this.activity.responseText);
          lines.push("");
          lines.push(truncateToWidth2(th.fg("accent", "\u258D ") + th.fg("dim", act), width));
        }
        return lines.map((l) => truncateToWidth2(l, width));
      }
    };
  }
});

// node_modules/@jeonghyeon.net/pi-subagents/dist/index.js
import { existsSync as existsSync4, mkdirSync as mkdirSync3, readFileSync as readFileSync3, unlinkSync } from "node:fs";
import { homedir as homedir4 } from "node:os";
import { join as join6 } from "node:path";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

// node_modules/@jeonghyeon.net/pi-subagents/dist/agent-manager.js
import { randomUUID as randomUUID2 } from "node:crypto";

// node_modules/@jeonghyeon.net/pi-subagents/dist/agent-runner.js
init_agent_types();
init_context();
import { createAgentSession, DefaultResourceLoader, getAgentDir, SessionManager, SettingsManager } from "@mariozechner/pi-coding-agent";

// node_modules/@jeonghyeon.net/pi-subagents/dist/env.js
async function detectEnv(pi, cwd) {
  let isGitRepo = false;
  let branch = "";
  try {
    const result = await pi.exec("git", ["rev-parse", "--is-inside-work-tree"], { cwd, timeout: 5e3 });
    isGitRepo = result.code === 0 && result.stdout.trim() === "true";
  } catch {
  }
  if (isGitRepo) {
    try {
      const result = await pi.exec("git", ["branch", "--show-current"], { cwd, timeout: 5e3 });
      branch = result.code === 0 ? result.stdout.trim() : "unknown";
    } catch {
      branch = "unknown";
    }
  }
  return {
    isGitRepo,
    branch,
    platform: process.platform
  };
}

// node_modules/@jeonghyeon.net/pi-subagents/dist/memory.js
import { existsSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
var MAX_MEMORY_LINES = 200;
function isUnsafeName(name) {
  if (!name || name.length > 128)
    return true;
  return !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name);
}
function isSymlink(filePath) {
  try {
    return lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}
function safeReadFile(filePath) {
  if (!existsSync(filePath))
    return void 0;
  if (isSymlink(filePath))
    return void 0;
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return void 0;
  }
}
function resolveMemoryDir(agentName, scope, cwd) {
  if (isUnsafeName(agentName)) {
    throw new Error(`Unsafe agent name for memory directory: "${agentName}"`);
  }
  switch (scope) {
    case "user":
      return join(homedir(), ".pi", "agent-memory", agentName);
    case "project":
      return join(cwd, ".pi", "agent-memory", agentName);
    case "local":
      return join(cwd, ".pi", "agent-memory-local", agentName);
  }
}
function ensureMemoryDir(memoryDir) {
  if (existsSync(memoryDir)) {
    if (isSymlink(memoryDir)) {
      throw new Error(`Refusing to use symlinked memory directory: ${memoryDir}`);
    }
    return;
  }
  mkdirSync(memoryDir, { recursive: true });
}
function readMemoryIndex(memoryDir) {
  if (isSymlink(memoryDir))
    return void 0;
  const memoryFile = join(memoryDir, "MEMORY.md");
  const content = safeReadFile(memoryFile);
  if (content === void 0)
    return void 0;
  const lines = content.split("\n");
  if (lines.length > MAX_MEMORY_LINES) {
    return lines.slice(0, MAX_MEMORY_LINES).join("\n") + "\n... (truncated at 200 lines)";
  }
  return content;
}
function buildMemoryBlock(agentName, scope, cwd) {
  const memoryDir = resolveMemoryDir(agentName, scope, cwd);
  ensureMemoryDir(memoryDir);
  const existingMemory = readMemoryIndex(memoryDir);
  const header = `# Agent Memory

You have a persistent memory directory at: ${memoryDir}/
Memory scope: ${scope}

This memory persists across sessions. Use it to build up knowledge over time.`;
  const memoryContent = existingMemory ? `

## Current MEMORY.md
${existingMemory}` : `

No MEMORY.md exists yet. Create one at ${join(memoryDir, "MEMORY.md")} to start building persistent memory.`;
  const instructions = `

## Memory Instructions
- MEMORY.md is an index file \u2014 keep it concise (under 200 lines). Lines after 200 are truncated.
- Store detailed memories in separate files within ${memoryDir}/ and link to them from MEMORY.md.
- Each memory file should use this frontmatter format:
  \`\`\`markdown
  ---
  name: <memory name>
  description: <one-line description>
  type: <user|feedback|project|reference>
  ---
  <memory content>
  \`\`\`
- Update or remove memories that become outdated. Check for existing memories before creating duplicates.
- You have Read, Write, and Edit tools available for managing memory files.`;
  return header + memoryContent + instructions;
}
function buildReadOnlyMemoryBlock(agentName, scope, cwd) {
  const memoryDir = resolveMemoryDir(agentName, scope, cwd);
  const existingMemory = readMemoryIndex(memoryDir);
  const header = `# Agent Memory (read-only)

Memory scope: ${scope}
You have read-only access to memory. You can reference existing memories but cannot create or modify them.`;
  const memoryContent = existingMemory ? `

## Current MEMORY.md
${existingMemory}` : `

No memory is available yet. Other agents or sessions with write access can create memories for you to consume.`;
  return header + memoryContent;
}

// node_modules/@jeonghyeon.net/pi-subagents/dist/prompts.js
function buildAgentPrompt(config, cwd, env, parentSystemPrompt, extras) {
  const envBlock = `# Environment
Working directory: ${cwd}
${env.isGitRepo ? `Git repository: yes
Branch: ${env.branch}` : "Not a git repository"}
Platform: ${env.platform}`;
  const extraSections = [];
  if (extras?.memoryBlock) {
    extraSections.push(extras.memoryBlock);
  }
  if (extras?.skillBlocks?.length) {
    for (const skill of extras.skillBlocks) {
      extraSections.push(`
# Preloaded Skill: ${skill.name}
${skill.content}`);
    }
  }
  const extrasSuffix = extraSections.length > 0 ? "\n\n" + extraSections.join("\n") : "";
  if (config.promptMode === "append") {
    const identity = parentSystemPrompt || genericBase;
    const bridge = `<sub_agent_context>
You are operating as a sub-agent invoked to handle a specific task.
- Use the read tool instead of cat/head/tail
- Use the edit tool instead of sed/awk
- Use the write tool instead of echo/heredoc
- Use the find tool instead of bash find/ls for file search
- Use the grep tool instead of bash grep/rg for content search
- Make independent tool calls in parallel
- Use absolute file paths
- Do not use emojis
- Be concise but complete
</sub_agent_context>`;
    const customSection = config.systemPrompt?.trim() ? `

<agent_instructions>
${config.systemPrompt}
</agent_instructions>` : "";
    return envBlock + "\n\n<inherited_system_prompt>\n" + identity + "\n</inherited_system_prompt>\n\n" + bridge + customSection + extrasSuffix;
  }
  const replaceHeader = `You are a pi coding agent sub-agent.
You have been invoked to handle a specific task autonomously.

${envBlock}`;
  return replaceHeader + "\n\n" + config.systemPrompt + extrasSuffix;
}
var genericBase = `# Role
You are a general-purpose coding agent for complex, multi-step tasks.
You have full access to read, write, edit files, and execute commands.
Do what has been asked; nothing more, nothing less.`;

// node_modules/@jeonghyeon.net/pi-subagents/dist/skill-loader.js
import { homedir as homedir2 } from "node:os";
import { join as join2 } from "node:path";
function preloadSkills(skillNames, cwd) {
  const results = [];
  for (const name of skillNames) {
    if (isUnsafeName(name)) {
      results.push({ name, content: `(Skill "${name}" skipped: name contains path traversal characters)` });
      continue;
    }
    const content = findAndReadSkill(name, cwd);
    if (content !== void 0) {
      results.push({ name, content });
    } else {
      results.push({ name, content: `(Skill "${name}" not found in .pi/skills/ or ~/.pi/skills/)` });
    }
  }
  return results;
}
function findAndReadSkill(name, cwd) {
  const projectDir = join2(cwd, ".pi", "skills");
  const globalDir = join2(homedir2(), ".pi", "skills");
  for (const dir of [projectDir, globalDir]) {
    const content = tryReadSkillFile(dir, name);
    if (content !== void 0)
      return content;
  }
  return void 0;
}
function tryReadSkillFile(dir, name) {
  const extensions = [".md", ".txt", ""];
  for (const ext of extensions) {
    const path = join2(dir, name + ext);
    const content = safeReadFile(path);
    if (content !== void 0)
      return content.trim();
  }
  return void 0;
}

// node_modules/@jeonghyeon.net/pi-subagents/dist/agent-runner.js
var EXCLUDED_TOOL_NAMES = ["Agent", "get_subagent_result", "steer_subagent"];
var defaultMaxTurns;
function normalizeMaxTurns(n) {
  if (n == null || n === 0)
    return void 0;
  return Math.max(1, n);
}
function getDefaultMaxTurns() {
  return defaultMaxTurns;
}
function setDefaultMaxTurns(n) {
  defaultMaxTurns = normalizeMaxTurns(n);
}
var graceTurns = 5;
function getGraceTurns() {
  return graceTurns;
}
function setGraceTurns(n) {
  graceTurns = Math.max(1, n);
}
function resolveDefaultModel(parentModel, registry, configModel) {
  if (configModel) {
    const slashIdx = configModel.indexOf("/");
    if (slashIdx !== -1) {
      const provider = configModel.slice(0, slashIdx);
      const modelId = configModel.slice(slashIdx + 1);
      const available = registry.getAvailable?.();
      const availableKeys = available ? new Set(available.map((m) => `${m.provider}/${m.id}`)) : void 0;
      const isAvailable = (p, id) => !availableKeys || availableKeys.has(`${p}/${id}`);
      const found = registry.find(provider, modelId);
      if (found && isAvailable(provider, modelId))
        return found;
    }
  }
  return parentModel;
}
function collectResponseText(session) {
  let text = "";
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "message_start") {
      text = "";
    }
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      text += event.assistantMessageEvent.delta;
    }
  });
  return { getText: () => text, unsubscribe };
}
function getLastAssistantText(session) {
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const msg = session.messages[i];
    if (msg.role !== "assistant")
      continue;
    const text = extractText(msg.content).trim();
    if (text)
      return text;
  }
  return "";
}
function forwardAbortSignal(session, signal) {
  if (!signal)
    return () => {
    };
  const onAbort = () => session.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  return () => signal.removeEventListener("abort", onAbort);
}
async function runAgent(ctx, type, prompt, options) {
  const config = getConfig(type);
  const agentConfig = getAgentConfig(type);
  const effectiveCwd = options.cwd ?? ctx.cwd;
  const env = await detectEnv(options.pi, effectiveCwd);
  const parentSystemPrompt = ctx.getSystemPrompt();
  const extras = {};
  const extensions = options.isolated ? false : config.extensions;
  const skills = options.isolated ? false : config.skills;
  if (Array.isArray(skills)) {
    const loaded = preloadSkills(skills, effectiveCwd);
    if (loaded.length > 0) {
      extras.skillBlocks = loaded;
    }
  }
  let tools = getToolsForType(type, effectiveCwd);
  if (agentConfig?.memory) {
    const existingNames = new Set(tools.map((t) => t.name));
    const denied = agentConfig.disallowedTools ? new Set(agentConfig.disallowedTools) : void 0;
    const effectivelyHas = (name) => existingNames.has(name) && !denied?.has(name);
    const hasWriteTools = effectivelyHas("write") || effectivelyHas("edit");
    if (hasWriteTools) {
      const memTools = getMemoryTools(effectiveCwd, existingNames);
      if (memTools.length > 0)
        tools = [...tools, ...memTools];
      extras.memoryBlock = buildMemoryBlock(agentConfig.name, agentConfig.memory, effectiveCwd);
    } else {
      if (!existingNames.has("read")) {
        const readTools = getReadOnlyMemoryTools(effectiveCwd, existingNames);
        if (readTools.length > 0)
          tools = [...tools, ...readTools];
      }
      extras.memoryBlock = buildReadOnlyMemoryBlock(agentConfig.name, agentConfig.memory, effectiveCwd);
    }
  }
  const builtinToolNames = new Set(tools.map((t) => t.name));
  let systemPrompt;
  if (agentConfig) {
    systemPrompt = buildAgentPrompt(agentConfig, effectiveCwd, env, parentSystemPrompt, extras);
  } else {
    systemPrompt = buildAgentPrompt({
      name: type,
      description: "General-purpose agent",
      systemPrompt: "",
      promptMode: "append",
      extensions: true,
      skills: true,
      inheritContext: false,
      runInBackground: false,
      isolated: false
    }, effectiveCwd, env, parentSystemPrompt, extras);
  }
  const noSkills = skills === false || Array.isArray(skills);
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(effectiveCwd, agentDir);
  const loader = new DefaultResourceLoader({
    cwd: effectiveCwd,
    agentDir,
    settingsManager,
    noExtensions: extensions === false,
    noSkills,
    noPromptTemplates: true,
    noThemes: true,
    systemPromptOverride: () => systemPrompt
  });
  await loader.reload();
  const model = options.model ?? resolveDefaultModel(ctx.model, ctx.modelRegistry, agentConfig?.model);
  const thinkingLevel = options.thinkingLevel ?? agentConfig?.thinking;
  const sessionOpts = {
    cwd: effectiveCwd,
    sessionManager: SessionManager.inMemory(effectiveCwd),
    settingsManager,
    modelRegistry: ctx.modelRegistry,
    model,
    resourceLoader: loader
  };
  if (thinkingLevel) {
    sessionOpts.thinkingLevel = thinkingLevel;
  }
  const { session } = await createAgentSession(sessionOpts);
  const disallowedSet = agentConfig?.disallowedTools ? new Set(agentConfig.disallowedTools) : void 0;
  const desiredActiveTools = [...builtinToolNames].filter((t) => {
    if (EXCLUDED_TOOL_NAMES.includes(t))
      return false;
    if (disallowedSet?.has(t))
      return false;
    return true;
  });
  if (extensions !== false) {
    for (const toolName of session.getActiveToolNames()) {
      if (EXCLUDED_TOOL_NAMES.includes(toolName))
        continue;
      if (disallowedSet?.has(toolName))
        continue;
      if (builtinToolNames.has(toolName))
        continue;
      if (Array.isArray(extensions) && !extensions.some((ext) => toolName.startsWith(ext) || toolName.includes(ext))) {
        continue;
      }
      desiredActiveTools.push(toolName);
    }
  }
  session.setActiveToolsByName([...new Set(desiredActiveTools)]);
  await session.bindExtensions({
    onError: (err) => {
      options.onToolActivity?.({
        type: "end",
        toolName: `extension-error:${err.extensionPath}`
      });
    }
  });
  options.onSessionCreated?.(session);
  let turnCount = 0;
  const maxTurns = normalizeMaxTurns(options.maxTurns ?? agentConfig?.maxTurns ?? defaultMaxTurns);
  let softLimitReached = false;
  let aborted = false;
  let currentMessageText = "";
  const unsubTurns = session.subscribe((event) => {
    if (event.type === "turn_end") {
      turnCount++;
      options.onTurnEnd?.(turnCount);
      if (maxTurns != null) {
        if (!softLimitReached && turnCount >= maxTurns) {
          softLimitReached = true;
          session.steer("You have reached your turn limit. Wrap up immediately \u2014 provide your final answer now.");
        } else if (softLimitReached && turnCount >= maxTurns + graceTurns) {
          aborted = true;
          session.abort();
        }
      }
    }
    if (event.type === "message_start") {
      currentMessageText = "";
    }
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      currentMessageText += event.assistantMessageEvent.delta;
      options.onTextDelta?.(event.assistantMessageEvent.delta, currentMessageText);
    }
    if (event.type === "tool_execution_start") {
      options.onToolActivity?.({ type: "start", toolName: event.toolName });
    }
    if (event.type === "tool_execution_end") {
      options.onToolActivity?.({ type: "end", toolName: event.toolName });
    }
  });
  const collector = collectResponseText(session);
  const cleanupAbort = forwardAbortSignal(session, options.signal);
  let effectivePrompt = prompt;
  if (options.inheritContext) {
    const parentContext = buildParentContext(ctx);
    if (parentContext) {
      effectivePrompt = parentContext + prompt;
    }
  }
  try {
    await session.prompt(effectivePrompt);
  } finally {
    unsubTurns();
    collector.unsubscribe();
    cleanupAbort();
  }
  const responseText = collector.getText().trim() || getLastAssistantText(session);
  return { responseText, session, aborted, steered: softLimitReached };
}
async function resumeAgent(session, prompt, options = {}) {
  const collector = collectResponseText(session);
  const cleanupAbort = forwardAbortSignal(session, options.signal);
  const unsubToolUse = options.onToolActivity ? session.subscribe((event) => {
    if (event.type === "tool_execution_start")
      options.onToolActivity({ type: "start", toolName: event.toolName });
    if (event.type === "tool_execution_end")
      options.onToolActivity({ type: "end", toolName: event.toolName });
  }) : () => {
  };
  try {
    await session.prompt(prompt);
  } finally {
    collector.unsubscribe();
    unsubToolUse();
    cleanupAbort();
  }
  return collector.getText().trim() || getLastAssistantText(session);
}
async function steerAgent(session, message) {
  await session.steer(message);
}
function getAgentConversation(session) {
  const parts = [];
  for (const msg of session.messages) {
    if (msg.role === "user") {
      const text = typeof msg.content === "string" ? msg.content : extractText(msg.content);
      if (text.trim())
        parts.push(`[User]: ${text.trim()}`);
    } else if (msg.role === "assistant") {
      const textParts = [];
      const toolCalls = [];
      for (const c of msg.content) {
        if (c.type === "text" && c.text)
          textParts.push(c.text);
        else if (c.type === "toolCall")
          toolCalls.push(`  Tool: ${c.name ?? c.toolName ?? "unknown"}`);
      }
      if (textParts.length > 0)
        parts.push(`[Assistant]: ${textParts.join("\n")}`);
      if (toolCalls.length > 0)
        parts.push(`[Tool Calls]:
${toolCalls.join("\n")}`);
    } else if (msg.role === "toolResult") {
      const text = extractText(msg.content);
      const truncated = text.length > 200 ? text.slice(0, 200) + "..." : text;
      parts.push(`[Tool Result (${msg.toolName})]: ${truncated}`);
    }
  }
  return parts.join("\n\n");
}

// node_modules/@jeonghyeon.net/pi-subagents/dist/worktree.js
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync as existsSync2 } from "node:fs";
import { tmpdir } from "node:os";
import { join as join3 } from "node:path";
function createWorktree(cwd, agentId) {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd, stdio: "pipe", timeout: 5e3 });
    execFileSync("git", ["rev-parse", "HEAD"], { cwd, stdio: "pipe", timeout: 5e3 });
  } catch {
    return void 0;
  }
  const branch = `pi-agent-${agentId}`;
  const suffix = randomUUID().slice(0, 8);
  const worktreePath = join3(tmpdir(), `pi-agent-${agentId}-${suffix}`);
  try {
    execFileSync("git", ["worktree", "add", "--detach", worktreePath, "HEAD"], {
      cwd,
      stdio: "pipe",
      timeout: 3e4
    });
    return { path: worktreePath, branch };
  } catch {
    return void 0;
  }
}
function cleanupWorktree(cwd, worktree, agentDescription) {
  if (!existsSync2(worktree.path)) {
    return { hasChanges: false };
  }
  try {
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: worktree.path,
      stdio: "pipe",
      timeout: 1e4
    }).toString().trim();
    if (!status) {
      removeWorktree(cwd, worktree.path);
      return { hasChanges: false };
    }
    execFileSync("git", ["add", "-A"], { cwd: worktree.path, stdio: "pipe", timeout: 1e4 });
    const safeDesc = agentDescription.slice(0, 200);
    const commitMsg = `pi-agent: ${safeDesc}`;
    execFileSync("git", ["commit", "-m", commitMsg], {
      cwd: worktree.path,
      stdio: "pipe",
      timeout: 1e4
    });
    let branchName = worktree.branch;
    try {
      execFileSync("git", ["branch", branchName], {
        cwd: worktree.path,
        stdio: "pipe",
        timeout: 5e3
      });
    } catch {
      branchName = `${worktree.branch}-${Date.now()}`;
      execFileSync("git", ["branch", branchName], {
        cwd: worktree.path,
        stdio: "pipe",
        timeout: 5e3
      });
    }
    worktree.branch = branchName;
    removeWorktree(cwd, worktree.path);
    return {
      hasChanges: true,
      branch: worktree.branch,
      path: worktree.path
    };
  } catch {
    try {
      removeWorktree(cwd, worktree.path);
    } catch {
    }
    return { hasChanges: false };
  }
}
function removeWorktree(cwd, worktreePath) {
  try {
    execFileSync("git", ["worktree", "remove", "--force", worktreePath], {
      cwd,
      stdio: "pipe",
      timeout: 1e4
    });
  } catch {
    try {
      execFileSync("git", ["worktree", "prune"], { cwd, stdio: "pipe", timeout: 5e3 });
    } catch {
    }
  }
}
function pruneWorktrees(cwd) {
  try {
    execFileSync("git", ["worktree", "prune"], { cwd, stdio: "pipe", timeout: 5e3 });
  } catch {
  }
}

// node_modules/@jeonghyeon.net/pi-subagents/dist/agent-manager.js
var DEFAULT_MAX_CONCURRENT = 4;
var AgentManager = class {
  agents = /* @__PURE__ */ new Map();
  cleanupInterval;
  onComplete;
  onStart;
  maxConcurrent;
  /** Queue of background agents waiting to start. */
  queue = [];
  /** Number of currently running background agents. */
  runningBackground = 0;
  constructor(onComplete, maxConcurrent = DEFAULT_MAX_CONCURRENT, onStart) {
    this.onComplete = onComplete;
    this.onStart = onStart;
    this.maxConcurrent = maxConcurrent;
    this.cleanupInterval = setInterval(() => this.cleanup(), 6e4);
  }
  /** Update the max concurrent background agents limit. */
  setMaxConcurrent(n) {
    this.maxConcurrent = Math.max(1, n);
    this.drainQueue();
  }
  getMaxConcurrent() {
    return this.maxConcurrent;
  }
  /**
   * Spawn an agent and return its ID immediately (for background use).
   * If the concurrency limit is reached, the agent is queued.
   */
  spawn(pi, ctx, type, prompt, options) {
    const id = randomUUID2().slice(0, 17);
    const abortController = new AbortController();
    const record = {
      id,
      type,
      description: options.description,
      status: options.isBackground ? "queued" : "running",
      toolUses: 0,
      startedAt: Date.now(),
      abortController
    };
    this.agents.set(id, record);
    const args = { pi, ctx, type, prompt, options };
    if (options.isBackground && this.runningBackground >= this.maxConcurrent) {
      this.queue.push({ id, args });
      return id;
    }
    this.startAgent(id, record, args);
    return id;
  }
  /** Actually start an agent (called immediately or from queue drain). */
  startAgent(id, record, { pi, ctx, type, prompt, options }) {
    record.status = "running";
    record.startedAt = Date.now();
    if (options.isBackground)
      this.runningBackground++;
    this.onStart?.(record);
    let worktreeCwd;
    let worktreeWarning = "";
    if (options.isolation === "worktree") {
      const wt = createWorktree(ctx.cwd, id);
      if (wt) {
        record.worktree = wt;
        worktreeCwd = wt.path;
      } else {
        worktreeWarning = "\n\n[WARNING: Worktree isolation was requested but failed (not a git repo, or no commits yet). Running in the main working directory instead.]";
      }
    }
    const effectivePrompt = worktreeWarning ? worktreeWarning + "\n\n" + prompt : prompt;
    const promise = runAgent(ctx, type, effectivePrompt, {
      pi,
      model: options.model,
      maxTurns: options.maxTurns,
      isolated: options.isolated,
      inheritContext: options.inheritContext,
      thinkingLevel: options.thinkingLevel,
      cwd: worktreeCwd,
      signal: record.abortController.signal,
      onToolActivity: (activity) => {
        if (activity.type === "end")
          record.toolUses++;
        options.onToolActivity?.(activity);
      },
      onTurnEnd: options.onTurnEnd,
      onTextDelta: options.onTextDelta,
      onSessionCreated: (session) => {
        record.session = session;
        if (record.pendingSteers?.length) {
          for (const msg of record.pendingSteers) {
            session.steer(msg).catch(() => {
            });
          }
          record.pendingSteers = void 0;
        }
        options.onSessionCreated?.(session);
      }
    }).then(({ responseText, session, aborted, steered }) => {
      if (record.status !== "stopped") {
        record.status = aborted ? "aborted" : steered ? "steered" : "completed";
      }
      record.result = responseText;
      record.session = session;
      record.completedAt ??= Date.now();
      if (record.outputCleanup) {
        try {
          record.outputCleanup();
        } catch {
        }
        record.outputCleanup = void 0;
      }
      if (record.worktree) {
        const wtResult = cleanupWorktree(ctx.cwd, record.worktree, options.description);
        record.worktreeResult = wtResult;
        if (wtResult.hasChanges && wtResult.branch) {
          record.result = (record.result ?? "") + `

---
Changes saved to branch \`${wtResult.branch}\`. Merge with: \`git merge ${wtResult.branch}\``;
        }
      }
      if (options.isBackground) {
        this.runningBackground--;
        this.onComplete?.(record);
        this.drainQueue();
      }
      return responseText;
    }).catch((err) => {
      if (record.status !== "stopped") {
        record.status = "error";
      }
      record.error = err instanceof Error ? err.message : String(err);
      record.completedAt ??= Date.now();
      if (record.outputCleanup) {
        try {
          record.outputCleanup();
        } catch {
        }
        record.outputCleanup = void 0;
      }
      if (record.worktree) {
        try {
          const wtResult = cleanupWorktree(ctx.cwd, record.worktree, options.description);
          record.worktreeResult = wtResult;
        } catch {
        }
      }
      if (options.isBackground) {
        this.runningBackground--;
        this.onComplete?.(record);
        this.drainQueue();
      }
      return "";
    });
    record.promise = promise;
  }
  /** Start queued agents up to the concurrency limit. */
  drainQueue() {
    while (this.queue.length > 0 && this.runningBackground < this.maxConcurrent) {
      const next = this.queue.shift();
      const record = this.agents.get(next.id);
      if (!record || record.status !== "queued")
        continue;
      this.startAgent(next.id, record, next.args);
    }
  }
  /**
   * Spawn an agent and wait for completion (foreground use).
   * Foreground agents bypass the concurrency queue.
   */
  async spawnAndWait(pi, ctx, type, prompt, options) {
    const id = this.spawn(pi, ctx, type, prompt, { ...options, isBackground: false });
    const record = this.agents.get(id);
    await record.promise;
    return record;
  }
  /**
   * Resume an existing agent session with a new prompt.
   */
  async resume(id, prompt, signal) {
    const record = this.agents.get(id);
    if (!record?.session)
      return void 0;
    record.status = "running";
    record.startedAt = Date.now();
    record.completedAt = void 0;
    record.result = void 0;
    record.error = void 0;
    try {
      const responseText = await resumeAgent(record.session, prompt, {
        onToolActivity: (activity) => {
          if (activity.type === "end")
            record.toolUses++;
        },
        signal
      });
      record.status = "completed";
      record.result = responseText;
      record.completedAt = Date.now();
    } catch (err) {
      record.status = "error";
      record.error = err instanceof Error ? err.message : String(err);
      record.completedAt = Date.now();
    }
    return record;
  }
  getRecord(id) {
    return this.agents.get(id);
  }
  listAgents() {
    return [...this.agents.values()].sort((a, b) => b.startedAt - a.startedAt);
  }
  abort(id) {
    const record = this.agents.get(id);
    if (!record)
      return false;
    if (record.status === "queued") {
      this.queue = this.queue.filter((q) => q.id !== id);
      record.status = "stopped";
      record.completedAt = Date.now();
      return true;
    }
    if (record.status !== "running")
      return false;
    record.abortController?.abort();
    record.status = "stopped";
    record.completedAt = Date.now();
    return true;
  }
  /** Dispose a record's session and remove it from the map. */
  removeRecord(id, record) {
    record.session?.dispose?.();
    record.session = void 0;
    this.agents.delete(id);
  }
  cleanup() {
    const cutoff = Date.now() - 10 * 6e4;
    for (const [id, record] of this.agents) {
      if (record.status === "running" || record.status === "queued")
        continue;
      if ((record.completedAt ?? 0) >= cutoff)
        continue;
      this.removeRecord(id, record);
    }
  }
  /**
   * Remove all completed/stopped/errored records immediately.
   * Called on session start/switch so tasks from a prior session don't persist.
   */
  clearCompleted() {
    for (const [id, record] of this.agents) {
      if (record.status === "running" || record.status === "queued")
        continue;
      this.removeRecord(id, record);
    }
  }
  /** Whether any agents are still running or queued. */
  hasRunning() {
    return [...this.agents.values()].some((r) => r.status === "running" || r.status === "queued");
  }
  /** Abort all running and queued agents immediately. */
  abortAll() {
    let count = 0;
    for (const queued of this.queue) {
      const record = this.agents.get(queued.id);
      if (record) {
        record.status = "stopped";
        record.completedAt = Date.now();
        count++;
      }
    }
    this.queue = [];
    for (const record of this.agents.values()) {
      if (record.status === "running") {
        record.abortController?.abort();
        record.status = "stopped";
        record.completedAt = Date.now();
        count++;
      }
    }
    return count;
  }
  /** Wait for all running and queued agents to complete (including queued ones). */
  async waitForAll() {
    while (true) {
      this.drainQueue();
      const pending = [...this.agents.values()].filter((r) => r.status === "running" || r.status === "queued").map((r) => r.promise).filter(Boolean);
      if (pending.length === 0)
        break;
      await Promise.allSettled(pending);
    }
  }
  dispose() {
    clearInterval(this.cleanupInterval);
    this.queue = [];
    for (const record of this.agents.values()) {
      record.session?.dispose();
    }
    this.agents.clear();
    try {
      pruneWorktrees(process.cwd());
    } catch {
    }
  }
};

// node_modules/@jeonghyeon.net/pi-subagents/dist/index.js
init_agent_types();

// node_modules/@jeonghyeon.net/pi-subagents/dist/cross-extension-rpc.js
var PROTOCOL_VERSION = 2;
function handleRpc(events, channel, fn) {
  return events.on(channel, async (raw) => {
    const params = raw;
    try {
      const data = await fn(params);
      const reply = { success: true };
      if (data !== void 0)
        reply.data = data;
      events.emit(`${channel}:reply:${params.requestId}`, reply);
    } catch (err) {
      events.emit(`${channel}:reply:${params.requestId}`, {
        success: false,
        error: err?.message ?? String(err)
      });
    }
  });
}
function registerRpcHandlers(deps) {
  const { events, pi, getCtx, manager } = deps;
  const unsubPing = handleRpc(events, "subagents:rpc:ping", () => {
    return { version: PROTOCOL_VERSION };
  });
  const unsubSpawn = handleRpc(events, "subagents:rpc:spawn", ({ type, prompt, options }) => {
    const ctx = getCtx();
    if (!ctx)
      throw new Error("No active session");
    return { id: manager.spawn(pi, ctx, type, prompt, options ?? {}) };
  });
  const unsubStop = handleRpc(events, "subagents:rpc:stop", ({ agentId }) => {
    if (!manager.abort(agentId))
      throw new Error("Agent not found");
  });
  return { unsubPing, unsubSpawn, unsubStop };
}

// node_modules/@jeonghyeon.net/pi-subagents/dist/custom-agents.js
init_agent_types();
import { existsSync as existsSync3, readdirSync, readFileSync as readFileSync2 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { basename, join as join4 } from "node:path";
import { parseFrontmatter } from "@mariozechner/pi-coding-agent";
function loadCustomAgents(cwd) {
  const globalDir = join4(homedir3(), ".pi", "agent", "agents");
  const projectDir = join4(cwd, ".pi", "agents");
  const agents2 = /* @__PURE__ */ new Map();
  loadFromDir(globalDir, agents2, "global");
  loadFromDir(projectDir, agents2, "project");
  return agents2;
}
function loadFromDir(dir, agents2, source) {
  if (!existsSync3(dir))
    return;
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    return;
  }
  for (const file of files) {
    const name = basename(file, ".md");
    let content;
    try {
      content = readFileSync2(join4(dir, file), "utf-8");
    } catch {
      continue;
    }
    const { frontmatter: fm, body } = parseFrontmatter(content);
    agents2.set(name, {
      name,
      displayName: str(fm.display_name),
      description: str(fm.description) ?? name,
      builtinToolNames: csvList(fm.tools, BUILTIN_TOOL_NAMES),
      disallowedTools: csvListOptional(fm.disallowed_tools),
      extensions: inheritField(fm.extensions ?? fm.inherit_extensions),
      skills: inheritField(fm.skills ?? fm.inherit_skills),
      model: str(fm.model),
      thinking: str(fm.thinking),
      maxTurns: nonNegativeInt(fm.max_turns),
      systemPrompt: body.trim(),
      promptMode: fm.prompt_mode === "append" ? "append" : "replace",
      inheritContext: fm.inherit_context != null ? fm.inherit_context === true : void 0,
      runInBackground: fm.run_in_background != null ? fm.run_in_background === true : void 0,
      isolated: fm.isolated != null ? fm.isolated === true : void 0,
      memory: parseMemory(fm.memory),
      isolation: fm.isolation === "worktree" ? "worktree" : void 0,
      enabled: fm.enabled !== false,
      // default true; explicitly false disables
      source
    });
  }
}
function str(val) {
  return typeof val === "string" ? val : void 0;
}
function nonNegativeInt(val) {
  return typeof val === "number" && val >= 0 ? val : void 0;
}
function parseCsvField(val) {
  if (val === void 0 || val === null)
    return void 0;
  const s = String(val).trim();
  if (!s || s === "none")
    return void 0;
  const items = s.split(",").map((t) => t.trim()).filter(Boolean);
  return items.length > 0 ? items : void 0;
}
function csvList(val, defaults) {
  if (val === void 0 || val === null)
    return defaults;
  return parseCsvField(val) ?? [];
}
function csvListOptional(val) {
  return parseCsvField(val);
}
function parseMemory(val) {
  if (val === "user" || val === "project" || val === "local")
    return val;
  return void 0;
}
function inheritField(val) {
  if (val === void 0 || val === null || val === true)
    return true;
  if (val === false || val === "none")
    return false;
  const items = csvList(val, []);
  return items.length > 0 ? items : false;
}

// node_modules/@jeonghyeon.net/pi-subagents/dist/group-join.js
var DEFAULT_TIMEOUT = 3e4;
var STRAGGLER_TIMEOUT = 15e3;
var GroupJoinManager = class {
  deliverCb;
  groupTimeout;
  groups = /* @__PURE__ */ new Map();
  agentToGroup = /* @__PURE__ */ new Map();
  constructor(deliverCb, groupTimeout = DEFAULT_TIMEOUT) {
    this.deliverCb = deliverCb;
    this.groupTimeout = groupTimeout;
  }
  /** Register a group of agent IDs that should be joined. */
  registerGroup(groupId, agentIds) {
    const group = {
      groupId,
      agentIds: new Set(agentIds),
      completedRecords: /* @__PURE__ */ new Map(),
      delivered: false,
      isStraggler: false
    };
    this.groups.set(groupId, group);
    for (const id of agentIds) {
      this.agentToGroup.set(id, groupId);
    }
  }
  /**
   * Called when an agent completes.
   * Returns:
   * - 'pass'      — agent is not grouped, caller should send individual nudge
   * - 'held'      — result held, waiting for group completion
   * - 'delivered'  — this completion triggered the group notification
   */
  onAgentComplete(record) {
    const groupId = this.agentToGroup.get(record.id);
    if (!groupId)
      return "pass";
    const group = this.groups.get(groupId);
    if (!group || group.delivered)
      return "pass";
    group.completedRecords.set(record.id, record);
    if (group.completedRecords.size >= group.agentIds.size) {
      this.deliver(group, false);
      return "delivered";
    }
    if (!group.timeoutHandle) {
      const timeout = group.isStraggler ? STRAGGLER_TIMEOUT : this.groupTimeout;
      group.timeoutHandle = setTimeout(() => {
        this.onTimeout(group);
      }, timeout);
    }
    return "held";
  }
  onTimeout(group) {
    if (group.delivered)
      return;
    group.timeoutHandle = void 0;
    const remaining = /* @__PURE__ */ new Set();
    for (const id of group.agentIds) {
      if (!group.completedRecords.has(id))
        remaining.add(id);
    }
    for (const id of group.completedRecords.keys()) {
      this.agentToGroup.delete(id);
    }
    this.deliverCb([...group.completedRecords.values()], true);
    group.completedRecords.clear();
    group.agentIds = remaining;
    group.isStraggler = true;
  }
  deliver(group, partial) {
    if (group.timeoutHandle) {
      clearTimeout(group.timeoutHandle);
      group.timeoutHandle = void 0;
    }
    group.delivered = true;
    this.deliverCb([...group.completedRecords.values()], partial);
    this.cleanupGroup(group.groupId);
  }
  cleanupGroup(groupId) {
    const group = this.groups.get(groupId);
    if (!group)
      return;
    for (const id of group.agentIds) {
      this.agentToGroup.delete(id);
    }
    this.groups.delete(groupId);
  }
  /** Check if an agent is in a group. */
  isGrouped(agentId) {
    return this.agentToGroup.has(agentId);
  }
  dispose() {
    for (const group of this.groups.values()) {
      if (group.timeoutHandle)
        clearTimeout(group.timeoutHandle);
    }
    this.groups.clear();
    this.agentToGroup.clear();
  }
};

// node_modules/@jeonghyeon.net/pi-subagents/dist/invocation-config.js
function resolveAgentInvocationConfig(agentConfig, params) {
  return {
    modelInput: agentConfig?.model ?? params.model,
    modelFromParams: agentConfig?.model == null && params.model != null,
    thinking: agentConfig?.thinking ?? params.thinking,
    maxTurns: agentConfig?.maxTurns ?? params.max_turns,
    inheritContext: agentConfig?.inheritContext ?? params.inherit_context ?? false,
    runInBackground: agentConfig?.runInBackground ?? params.run_in_background ?? false,
    isolated: agentConfig?.isolated ?? params.isolated ?? false,
    isolation: agentConfig?.isolation ?? params.isolation
  };
}
function resolveJoinMode(defaultJoinMode, runInBackground) {
  return runInBackground ? defaultJoinMode : void 0;
}

// node_modules/@jeonghyeon.net/pi-subagents/dist/model-resolver.js
function resolveModel(input, registry) {
  const all = registry.getAvailable?.() ?? registry.getAll();
  const availableSet = new Set(all.map((m) => `${m.provider}/${m.id}`.toLowerCase()));
  const slashIdx = input.indexOf("/");
  if (slashIdx !== -1) {
    const provider = input.slice(0, slashIdx);
    const modelId = input.slice(slashIdx + 1);
    if (availableSet.has(input.toLowerCase())) {
      const found = registry.find(provider, modelId);
      if (found)
        return found;
    }
  }
  const query = input.toLowerCase();
  let bestMatch;
  let bestScore = 0;
  for (const m of all) {
    const id = m.id.toLowerCase();
    const name = m.name.toLowerCase();
    const full = `${m.provider}/${m.id}`.toLowerCase();
    let score = 0;
    if (id === query || full === query) {
      score = 100;
    } else if (id.includes(query) || full.includes(query)) {
      score = 60 + query.length / id.length * 30;
    } else if (name.includes(query)) {
      score = 40 + query.length / name.length * 20;
    } else if (query.split(/[\s\-/]+/).every((part) => id.includes(part) || name.includes(part) || m.provider.toLowerCase().includes(part))) {
      score = 20;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = m;
    }
  }
  if (bestMatch && bestScore >= 20) {
    const found = registry.find(bestMatch.provider, bestMatch.id);
    if (found)
      return found;
  }
  const modelList = all.map((m) => `  ${m.provider}/${m.id}`).sort().join("\n");
  return `Model not found: "${input}".

Available models:
${modelList}`;
}

// node_modules/@jeonghyeon.net/pi-subagents/dist/output-file.js
import { appendFileSync, chmodSync, mkdirSync as mkdirSync2, writeFileSync } from "node:fs";
import { tmpdir as tmpdir2 } from "node:os";
import { join as join5 } from "node:path";
function encodeCwd(cwd) {
  return cwd.replace(/[\\/]/g, "-").replace(/^[A-Za-z]:-/, "").replace(/^-+/, "");
}
function createOutputFilePath(cwd, agentId, sessionId) {
  const encoded = encodeCwd(cwd);
  const root = join5(tmpdir2(), `pi-subagents-${process.getuid?.() ?? 0}`);
  mkdirSync2(root, { recursive: true, mode: 448 });
  try {
    chmodSync(root, 448);
  } catch {
  }
  const dir = join5(root, encoded, sessionId, "tasks");
  mkdirSync2(dir, { recursive: true });
  return join5(dir, `${agentId}.output`);
}
function writeInitialEntry(path, agentId, prompt, cwd) {
  const entry = {
    isSidechain: true,
    agentId,
    type: "user",
    message: { role: "user", content: prompt },
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    cwd
  };
  writeFileSync(path, JSON.stringify(entry) + "\n", "utf-8");
}
function streamToOutputFile(session, path, agentId, cwd) {
  let writtenCount = 1;
  const flush = () => {
    const messages = session.messages;
    while (writtenCount < messages.length) {
      const msg = messages[writtenCount];
      const entry = {
        isSidechain: true,
        agentId,
        type: msg.role === "assistant" ? "assistant" : msg.role === "user" ? "user" : "toolResult",
        message: msg,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        cwd
      };
      try {
        appendFileSync(path, JSON.stringify(entry) + "\n", "utf-8");
      } catch {
      }
      writtenCount++;
    }
  };
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "turn_end")
      flush();
  });
  return () => {
    flush();
    unsubscribe();
  };
}

// node_modules/@jeonghyeon.net/pi-subagents/dist/index.js
init_agent_widget();
function textResult(msg, details) {
  return { content: [{ type: "text", text: msg }], details };
}
function safeFormatTokens(session) {
  if (!session)
    return "";
  try {
    return formatTokens(session.getSessionStats().tokens.total);
  } catch {
    return "";
  }
}
function createActivityTracker(maxTurns, onStreamUpdate) {
  const state = { activeTools: /* @__PURE__ */ new Map(), toolUses: 0, turnCount: 1, maxTurns, tokens: "", responseText: "", session: void 0 };
  const callbacks = {
    onToolActivity: (activity) => {
      if (activity.type === "start") {
        state.activeTools.set(activity.toolName + "_" + Date.now(), activity.toolName);
      } else {
        for (const [key, name] of state.activeTools) {
          if (name === activity.toolName) {
            state.activeTools.delete(key);
            break;
          }
        }
        state.toolUses++;
      }
      state.tokens = safeFormatTokens(state.session);
      onStreamUpdate?.();
    },
    onTextDelta: (_delta, fullText) => {
      state.responseText = fullText;
      onStreamUpdate?.();
    },
    onTurnEnd: (turnCount) => {
      state.turnCount = turnCount;
      onStreamUpdate?.();
    },
    onSessionCreated: (session) => {
      state.session = session;
    }
  };
  return { state, callbacks };
}
function getStatusLabel(status, error) {
  switch (status) {
    case "error":
      return `Error: ${error ?? "unknown"}`;
    case "aborted":
      return "Aborted (max turns exceeded)";
    case "steered":
      return "Wrapped up (turn limit)";
    case "stopped":
      return "Stopped";
    default:
      return "Done";
  }
}
function getStatusNote(status) {
  switch (status) {
    case "aborted":
      return " (aborted \u2014 max turns exceeded, output may be incomplete)";
    case "steered":
      return " (wrapped up \u2014 reached turn limit)";
    case "stopped":
      return " (stopped by user)";
    default:
      return "";
  }
}
function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function formatTaskNotification(record, resultMaxLen) {
  const status = getStatusLabel(record.status, record.error);
  const durationMs = record.completedAt ? record.completedAt - record.startedAt : 0;
  let totalTokens = 0;
  try {
    if (record.session) {
      const stats = record.session.getSessionStats();
      totalTokens = stats.tokens?.total ?? 0;
    }
  } catch {
  }
  const resultPreview = record.result ? record.result.length > resultMaxLen ? record.result.slice(0, resultMaxLen) + "\n...(truncated, use get_subagent_result for full output)" : record.result : "No output.";
  return [
    `<task-notification>`,
    `<task-id>${record.id}</task-id>`,
    record.toolCallId ? `<tool-use-id>${escapeXml(record.toolCallId)}</tool-use-id>` : null,
    record.outputFile ? `<output-file>${escapeXml(record.outputFile)}</output-file>` : null,
    `<status>${escapeXml(status)}</status>`,
    `<summary>Agent "${escapeXml(record.description)}" ${record.status}</summary>`,
    `<result>${escapeXml(resultPreview)}</result>`,
    `<usage><total_tokens>${totalTokens}</total_tokens><tool_uses>${record.toolUses}</tool_uses><duration_ms>${durationMs}</duration_ms></usage>`,
    `</task-notification>`
  ].filter(Boolean).join("\n");
}
function buildDetails(base, record, activity, overrides) {
  return {
    ...base,
    toolUses: record.toolUses,
    tokens: safeFormatTokens(record.session),
    turnCount: activity?.turnCount,
    maxTurns: activity?.maxTurns,
    durationMs: (record.completedAt ?? Date.now()) - record.startedAt,
    status: record.status,
    agentId: record.id,
    error: record.error,
    ...overrides
  };
}
function buildNotificationDetails(record, resultMaxLen, activity) {
  let totalTokens = 0;
  try {
    if (record.session)
      totalTokens = record.session.getSessionStats().tokens?.total ?? 0;
  } catch {
  }
  return {
    id: record.id,
    description: record.description,
    status: record.status,
    toolUses: record.toolUses,
    turnCount: activity?.turnCount ?? 0,
    maxTurns: activity?.maxTurns,
    totalTokens,
    durationMs: record.completedAt ? record.completedAt - record.startedAt : 0,
    outputFile: record.outputFile,
    error: record.error,
    resultPreview: record.result ? record.result.length > resultMaxLen ? record.result.slice(0, resultMaxLen) + "\u2026" : record.result : "No output."
  };
}
function dist_default(pi) {
  pi.registerMessageRenderer("subagent-notification", (message, { expanded }, theme) => {
    const d = message.details;
    if (!d)
      return void 0;
    function renderOne(d2) {
      const isError = d2.status === "error" || d2.status === "stopped" || d2.status === "aborted";
      const icon = isError ? theme.fg("error", "\u2717") : theme.fg("success", "\u2713");
      const statusText = isError ? d2.status : d2.status === "steered" ? "completed (steered)" : "completed";
      let line = `${icon} ${theme.bold(d2.description)} ${theme.fg("dim", statusText)}`;
      const parts = [];
      if (d2.turnCount > 0)
        parts.push(formatTurns(d2.turnCount, d2.maxTurns));
      if (d2.toolUses > 0)
        parts.push(`${d2.toolUses} tool use${d2.toolUses === 1 ? "" : "s"}`);
      if (d2.totalTokens > 0)
        parts.push(formatTokens(d2.totalTokens));
      if (d2.durationMs > 0)
        parts.push(formatMs(d2.durationMs));
      if (parts.length) {
        line += "\n  " + parts.map((p) => theme.fg("dim", p)).join(" " + theme.fg("dim", "\xB7") + " ");
      }
      if (expanded) {
        const lines = d2.resultPreview.split("\n").slice(0, 30);
        for (const l of lines)
          line += "\n" + theme.fg("dim", `  ${l}`);
      } else {
        const preview = d2.resultPreview.split("\n")[0]?.slice(0, 80) ?? "";
        line += "\n  " + theme.fg("dim", `\u23BF  ${preview}`);
      }
      if (d2.outputFile) {
        line += "\n  " + theme.fg("muted", `transcript: ${d2.outputFile}`);
      }
      return line;
    }
    const all = [d, ...d.others ?? []];
    return new Text(all.map(renderOne).join("\n"), 0, 0);
  });
  const reloadCustomAgents = () => {
    const userAgents = loadCustomAgents(process.cwd());
    registerAgents(userAgents);
  };
  reloadCustomAgents();
  const agentActivity = /* @__PURE__ */ new Map();
  const pendingNudges = /* @__PURE__ */ new Map();
  const NUDGE_HOLD_MS = 200;
  function scheduleNudge(key, send, delay = NUDGE_HOLD_MS) {
    cancelNudge(key);
    pendingNudges.set(key, setTimeout(() => {
      pendingNudges.delete(key);
      send();
    }, delay));
  }
  function cancelNudge(key) {
    const timer = pendingNudges.get(key);
    if (timer != null) {
      clearTimeout(timer);
      pendingNudges.delete(key);
    }
  }
  function emitIndividualNudge(record) {
    if (record.resultConsumed)
      return;
    const notification = formatTaskNotification(record, 500);
    const footer = record.outputFile ? `
Full transcript available at: ${record.outputFile}` : "";
    pi.sendMessage({
      customType: "subagent-notification",
      content: notification + footer,
      display: true,
      details: buildNotificationDetails(record, 500, agentActivity.get(record.id))
    }, { deliverAs: "followUp", triggerTurn: true });
  }
  function sendIndividualNudge(record) {
    agentActivity.delete(record.id);
    widget.markFinished(record.id);
    scheduleNudge(record.id, () => emitIndividualNudge(record));
    widget.update();
  }
  const groupJoin = new GroupJoinManager((records, partial) => {
    for (const r of records) {
      agentActivity.delete(r.id);
      widget.markFinished(r.id);
    }
    const groupKey = `group:${records.map((r) => r.id).join(",")}`;
    scheduleNudge(groupKey, () => {
      const unconsumed = records.filter((r) => !r.resultConsumed);
      if (unconsumed.length === 0) {
        widget.update();
        return;
      }
      const notifications = unconsumed.map((r) => formatTaskNotification(r, 300)).join("\n\n");
      const label = partial ? `${unconsumed.length} agent(s) finished (partial \u2014 others still running)` : `${unconsumed.length} agent(s) finished`;
      const [first, ...rest] = unconsumed;
      const details = buildNotificationDetails(first, 300, agentActivity.get(first.id));
      if (rest.length > 0) {
        details.others = rest.map((r) => buildNotificationDetails(r, 300, agentActivity.get(r.id)));
      }
      pi.sendMessage({
        customType: "subagent-notification",
        content: `Background agent group completed: ${label}

${notifications}

Use get_subagent_result for full output.`,
        display: true,
        details
      }, { deliverAs: "followUp", triggerTurn: true });
    });
    widget.update();
  }, 3e4);
  function buildEventData(record) {
    const durationMs = record.completedAt ? record.completedAt - record.startedAt : Date.now() - record.startedAt;
    let tokens;
    try {
      if (record.session) {
        const stats = record.session.getSessionStats();
        tokens = {
          input: stats.tokens?.input ?? 0,
          output: stats.tokens?.output ?? 0,
          total: stats.tokens?.total ?? 0
        };
      }
    } catch {
    }
    return {
      id: record.id,
      type: record.type,
      description: record.description,
      result: record.result,
      error: record.error,
      status: record.status,
      toolUses: record.toolUses,
      durationMs,
      tokens
    };
  }
  const manager = new AgentManager((record) => {
    const isError = record.status === "error" || record.status === "stopped" || record.status === "aborted";
    const eventData = buildEventData(record);
    if (isError) {
      pi.events.emit("subagents:failed", eventData);
    } else {
      pi.events.emit("subagents:completed", eventData);
    }
    pi.appendEntry("subagents:record", {
      id: record.id,
      type: record.type,
      description: record.description,
      status: record.status,
      result: record.result,
      error: record.error,
      startedAt: record.startedAt,
      completedAt: record.completedAt
    });
    if (record.resultConsumed) {
      agentActivity.delete(record.id);
      widget.markFinished(record.id);
      widget.update();
      return;
    }
    if (currentBatchAgents.some((a) => a.id === record.id)) {
      widget.update();
      return;
    }
    const result = groupJoin.onAgentComplete(record);
    if (result === "pass") {
      sendIndividualNudge(record);
    }
    widget.update();
  }, void 0, (record) => {
    pi.events.emit("subagents:started", {
      id: record.id,
      type: record.type,
      description: record.description
    });
  });
  const MANAGER_KEY = /* @__PURE__ */ Symbol.for("pi-subagents:manager");
  globalThis[MANAGER_KEY] = {
    waitForAll: () => manager.waitForAll(),
    hasRunning: () => manager.hasRunning(),
    spawn: (piRef, ctx, type, prompt, options) => manager.spawn(piRef, ctx, type, prompt, options),
    getRecord: (id) => manager.getRecord(id)
  };
  let currentCtx;
  pi.on("session_start", async (_event, ctx) => {
    currentCtx = ctx;
    manager.clearCompleted();
  });
  pi.on("session_switch", () => {
    manager.clearCompleted();
  });
  const { unsubPing: unsubPingRpc, unsubSpawn: unsubSpawnRpc, unsubStop: unsubStopRpc } = registerRpcHandlers({
    events: pi.events,
    pi,
    getCtx: () => currentCtx,
    manager
  });
  pi.events.emit("subagents:ready", {});
  pi.on("session_shutdown", async () => {
    unsubSpawnRpc();
    unsubStopRpc();
    unsubPingRpc();
    currentCtx = void 0;
    delete globalThis[MANAGER_KEY];
    manager.abortAll();
    for (const timer of pendingNudges.values())
      clearTimeout(timer);
    pendingNudges.clear();
    manager.dispose();
  });
  const widget = new AgentWidget(manager, agentActivity);
  let defaultJoinMode = "smart";
  function getDefaultJoinMode() {
    return defaultJoinMode;
  }
  function setDefaultJoinMode(mode) {
    defaultJoinMode = mode;
  }
  let currentBatchAgents = [];
  let batchFinalizeTimer;
  let batchCounter = 0;
  function finalizeBatch() {
    batchFinalizeTimer = void 0;
    const batchAgents = [...currentBatchAgents];
    currentBatchAgents = [];
    const smartAgents = batchAgents.filter((a) => a.joinMode === "smart" || a.joinMode === "group");
    if (smartAgents.length >= 2) {
      const groupId = `batch-${++batchCounter}`;
      const ids = smartAgents.map((a) => a.id);
      groupJoin.registerGroup(groupId, ids);
      for (const id of ids) {
        const record = manager.getRecord(id);
        if (!record)
          continue;
        record.groupId = groupId;
        if (record.completedAt != null && !record.resultConsumed) {
          groupJoin.onAgentComplete(record);
        }
      }
    } else {
      for (const { id } of batchAgents) {
        const record = manager.getRecord(id);
        if (record?.completedAt != null && !record.resultConsumed) {
          sendIndividualNudge(record);
        }
      }
    }
  }
  pi.on("tool_execution_start", async (_event, ctx) => {
    widget.setUICtx(ctx.ui);
    widget.onTurnStart();
  });
  const buildTypeListText = () => {
    const defaultNames = getDefaultAgentNames();
    const userNames = getUserAgentNames();
    const defaultDescs = defaultNames.map((name) => {
      const cfg = getAgentConfig(name);
      const modelSuffix = cfg?.model ? ` (${getModelLabelFromConfig(cfg.model)})` : "";
      return `- ${name}: ${cfg?.description ?? name}${modelSuffix}`;
    });
    const customDescs = userNames.map((name) => {
      const cfg = getAgentConfig(name);
      return `- ${name}: ${cfg?.description ?? name}`;
    });
    return [
      "Default agents:",
      ...defaultDescs,
      ...customDescs.length > 0 ? ["", "Custom agents:", ...customDescs] : [],
      "",
      "Custom agents can be defined in .pi/agents/<name>.md (project) or ~/.pi/agent/agents/<name>.md (global) \u2014 they are picked up automatically. Project-level agents override global ones. Creating a .md file with the same name as a default agent overrides it."
    ].join("\n");
  };
  function getModelLabelFromConfig(model) {
    const name = model.includes("/") ? model.split("/").pop() : model;
    return name.replace(/-\d{8}$/, "");
  }
  const typeListText = buildTypeListText();
  pi.registerTool({
    name: "Agent",
    label: "Agent",
    description: `Launch a new agent to handle complex, multi-step tasks autonomously.

The Agent tool launches specialized agents that autonomously handle complex tasks. Each agent type has specific capabilities and tools available to it.

Available agent types:
${typeListText}

Guidelines:
- For parallel work, use run_in_background: true on each agent. Foreground calls run sequentially \u2014 only one executes at a time.
- Use Explore for codebase searches and code understanding.
- Use Plan for architecture and implementation planning.
- Use general-purpose for complex tasks that need file editing.
- Provide clear, detailed prompts so the agent can work autonomously.
- Agent results are returned as text \u2014 summarize them for the user.
- Use run_in_background for work you don't need immediately. You will be notified when it completes.
- Use resume with an agent ID to continue a previous agent's work.
- Use steer_subagent to send mid-run messages to a running background agent.
- Use model to specify a different model (as "provider/modelId", or fuzzy e.g. "haiku", "sonnet").
- Use thinking to control extended thinking level.
- Use inherit_context if the agent needs the parent conversation history.
- Use isolation: "worktree" to run the agent in an isolated git worktree (safe parallel file modifications).`,
    parameters: Type.Object({
      prompt: Type.String({
        description: "The task for the agent to perform."
      }),
      description: Type.String({
        description: "A short (3-5 word) description of the task (shown in UI)."
      }),
      subagent_type: Type.String({
        description: `The type of specialized agent to use. Available types: ${getAvailableTypes().join(", ")}. Custom agents from .pi/agents/*.md (project) or ~/.pi/agent/agents/*.md (global) are also available.`
      }),
      model: Type.Optional(Type.String({
        description: `Optional model override. Accepts "provider/modelId" or fuzzy name (e.g. "haiku", "sonnet"). Omit to use the agent type's default.`
      })),
      thinking: Type.Optional(Type.String({
        description: "Thinking level: off, minimal, low, medium, high, xhigh. Overrides agent default."
      })),
      max_turns: Type.Optional(Type.Number({
        description: "Maximum number of agentic turns before stopping. Omit for unlimited (default).",
        minimum: 1
      })),
      run_in_background: Type.Optional(Type.Boolean({
        description: "Set to true to run in background. Returns agent ID immediately. You will be notified on completion."
      })),
      resume: Type.Optional(Type.String({
        description: "Optional agent ID to resume from. Continues from previous context."
      })),
      isolated: Type.Optional(Type.Boolean({
        description: "If true, agent gets no extension/MCP tools \u2014 only built-in tools."
      })),
      inherit_context: Type.Optional(Type.Boolean({
        description: "If true, fork parent conversation into the agent. Default: false (fresh context)."
      })),
      isolation: Type.Optional(Type.Literal("worktree", {
        description: 'Set to "worktree" to run the agent in a temporary git worktree (isolated copy of the repo). Changes are saved to a branch on completion.'
      }))
    }),
    // ---- Custom rendering: Claude Code style ----
    renderCall(args, theme) {
      const displayName = args.subagent_type ? getDisplayName(args.subagent_type) : "Agent";
      const desc = args.description ?? "";
      return new Text("\u25B8 " + theme.fg("toolTitle", theme.bold(displayName)) + (desc ? "  " + theme.fg("muted", desc) : ""), 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme) {
      const details = result.details;
      if (!details) {
        const text = result.content[0]?.type === "text" ? result.content[0].text : "";
        return new Text(text, 0, 0);
      }
      const stats = (d) => {
        const parts = [];
        if (d.modelName)
          parts.push(d.modelName);
        if (d.tags)
          parts.push(...d.tags);
        if (d.turnCount != null && d.turnCount > 0) {
          parts.push(formatTurns(d.turnCount, d.maxTurns));
        }
        if (d.toolUses > 0)
          parts.push(`${d.toolUses} tool use${d.toolUses === 1 ? "" : "s"}`);
        if (d.tokens)
          parts.push(d.tokens);
        return parts.map((p) => theme.fg("dim", p)).join(" " + theme.fg("dim", "\xB7") + " ");
      };
      if (isPartial || details.status === "running") {
        const frame = SPINNER[details.spinnerFrame ?? 0];
        const s2 = stats(details);
        let line2 = theme.fg("accent", frame) + (s2 ? " " + s2 : "");
        line2 += "\n" + theme.fg("dim", `  \u23BF  ${details.activity ?? "thinking\u2026"}`);
        return new Text(line2, 0, 0);
      }
      if (details.status === "background") {
        return new Text(theme.fg("dim", `  \u23BF  Running in background (ID: ${details.agentId})`), 0, 0);
      }
      if (details.status === "completed" || details.status === "steered") {
        const duration = formatMs(details.durationMs);
        const isSteered = details.status === "steered";
        const icon = isSteered ? theme.fg("warning", "\u2713") : theme.fg("success", "\u2713");
        const s2 = stats(details);
        let line2 = icon + (s2 ? " " + s2 : "");
        line2 += " " + theme.fg("dim", "\xB7") + " " + theme.fg("dim", duration);
        if (expanded) {
          const resultText = result.content[0]?.type === "text" ? result.content[0].text : "";
          if (resultText) {
            const lines = resultText.split("\n").slice(0, 50);
            for (const l of lines) {
              line2 += "\n" + theme.fg("dim", `  ${l}`);
            }
            if (resultText.split("\n").length > 50) {
              line2 += "\n" + theme.fg("muted", "  ... (use get_subagent_result with verbose for full output)");
            }
          }
        } else {
          const doneText = isSteered ? "Wrapped up (turn limit)" : "Done";
          line2 += "\n" + theme.fg("dim", `  \u23BF  ${doneText}`);
        }
        return new Text(line2, 0, 0);
      }
      if (details.status === "stopped") {
        const s2 = stats(details);
        let line2 = theme.fg("dim", "\u25A0") + (s2 ? " " + s2 : "");
        line2 += "\n" + theme.fg("dim", "  \u23BF  Stopped");
        return new Text(line2, 0, 0);
      }
      const s = stats(details);
      let line = theme.fg("error", "\u2717") + (s ? " " + s : "");
      if (details.status === "error") {
        line += "\n" + theme.fg("error", `  \u23BF  Error: ${details.error ?? "unknown"}`);
      } else {
        line += "\n" + theme.fg("warning", "  \u23BF  Aborted (max turns exceeded)");
      }
      return new Text(line, 0, 0);
    },
    // ---- Execute ----
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      widget.setUICtx(ctx.ui);
      reloadCustomAgents();
      const rawType = params.subagent_type;
      const resolved = resolveType(rawType);
      const subagentType = resolved ?? "general-purpose";
      const fellBack = resolved === void 0;
      const displayName = getDisplayName(subagentType);
      const customConfig = getAgentConfig(subagentType);
      const resolvedConfig = resolveAgentInvocationConfig(customConfig, params);
      let model = ctx.model;
      if (resolvedConfig.modelInput) {
        const resolved2 = resolveModel(resolvedConfig.modelInput, ctx.modelRegistry);
        if (typeof resolved2 === "string") {
          if (resolvedConfig.modelFromParams)
            return textResult(resolved2);
        } else {
          model = resolved2;
        }
      }
      const thinking = resolvedConfig.thinking;
      const inheritContext = resolvedConfig.inheritContext;
      const runInBackground = resolvedConfig.runInBackground;
      const isolated = resolvedConfig.isolated;
      const isolation = resolvedConfig.isolation;
      const parentModelId = ctx.model?.id;
      const effectiveModelId = model?.id;
      const agentModelName = effectiveModelId && effectiveModelId !== parentModelId ? (model?.name ?? effectiveModelId).replace(/^Claude\s+/i, "").toLowerCase() : void 0;
      const agentTags = [];
      const modeLabel = getPromptModeLabel(subagentType);
      if (modeLabel)
        agentTags.push(modeLabel);
      if (thinking)
        agentTags.push(`thinking: ${thinking}`);
      if (isolated)
        agentTags.push("isolated");
      if (isolation === "worktree")
        agentTags.push("worktree");
      const effectiveMaxTurns = normalizeMaxTurns(resolvedConfig.maxTurns ?? getDefaultMaxTurns());
      const detailBase = {
        displayName,
        description: params.description,
        subagentType,
        modelName: agentModelName,
        tags: agentTags.length > 0 ? agentTags : void 0
      };
      if (params.resume) {
        const existing = manager.getRecord(params.resume);
        if (!existing) {
          return textResult(`Agent not found: "${params.resume}". It may have been cleaned up.`);
        }
        if (!existing.session) {
          return textResult(`Agent "${params.resume}" has no active session to resume.`);
        }
        const record2 = await manager.resume(params.resume, params.prompt, signal);
        if (!record2) {
          return textResult(`Failed to resume agent "${params.resume}".`);
        }
        return textResult(record2.result?.trim() || record2.error?.trim() || "No output.", buildDetails(detailBase, record2));
      }
      if (runInBackground) {
        const { state: bgState, callbacks: bgCallbacks } = createActivityTracker(effectiveMaxTurns);
        let id;
        const origBgOnSession = bgCallbacks.onSessionCreated;
        bgCallbacks.onSessionCreated = (session) => {
          origBgOnSession(session);
          const rec = manager.getRecord(id);
          if (rec?.outputFile) {
            rec.outputCleanup = streamToOutputFile(session, rec.outputFile, id, ctx.cwd);
          }
        };
        id = manager.spawn(pi, ctx, subagentType, params.prompt, {
          description: params.description,
          model,
          maxTurns: effectiveMaxTurns,
          isolated,
          inheritContext,
          thinkingLevel: thinking,
          isBackground: true,
          isolation,
          ...bgCallbacks
        });
        const joinMode = resolveJoinMode(defaultJoinMode, true);
        const record2 = manager.getRecord(id);
        if (record2 && joinMode) {
          record2.joinMode = joinMode;
          record2.toolCallId = toolCallId;
          record2.outputFile = createOutputFilePath(ctx.cwd, id, ctx.sessionManager.getSessionId());
          writeInitialEntry(record2.outputFile, id, params.prompt, ctx.cwd);
        }
        if (joinMode == null || joinMode === "async") {
        } else {
          currentBatchAgents.push({ id, joinMode });
          if (batchFinalizeTimer)
            clearTimeout(batchFinalizeTimer);
          batchFinalizeTimer = setTimeout(finalizeBatch, 100);
        }
        agentActivity.set(id, bgState);
        widget.ensureTimer();
        widget.update();
        pi.events.emit("subagents:created", {
          id,
          type: subagentType,
          description: params.description,
          isBackground: true
        });
        const isQueued = record2?.status === "queued";
        return textResult(`Agent ${isQueued ? "queued" : "started"} in background.
Agent ID: ${id}
Type: ${displayName}
Description: ${params.description}
` + (record2?.outputFile ? `Output file: ${record2.outputFile}
` : "") + (isQueued ? `Position: queued (max ${manager.getMaxConcurrent()} concurrent)
` : "") + `
You will be notified when this agent completes.
Use get_subagent_result to retrieve full results, or steer_subagent to send it messages.
Do not duplicate this agent's work.`, { ...detailBase, toolUses: 0, tokens: "", durationMs: 0, status: "background", agentId: id });
      }
      let spinnerFrame = 0;
      const startedAt = Date.now();
      let fgId;
      const streamUpdate = () => {
        const details2 = {
          ...detailBase,
          toolUses: fgState.toolUses,
          tokens: fgState.tokens,
          turnCount: fgState.turnCount,
          maxTurns: fgState.maxTurns,
          durationMs: Date.now() - startedAt,
          status: "running",
          activity: describeActivity(fgState.activeTools, fgState.responseText),
          spinnerFrame: spinnerFrame % SPINNER.length
        };
        onUpdate?.({
          content: [{ type: "text", text: `${fgState.toolUses} tool uses...` }],
          details: details2
        });
      };
      const { state: fgState, callbacks: fgCallbacks } = createActivityTracker(effectiveMaxTurns, streamUpdate);
      const origOnSession = fgCallbacks.onSessionCreated;
      fgCallbacks.onSessionCreated = (session) => {
        origOnSession(session);
        for (const a of manager.listAgents()) {
          if (a.session === session) {
            fgId = a.id;
            agentActivity.set(a.id, fgState);
            widget.ensureTimer();
            break;
          }
        }
      };
      const spinnerInterval = setInterval(() => {
        spinnerFrame++;
        streamUpdate();
      }, SPINNER_INTERVAL_MS);
      streamUpdate();
      const record = await manager.spawnAndWait(pi, ctx, subagentType, params.prompt, {
        description: params.description,
        model,
        maxTurns: effectiveMaxTurns,
        isolated,
        inheritContext,
        thinkingLevel: thinking,
        isolation,
        ...fgCallbacks
      });
      clearInterval(spinnerInterval);
      if (fgId) {
        agentActivity.delete(fgId);
        widget.markFinished(fgId);
      }
      const tokenText = safeFormatTokens(fgState.session);
      const details = buildDetails(detailBase, record, fgState, { tokens: tokenText });
      const fallbackNote = fellBack ? `Note: Unknown agent type "${rawType}" \u2014 using general-purpose.

` : "";
      if (record.status === "error") {
        return textResult(`${fallbackNote}Agent failed: ${record.error}`, details);
      }
      const durationMs = (record.completedAt ?? Date.now()) - record.startedAt;
      const statsParts = [`${record.toolUses} tool uses`];
      if (tokenText)
        statsParts.push(tokenText);
      return textResult(`${fallbackNote}Agent completed in ${formatMs(durationMs)} (${statsParts.join(", ")})${getStatusNote(record.status)}.

` + (record.result?.trim() || "No output."), details);
    }
  });
  pi.registerTool({
    name: "get_subagent_result",
    label: "Get Agent Result",
    description: "Check status and retrieve results from a background agent. Use the agent ID returned by Agent with run_in_background.",
    parameters: Type.Object({
      agent_id: Type.String({
        description: "The agent ID to check."
      }),
      wait: Type.Optional(Type.Boolean({
        description: "If true, wait for the agent to complete before returning. Default: false."
      })),
      verbose: Type.Optional(Type.Boolean({
        description: "If true, include the agent's full conversation (messages + tool calls). Default: false."
      }))
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      const record = manager.getRecord(params.agent_id);
      if (!record) {
        return textResult(`Agent not found: "${params.agent_id}". It may have been cleaned up.`);
      }
      if (params.wait && record.status === "running" && record.promise) {
        record.resultConsumed = true;
        cancelNudge(params.agent_id);
        await record.promise;
      }
      const displayName = getDisplayName(record.type);
      const duration = formatDuration(record.startedAt, record.completedAt);
      const tokens = safeFormatTokens(record.session);
      const toolStats = tokens ? `Tool uses: ${record.toolUses} | ${tokens}` : `Tool uses: ${record.toolUses}`;
      let output = `Agent: ${record.id}
Type: ${displayName} | Status: ${record.status} | ${toolStats} | Duration: ${duration}
Description: ${record.description}

`;
      if (record.status === "running") {
        output += "Agent is still running. Use wait: true or check back later.";
      } else if (record.status === "error") {
        output += `Error: ${record.error}`;
      } else {
        output += record.result?.trim() || "No output.";
      }
      if (record.status !== "running" && record.status !== "queued") {
        record.resultConsumed = true;
        cancelNudge(params.agent_id);
      }
      if (params.verbose && record.session) {
        const conversation = getAgentConversation(record.session);
        if (conversation) {
          output += `

--- Agent Conversation ---
${conversation}`;
        }
      }
      return textResult(output);
    }
  });
  pi.registerTool({
    name: "steer_subagent",
    label: "Steer Agent",
    description: "Send a steering message to a running agent. The message will interrupt the agent after its current tool execution and be injected into its conversation, allowing you to redirect its work mid-run. Only works on running agents.",
    parameters: Type.Object({
      agent_id: Type.String({
        description: "The agent ID to steer (must be currently running)."
      }),
      message: Type.String({
        description: "The steering message to send. This will appear as a user message in the agent's conversation."
      })
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      const record = manager.getRecord(params.agent_id);
      if (!record) {
        return textResult(`Agent not found: "${params.agent_id}". It may have been cleaned up.`);
      }
      if (record.status !== "running") {
        return textResult(`Agent "${params.agent_id}" is not running (status: ${record.status}). Cannot steer a non-running agent.`);
      }
      if (!record.session) {
        if (!record.pendingSteers)
          record.pendingSteers = [];
        record.pendingSteers.push(params.message);
        pi.events.emit("subagents:steered", { id: record.id, message: params.message });
        return textResult(`Steering message queued for agent ${record.id}. It will be delivered once the session initializes.`);
      }
      try {
        await steerAgent(record.session, params.message);
        pi.events.emit("subagents:steered", { id: record.id, message: params.message });
        return textResult(`Steering message sent to agent ${record.id}. The agent will process it after its current tool execution.`);
      } catch (err) {
        return textResult(`Failed to steer agent: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  });
  const projectAgentsDir = () => join6(process.cwd(), ".pi", "agents");
  const personalAgentsDir = () => join6(homedir4(), ".pi", "agent", "agents");
  function findAgentFile(name) {
    const projectPath = join6(projectAgentsDir(), `${name}.md`);
    if (existsSync4(projectPath))
      return { path: projectPath, location: "project" };
    const personalPath = join6(personalAgentsDir(), `${name}.md`);
    if (existsSync4(personalPath))
      return { path: personalPath, location: "personal" };
    return void 0;
  }
  function getModelLabel(type, registry) {
    const cfg = getAgentConfig(type);
    if (!cfg?.model)
      return "inherit";
    if (registry) {
      const resolved = resolveModel(cfg.model, registry);
      if (typeof resolved === "string")
        return "inherit";
    }
    return getModelLabelFromConfig(cfg.model);
  }
  async function showAgentsMenu(ctx) {
    reloadCustomAgents();
    const allNames = getAllTypes();
    const options = [];
    const agents2 = manager.listAgents();
    if (agents2.length > 0) {
      const running = agents2.filter((a) => a.status === "running" || a.status === "queued").length;
      const done = agents2.filter((a) => a.status === "completed" || a.status === "steered").length;
      options.push(`Running agents (${agents2.length}) \u2014 ${running} running, ${done} done`);
    }
    if (allNames.length > 0) {
      options.push(`Agent types (${allNames.length})`);
    }
    options.push("Create new agent");
    options.push("Settings");
    const noAgentsMsg = allNames.length === 0 && agents2.length === 0 ? "No agents found. Create specialized subagents that can be delegated to.\n\nEach subagent has its own context window, custom system prompt, and specific tools.\n\nTry creating: Code Reviewer, Security Auditor, Test Writer, or Documentation Writer.\n\n" : "";
    if (noAgentsMsg) {
      ctx.ui.notify(noAgentsMsg, "info");
    }
    const choice = await ctx.ui.select("Agents", options);
    if (!choice)
      return;
    if (choice.startsWith("Running agents (")) {
      await showRunningAgents(ctx);
      await showAgentsMenu(ctx);
    } else if (choice.startsWith("Agent types (")) {
      await showAllAgentsList(ctx);
      await showAgentsMenu(ctx);
    } else if (choice === "Create new agent") {
      await showCreateWizard(ctx);
    } else if (choice === "Settings") {
      await showSettings(ctx);
      await showAgentsMenu(ctx);
    }
  }
  async function showAllAgentsList(ctx) {
    const allNames = getAllTypes();
    if (allNames.length === 0) {
      ctx.ui.notify("No agents.", "info");
      return;
    }
    const sourceIndicator = (cfg) => {
      const disabled = cfg?.enabled === false;
      if (cfg?.source === "project")
        return disabled ? "\u2715\u2022 " : "\u2022  ";
      if (cfg?.source === "global")
        return disabled ? "\u2715\u25E6 " : "\u25E6  ";
      if (disabled)
        return "\u2715  ";
      return "   ";
    };
    const entries = allNames.map((name) => {
      const cfg = getAgentConfig(name);
      const disabled = cfg?.enabled === false;
      const model = getModelLabel(name, ctx.modelRegistry);
      const indicator = sourceIndicator(cfg);
      const prefix = `${indicator}${name} \xB7 ${model}`;
      const desc = disabled ? "(disabled)" : cfg?.description ?? name;
      return { name, prefix, desc };
    });
    const maxPrefix = Math.max(...entries.map((e) => e.prefix.length));
    const hasCustom = allNames.some((n) => {
      const c = getAgentConfig(n);
      return c && !c.isDefault && c.enabled !== false;
    });
    const hasDisabled = allNames.some((n) => getAgentConfig(n)?.enabled === false);
    const legendParts = [];
    if (hasCustom)
      legendParts.push("\u2022 = project  \u25E6 = global");
    if (hasDisabled)
      legendParts.push("\u2715 = disabled");
    const legend = legendParts.length ? "\n" + legendParts.join("  ") : "";
    const options = entries.map(({ prefix, desc }) => `${prefix.padEnd(maxPrefix)} \u2014 ${desc}`);
    if (legend)
      options.push(legend);
    const choice = await ctx.ui.select("Agent types", options);
    if (!choice)
      return;
    const agentName = choice.split(" \xB7 ")[0].replace(/^[•◦✕\s]+/, "").trim();
    if (getAgentConfig(agentName)) {
      await showAgentDetail(ctx, agentName);
      await showAllAgentsList(ctx);
    }
  }
  async function showRunningAgents(ctx) {
    const agents2 = manager.listAgents();
    if (agents2.length === 0) {
      ctx.ui.notify("No agents.", "info");
      return;
    }
    const options = agents2.map((a) => {
      const dn = getDisplayName(a.type);
      const dur = formatDuration(a.startedAt, a.completedAt);
      return `${dn} (${a.description}) \xB7 ${a.toolUses} tools \xB7 ${a.status} \xB7 ${dur}`;
    });
    const choice = await ctx.ui.select("Running agents", options);
    if (!choice)
      return;
    const idx = options.indexOf(choice);
    if (idx < 0)
      return;
    const record = agents2[idx];
    await viewAgentConversation(ctx, record);
    await showRunningAgents(ctx);
  }
  async function viewAgentConversation(ctx, record) {
    if (!record.session) {
      ctx.ui.notify(`Agent is ${record.status === "queued" ? "queued" : "expired"} \u2014 no session available.`, "info");
      return;
    }
    const { ConversationViewer: ConversationViewer2 } = await Promise.resolve().then(() => (init_conversation_viewer(), conversation_viewer_exports));
    const session = record.session;
    const activity = agentActivity.get(record.id);
    await ctx.ui.custom((tui, theme, _keybindings, done) => {
      return new ConversationViewer2(tui, session, record, activity, theme, done);
    }, {
      overlay: true,
      overlayOptions: { anchor: "center", width: "90%" }
    });
  }
  async function showAgentDetail(ctx, name) {
    const cfg = getAgentConfig(name);
    if (!cfg) {
      ctx.ui.notify(`Agent config not found for "${name}".`, "warning");
      return;
    }
    const file = findAgentFile(name);
    const isDefault = cfg.isDefault === true;
    const disabled = cfg.enabled === false;
    let menuOptions;
    if (disabled && file) {
      menuOptions = isDefault ? ["Enable", "Edit", "Reset to default", "Delete", "Back"] : ["Enable", "Edit", "Delete", "Back"];
    } else if (isDefault && !file) {
      menuOptions = ["Eject (export as .md)", "Disable", "Back"];
    } else if (isDefault && file) {
      menuOptions = ["Edit", "Disable", "Reset to default", "Delete", "Back"];
    } else {
      menuOptions = ["Edit", "Disable", "Delete", "Back"];
    }
    const choice = await ctx.ui.select(name, menuOptions);
    if (!choice || choice === "Back")
      return;
    if (choice === "Edit" && file) {
      const content = readFileSync3(file.path, "utf-8");
      const edited = await ctx.ui.editor(`Edit ${name}`, content);
      if (edited !== void 0 && edited !== content) {
        const { writeFileSync: writeFileSync2 } = await import("node:fs");
        writeFileSync2(file.path, edited, "utf-8");
        reloadCustomAgents();
        ctx.ui.notify(`Updated ${file.path}`, "info");
      }
    } else if (choice === "Delete") {
      if (file) {
        const confirmed = await ctx.ui.confirm("Delete agent", `Delete ${name} from ${file.location} (${file.path})?`);
        if (confirmed) {
          unlinkSync(file.path);
          reloadCustomAgents();
          ctx.ui.notify(`Deleted ${file.path}`, "info");
        }
      }
    } else if (choice === "Reset to default" && file) {
      const confirmed = await ctx.ui.confirm("Reset to default", `Delete override ${file.path} and restore embedded default?`);
      if (confirmed) {
        unlinkSync(file.path);
        reloadCustomAgents();
        ctx.ui.notify(`Restored default ${name}`, "info");
      }
    } else if (choice.startsWith("Eject")) {
      await ejectAgent(ctx, name, cfg);
    } else if (choice === "Disable") {
      await disableAgent(ctx, name);
    } else if (choice === "Enable") {
      await enableAgent(ctx, name);
    }
  }
  async function ejectAgent(ctx, name, cfg) {
    const location = await ctx.ui.select("Choose location", [
      "Project (.pi/agents/)",
      "Personal (~/.pi/agent/agents/)"
    ]);
    if (!location)
      return;
    const targetDir = location.startsWith("Project") ? projectAgentsDir() : personalAgentsDir();
    mkdirSync3(targetDir, { recursive: true });
    const targetPath = join6(targetDir, `${name}.md`);
    if (existsSync4(targetPath)) {
      const overwrite = await ctx.ui.confirm("Overwrite", `${targetPath} already exists. Overwrite?`);
      if (!overwrite)
        return;
    }
    const fmFields = [];
    fmFields.push(`description: ${cfg.description}`);
    if (cfg.displayName)
      fmFields.push(`display_name: ${cfg.displayName}`);
    fmFields.push(`tools: ${cfg.builtinToolNames?.join(", ") || "all"}`);
    if (cfg.model)
      fmFields.push(`model: ${cfg.model}`);
    if (cfg.thinking)
      fmFields.push(`thinking: ${cfg.thinking}`);
    if (cfg.maxTurns)
      fmFields.push(`max_turns: ${cfg.maxTurns}`);
    fmFields.push(`prompt_mode: ${cfg.promptMode}`);
    if (cfg.extensions === false)
      fmFields.push("extensions: false");
    else if (Array.isArray(cfg.extensions))
      fmFields.push(`extensions: ${cfg.extensions.join(", ")}`);
    if (cfg.skills === false)
      fmFields.push("skills: false");
    else if (Array.isArray(cfg.skills))
      fmFields.push(`skills: ${cfg.skills.join(", ")}`);
    if (cfg.disallowedTools?.length)
      fmFields.push(`disallowed_tools: ${cfg.disallowedTools.join(", ")}`);
    if (cfg.inheritContext)
      fmFields.push("inherit_context: true");
    if (cfg.runInBackground)
      fmFields.push("run_in_background: true");
    if (cfg.isolated)
      fmFields.push("isolated: true");
    if (cfg.memory)
      fmFields.push(`memory: ${cfg.memory}`);
    if (cfg.isolation)
      fmFields.push(`isolation: ${cfg.isolation}`);
    const content = `---
${fmFields.join("\n")}
---

${cfg.systemPrompt}
`;
    const { writeFileSync: writeFileSync2 } = await import("node:fs");
    writeFileSync2(targetPath, content, "utf-8");
    reloadCustomAgents();
    ctx.ui.notify(`Ejected ${name} to ${targetPath}`, "info");
  }
  async function disableAgent(ctx, name) {
    const file = findAgentFile(name);
    if (file) {
      const content = readFileSync3(file.path, "utf-8");
      if (content.includes("\nenabled: false\n")) {
        ctx.ui.notify(`${name} is already disabled.`, "info");
        return;
      }
      const updated = content.replace(/^---\n/, "---\nenabled: false\n");
      const { writeFileSync: writeFileSync3 } = await import("node:fs");
      writeFileSync3(file.path, updated, "utf-8");
      reloadCustomAgents();
      ctx.ui.notify(`Disabled ${name} (${file.path})`, "info");
      return;
    }
    const location = await ctx.ui.select("Choose location", [
      "Project (.pi/agents/)",
      "Personal (~/.pi/agent/agents/)"
    ]);
    if (!location)
      return;
    const targetDir = location.startsWith("Project") ? projectAgentsDir() : personalAgentsDir();
    mkdirSync3(targetDir, { recursive: true });
    const targetPath = join6(targetDir, `${name}.md`);
    const { writeFileSync: writeFileSync2 } = await import("node:fs");
    writeFileSync2(targetPath, "---\nenabled: false\n---\n", "utf-8");
    reloadCustomAgents();
    ctx.ui.notify(`Disabled ${name} (${targetPath})`, "info");
  }
  async function enableAgent(ctx, name) {
    const file = findAgentFile(name);
    if (!file)
      return;
    const content = readFileSync3(file.path, "utf-8");
    const updated = content.replace(/^(---\n)enabled: false\n/, "$1");
    const { writeFileSync: writeFileSync2 } = await import("node:fs");
    if (updated.trim() === "---\n---" || updated.trim() === "---\n---\n") {
      unlinkSync(file.path);
      reloadCustomAgents();
      ctx.ui.notify(`Enabled ${name} (removed ${file.path})`, "info");
    } else {
      writeFileSync2(file.path, updated, "utf-8");
      reloadCustomAgents();
      ctx.ui.notify(`Enabled ${name} (${file.path})`, "info");
    }
  }
  async function showCreateWizard(ctx) {
    const location = await ctx.ui.select("Choose location", [
      "Project (.pi/agents/)",
      "Personal (~/.pi/agent/agents/)"
    ]);
    if (!location)
      return;
    const targetDir = location.startsWith("Project") ? projectAgentsDir() : personalAgentsDir();
    const method = await ctx.ui.select("Creation method", [
      "Generate with Claude (recommended)",
      "Manual configuration"
    ]);
    if (!method)
      return;
    if (method.startsWith("Generate")) {
      await showGenerateWizard(ctx, targetDir);
    } else {
      await showManualWizard(ctx, targetDir);
    }
  }
  async function showGenerateWizard(ctx, targetDir) {
    const description = await ctx.ui.input("Describe what this agent should do");
    if (!description)
      return;
    const name = await ctx.ui.input("Agent name (filename, no spaces)");
    if (!name)
      return;
    mkdirSync3(targetDir, { recursive: true });
    const targetPath = join6(targetDir, `${name}.md`);
    if (existsSync4(targetPath)) {
      const overwrite = await ctx.ui.confirm("Overwrite", `${targetPath} already exists. Overwrite?`);
      if (!overwrite)
        return;
    }
    ctx.ui.notify("Generating agent definition...", "info");
    const generatePrompt = `Create a custom pi sub-agent definition file based on this description: "${description}"

Write a markdown file to: ${targetPath}

The file format is a markdown file with YAML frontmatter and a system prompt body:

\`\`\`markdown
---
description: <one-line description shown in UI>
tools: <comma-separated built-in tools: read, bash, edit, write, grep, find, ls. Use "none" for no tools. Omit for all tools>
model: <optional model as "provider/modelId", e.g. "anthropic/claude-haiku-4-5-20251001". Omit to inherit parent model>
thinking: <optional thinking level: off, minimal, low, medium, high, xhigh. Omit to inherit>
max_turns: <optional max agentic turns. 0 or omit for unlimited (default)>
prompt_mode: <"replace" (body IS the full system prompt) or "append" (body is appended to default prompt). Default: replace>
extensions: <true (inherit all MCP/extension tools), false (none), or comma-separated names. Default: true>
skills: <true (inherit all), false (none), or comma-separated skill names to preload into prompt. Default: true>
disallowed_tools: <comma-separated tool names to block, even if otherwise available. Omit for none>
inherit_context: <true to fork parent conversation into agent so it sees chat history. Default: false>
run_in_background: <true to run in background by default. Default: false>
isolated: <true for no extension/MCP tools, only built-in tools. Default: false>
memory: <"user" (global), "project" (per-project), or "local" (gitignored per-project) for persistent memory. Omit for none>
isolation: <"worktree" to run in isolated git worktree. Omit for normal>
---

<system prompt body \u2014 instructions for the agent>
\`\`\`

Guidelines for choosing settings:
- For read-only tasks (review, analysis): tools: read, bash, grep, find, ls
- For code modification tasks: include edit, write
- Use prompt_mode: append if the agent should keep the default system prompt and add specialization on top
- Use prompt_mode: replace for fully custom agents with their own personality/instructions
- Set inherit_context: true if the agent needs to know what was discussed in the parent conversation
- Set isolated: true if the agent should NOT have access to MCP servers or other extensions
- Only include frontmatter fields that differ from defaults \u2014 omit fields where the default is fine

Write the file using the write tool. Only write the file, nothing else.`;
    const record = await manager.spawnAndWait(pi, ctx, "general-purpose", generatePrompt, {
      description: `Generate ${name} agent`,
      maxTurns: 5
    });
    if (record.status === "error") {
      ctx.ui.notify(`Generation failed: ${record.error}`, "warning");
      return;
    }
    reloadCustomAgents();
    if (existsSync4(targetPath)) {
      ctx.ui.notify(`Created ${targetPath}`, "info");
    } else {
      ctx.ui.notify("Agent generation completed but file was not created. Check the agent output.", "warning");
    }
  }
  async function showManualWizard(ctx, targetDir) {
    const name = await ctx.ui.input("Agent name (filename, no spaces)");
    if (!name)
      return;
    const description = await ctx.ui.input("Description (one line)");
    if (!description)
      return;
    const toolChoice = await ctx.ui.select("Tools", ["all", "none", "read-only (read, bash, grep, find, ls)", "custom..."]);
    if (!toolChoice)
      return;
    let tools;
    if (toolChoice === "all") {
      tools = BUILTIN_TOOL_NAMES.join(", ");
    } else if (toolChoice === "none") {
      tools = "none";
    } else if (toolChoice.startsWith("read-only")) {
      tools = "read, bash, grep, find, ls";
    } else {
      const customTools = await ctx.ui.input("Tools (comma-separated)", BUILTIN_TOOL_NAMES.join(", "));
      if (!customTools)
        return;
      tools = customTools;
    }
    const modelChoice = await ctx.ui.select("Model", [
      "inherit (parent model)",
      "haiku",
      "sonnet",
      "opus",
      "custom..."
    ]);
    if (!modelChoice)
      return;
    let modelLine = "";
    if (modelChoice === "haiku")
      modelLine = "\nmodel: anthropic/claude-haiku-4-5-20251001";
    else if (modelChoice === "sonnet")
      modelLine = "\nmodel: anthropic/claude-sonnet-4-6";
    else if (modelChoice === "opus")
      modelLine = "\nmodel: anthropic/claude-opus-4-6";
    else if (modelChoice === "custom...") {
      const customModel = await ctx.ui.input("Model (provider/modelId)");
      if (customModel)
        modelLine = `
model: ${customModel}`;
    }
    const thinkingChoice = await ctx.ui.select("Thinking level", [
      "inherit",
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh"
    ]);
    if (!thinkingChoice)
      return;
    let thinkingLine = "";
    if (thinkingChoice !== "inherit")
      thinkingLine = `
thinking: ${thinkingChoice}`;
    const systemPrompt = await ctx.ui.editor("System prompt", "");
    if (systemPrompt === void 0)
      return;
    const content = `---
description: ${description}
tools: ${tools}${modelLine}${thinkingLine}
prompt_mode: replace
---

${systemPrompt}
`;
    mkdirSync3(targetDir, { recursive: true });
    const targetPath = join6(targetDir, `${name}.md`);
    if (existsSync4(targetPath)) {
      const overwrite = await ctx.ui.confirm("Overwrite", `${targetPath} already exists. Overwrite?`);
      if (!overwrite)
        return;
    }
    const { writeFileSync: writeFileSync2 } = await import("node:fs");
    writeFileSync2(targetPath, content, "utf-8");
    reloadCustomAgents();
    ctx.ui.notify(`Created ${targetPath}`, "info");
  }
  async function showSettings(ctx) {
    const choice = await ctx.ui.select("Settings", [
      `Max concurrency (current: ${manager.getMaxConcurrent()})`,
      `Default max turns (current: ${getDefaultMaxTurns() ?? "unlimited"})`,
      `Grace turns (current: ${getGraceTurns()})`,
      `Join mode (current: ${getDefaultJoinMode()})`
    ]);
    if (!choice)
      return;
    if (choice.startsWith("Max concurrency")) {
      const val = await ctx.ui.input("Max concurrent background agents", String(manager.getMaxConcurrent()));
      if (val) {
        const n = parseInt(val, 10);
        if (n >= 1) {
          manager.setMaxConcurrent(n);
          ctx.ui.notify(`Max concurrency set to ${n}`, "info");
        } else {
          ctx.ui.notify("Must be a positive integer.", "warning");
        }
      }
    } else if (choice.startsWith("Default max turns")) {
      const val = await ctx.ui.input("Default max turns before wrap-up (0 = unlimited)", String(getDefaultMaxTurns() ?? 0));
      if (val) {
        const n = parseInt(val, 10);
        if (n === 0) {
          setDefaultMaxTurns(void 0);
          ctx.ui.notify("Default max turns set to unlimited", "info");
        } else if (n >= 1) {
          setDefaultMaxTurns(n);
          ctx.ui.notify(`Default max turns set to ${n}`, "info");
        } else {
          ctx.ui.notify("Must be 0 (unlimited) or a positive integer.", "warning");
        }
      }
    } else if (choice.startsWith("Grace turns")) {
      const val = await ctx.ui.input("Grace turns after wrap-up steer", String(getGraceTurns()));
      if (val) {
        const n = parseInt(val, 10);
        if (n >= 1) {
          setGraceTurns(n);
          ctx.ui.notify(`Grace turns set to ${n}`, "info");
        } else {
          ctx.ui.notify("Must be a positive integer.", "warning");
        }
      }
    } else if (choice.startsWith("Join mode")) {
      const val = await ctx.ui.select("Default join mode for background agents", [
        "smart \u2014 auto-group 2+ agents in same turn (default)",
        "async \u2014 always notify individually",
        "group \u2014 always group background agents"
      ]);
      if (val) {
        const mode = val.split(" ")[0];
        setDefaultJoinMode(mode);
        ctx.ui.notify(`Default join mode set to ${mode}`, "info");
      }
    }
  }
  pi.registerCommand("agents", {
    description: "Manage agents",
    handler: async (_args, ctx) => {
      await showAgentsMenu(ctx);
    }
  });
}
export {
  dist_default as default
};
