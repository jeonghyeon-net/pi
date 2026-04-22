// node_modules/@jeonghyeon.net/pi-supervisor/src/state.ts
var ENTRY_TYPE = "supervisor-state";
var DEFAULT_PROVIDER = "anthropic";
var DEFAULT_MODEL_ID = "claude-haiku-4-5-20251001";
var DEFAULT_SENSITIVITY = "medium";
var SupervisorStateManager = class {
  state = null;
  pi;
  constructor(pi) {
    this.pi = pi;
  }
  start(outcome, provider, modelId, sensitivity) {
    this.state = {
      active: true,
      outcome,
      provider,
      modelId,
      sensitivity,
      interventions: [],
      startedAt: Date.now(),
      turnCount: 0
    };
    this.persist();
  }
  stop() {
    if (!this.state) return;
    this.state.active = false;
    this.persist();
  }
  isActive() {
    return this.state?.active === true;
  }
  getState() {
    return this.state;
  }
  addIntervention(intervention) {
    if (!this.state) return;
    this.state.interventions.push(intervention);
    this.persist();
  }
  incrementTurnCount() {
    if (!this.state) return;
    this.state.turnCount++;
  }
  setModel(provider, modelId) {
    if (!this.state) return;
    this.state.provider = provider;
    this.state.modelId = modelId;
    this.persist();
  }
  setSensitivity(sensitivity) {
    if (!this.state) return;
    this.state.sensitivity = sensitivity;
    this.persist();
  }
  /** Restore state from session entries (finds the most recent supervisor-state entry). */
  loadFromSession(ctx) {
    const entries = ctx.sessionManager.getBranch();
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type === "custom" && entry.customType === ENTRY_TYPE) {
        this.state = entry.data;
        return;
      }
    }
    this.state = null;
  }
  persist() {
    if (!this.state) return;
    this.pi.appendEntry(ENTRY_TYPE, { ...this.state });
  }
};

// node_modules/@jeonghyeon.net/pi-supervisor/src/engine.ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// node_modules/@jeonghyeon.net/pi-supervisor/src/model-client.ts
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  SettingsManager
} from "@mariozechner/pi-coding-agent";
async function callModel(ctx, provider, modelId, systemPrompt, userPrompt, signal, onDelta) {
  const model = ctx.modelRegistry.find(provider, modelId);
  if (!model) return null;
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(ctx.cwd, agentDir);
  const loader = new DefaultResourceLoader({
    cwd: ctx.cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    systemPromptOverride: () => systemPrompt
  });
  await loader.reload();
  let session;
  try {
    const result = await createAgentSession({
      cwd: ctx.cwd,
      sessionManager: SessionManager.inMemory(ctx.cwd),
      settingsManager,
      modelRegistry: ctx.modelRegistry,
      model,
      tools: [],
      resourceLoader: loader
    });
    session = result.session;
  } catch {
    return null;
  }
  const onAbort = () => session.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  let responseText = "";
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      responseText += event.assistantMessageEvent.delta;
      onDelta?.(responseText);
    }
  });
  try {
    await session.prompt(userPrompt);
  } catch {
    return null;
  } finally {
    unsubscribe();
    signal?.removeEventListener("abort", onAbort);
    session.dispose();
  }
  return responseText;
}
async function callSupervisorModel(ctx, provider, modelId, systemPrompt, userPrompt, signal, onDelta) {
  const text = await callModel(ctx, provider, modelId, systemPrompt, userPrompt, signal, onDelta);
  if (text === null) return safeContinue("Model call failed");
  return parseDecision(text);
}
function parseDecision(text) {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) ?? text.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch?.[1] ?? text.trim();
  try {
    const parsed = JSON.parse(jsonStr);
    const action = parsed.action;
    if (action !== "continue" && action !== "steer" && action !== "done") {
      return safeContinue("Invalid action in supervisor response");
    }
    return {
      action,
      message: typeof parsed.message === "string" ? parsed.message.trim() : void 0,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5
    };
  } catch {
    return safeContinue("Failed to parse supervisor JSON decision");
  }
}
function safeContinue(reason) {
  return { action: "continue", reasoning: reason, confidence: 0 };
}

// node_modules/@jeonghyeon.net/pi-supervisor/src/engine.ts
var SUPERVISOR_MD = "SUPERVISOR.md";
var CONFIG_DIR = ".pi";
var GLOBAL_AGENT_DIR = join(homedir(), ".pi", "agent");
var BUILTIN_SYSTEM_PROMPT = `You are a supervisor monitoring a coding AI assistant conversation.
Your job: ensure the assistant fully achieves a specific outcome without needing the human to intervene.

\u2550\u2550\u2550 WHEN THE AGENT IS IDLE (finished its turn, waiting for user input) \u2550\u2550\u2550
This is your most important moment. The agent has stopped and is waiting.
You MUST choose "done" or "steer". Never return "continue" when the agent is idle.

- "done"  \u2192 only when the outcome is completely and verifiably achieved.
- "steer" \u2192 everything else: incomplete work, partial progress, open questions, waiting for confirmation.

If the agent asked a clarifying question or needs a decision:
  FIRST check: is this question necessary to achieve the goal?
  - YES (directly blocks goal progress): answer with a sensible default and tell agent to proceed.
  - NO (out of scope, nice-to-have, unrelated feature): do NOT answer it. Redirect:
    "That's outside the scope of the goal. Focus on: [restate the specific missing piece of the goal]."
  DO NOT answer: passwords, credentials, secrets, anything requiring real user knowledge.

Your steer message speaks AS the user. Make it clear, direct, and actionable (1\u20133 sentences).
Do not ask the agent to verify its own work \u2014 tell it what to do next.

\u2550\u2550\u2550 WHEN THE AGENT IS ACTIVELY WORKING (mid-turn) \u2550\u2550\u2550
Only intervene if it is clearly heading in the wrong direction.
Trust the agent to complete what it has started. Avoid interrupting productive work.

\u2550\u2550\u2550 STEERING RULES \u2550\u2550\u2550
- Be specific: reference the outcome, missing pieces, or the question being answered.
- Never repeat a steering message that had no effect \u2014 escalate or change approach.
- A good steer answers the agent's question OR redirects to the missing piece of the outcome.
- If the agent is taking shortcuts to satisfy the goal without properly achieving it, always steer and remind it not to take shortcuts.

"done" CRITERIA: The core outcome is complete and functional. Minor polish, style tweaks, or
optional improvements do NOT block "done". Prefer stopping when the goal is substantially
achieved rather than looping forever chasing perfection.

Respond ONLY with valid JSON \u2014 no prose, no markdown fences.
Response schema (strict JSON):
{
  "action": "continue" | "steer" | "done",
  "message": "...",     // Required when action === "steer"
  "reasoning": "...",   // Brief internal reasoning
  "confidence": 0.85    // Float 0-1
}`;
function loadSystemPrompt(cwd) {
  const projectPath = join(cwd, CONFIG_DIR, SUPERVISOR_MD);
  if (existsSync(projectPath)) {
    return { prompt: readFileSync(projectPath, "utf-8").trim(), source: projectPath };
  }
  const globalPath = join(GLOBAL_AGENT_DIR, SUPERVISOR_MD);
  if (existsSync(globalPath)) {
    return { prompt: readFileSync(globalPath, "utf-8").trim(), source: globalPath };
  }
  return { prompt: BUILTIN_SYSTEM_PROMPT, source: "built-in" };
}
var MESSAGE_LIMITS = {
  low: 6,
  medium: 12,
  high: 20
};
function extractCompactionSummary(ctx) {
  let summary = null;
  for (const entry of ctx.sessionManager.getBranch()) {
    if ((entry.type === "compaction" || entry.type === "branch_summary") && typeof entry.summary === "string") {
      summary = entry.summary;
    }
  }
  return summary;
}
function buildSnapshot(ctx, limit) {
  const messages = [];
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "message") continue;
    const msg = entry.message;
    if (!msg) continue;
    if (msg.role === "user") {
      const content = extractText(msg.content);
      if (content) messages.push({ role: "user", content });
    } else if (msg.role === "assistant") {
      const content = extractAssistantText(msg.content);
      if (content) messages.push({ role: "assistant", content });
    }
  }
  return messages.slice(-limit);
}
function extractText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  }
  return "";
}
function extractAssistantText(content) {
  if (!Array.isArray(content)) return "";
  const textParts = content.filter((b) => b.type === "text").map((b) => b.text);
  return textParts.join("\n").trim();
}
function buildUserPrompt(state, snapshot, agentIsIdle, stagnating, compactionSummary) {
  const interventionHistory = state.interventions.length === 0 ? "None yet." : state.interventions.slice(-5).map((iv, i) => `[${i + 1}] Turn ${iv.turnCount}: "${iv.message}"`).join("\n");
  const conversationText = snapshot.length === 0 ? "(No conversation yet)" : snapshot.map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`).join("\n\n---\n\n");
  const agentStatus = agentIsIdle ? `AGENT STATUS: IDLE \u2014 the agent has finished its turn and is now waiting for user input.
You MUST return "done" or "steer". Returning "continue" here means the agent stays idle forever.` : `AGENT STATUS: WORKING \u2014 the agent is actively processing. Only intervene if clearly off track.`;
  const stagnationWarning = stagnating ? `
\u26A0 STAGNATION: The supervisor has sent ${state.interventions.length} steering messages with no "done" verdict.
The agent is making diminishing improvements. Apply a lenient standard:
- If the core goal is substantially achieved (\u226580%), return "done".
- Only return "steer" if a CRITICAL piece is still missing \u2014 not minor polish.
- Prefer stopping over looping forever on perfection.` : "";
  const summarySection = compactionSummary ? `CONVERSATION SUMMARY (earlier history, before recent messages):
${compactionSummary}

` : "";
  return `DESIRED OUTCOME:
${state.outcome}

SENSITIVITY: ${state.sensitivity}
(low = check only at end of each run, steer if seriously off track; medium = also check every 3rd tool cycle mid-run, steer on clear drift; high = check every tool cycle, steer proactively)

${agentStatus}${stagnationWarning}

${summarySection}RECENT CONVERSATION (last ${snapshot.length} messages):
${conversationText}

PREVIOUS INTERVENTIONS BY YOU:
${interventionHistory}

REMINDER \u2014 DESIRED OUTCOME:
${state.outcome}

Has this outcome been fully achieved? Analyze and respond with JSON only.`;
}
async function analyze(ctx, state, agentIsIdle, stagnating, signal, onDelta) {
  const { prompt: systemPrompt } = loadSystemPrompt(ctx.cwd);
  const limit = MESSAGE_LIMITS[state.sensitivity] ?? 12;
  const snapshot = buildSnapshot(ctx, limit);
  const compactionSummary = extractCompactionSummary(ctx);
  const userPrompt = buildUserPrompt(state, snapshot, agentIsIdle, stagnating, compactionSummary);
  try {
    return await callSupervisorModel(ctx, state.provider, state.modelId, systemPrompt, userPrompt, signal, onDelta);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { action: "continue", reasoning: `Analysis error: ${detail}`, confidence: 0 };
  }
}

// node_modules/@jeonghyeon.net/pi-supervisor/src/ui/status-widget.ts
import { truncateToWidth } from "@mariozechner/pi-tui";
var WIDGET_ID = "supervisor";
var STATUS_ID = "supervisor";
var MAX_OUTCOME_DISPLAY = 48;
var MAX_STEER_DISPLAY = 50;
var MAX_THINKING_DISPLAY = 80;
var _widgetVisible = true;
function toggleWidget() {
  _widgetVisible = !_widgetVisible;
  return _widgetVisible;
}
function isWidgetVisible() {
  return _widgetVisible;
}
function truncate(s, max) {
  return s.length <= max ? s : s.slice(0, max - 1) + "\u2026";
}
function updateUI(ctx, state, action = { type: "watching" }) {
  if (!state || !state.active) {
    ctx.ui.setStatus(STATUS_ID, void 0);
    ctx.ui.setWidget(WIDGET_ID, void 0);
    return;
  }
  ctx.ui.setStatus(STATUS_ID, "\u{1F3AF}");
  if (!_widgetVisible) {
    ctx.ui.setWidget(WIDGET_ID, void 0);
    return;
  }
  const snap = {
    outcome: state.outcome,
    modelId: state.modelId,
    interventions: [...state.interventions]
  };
  const snapAction = action;
  ctx.ui.setWidget(WIDGET_ID, (_tui, theme) => {
    const steerCount = snap.interventions.length;
    const header = `${theme.fg("accent", "\u25C9")} ${theme.fg("accent", "Supervising")}`;
    const goalLabel = theme.fg("dim", "Goal:");
    const goalText = theme.fg("muted", `"${truncate(snap.outcome, MAX_OUTCOME_DISPLAY)}"`);
    const goal = `${goalLabel} ${goalText}`;
    const model = theme.fg("dim", snap.modelId);
    const steers = steerCount > 0 ? theme.fg("dim", `\u2197 ${steerCount}`) : "";
    let actionStr;
    let thinking = "";
    switch (snapAction.type) {
      case "watching":
        actionStr = theme.fg("dim", "watching");
        break;
      case "analyzing":
        actionStr = theme.fg("warning", `\u27F3 turn ${snapAction.turn}`);
        thinking = snapAction.thinking ?? "";
        break;
      case "steering":
        actionStr = theme.fg("warning", `\u2197 "${truncate(snapAction.message, MAX_STEER_DISPLAY)}"`);
        break;
      case "done":
        actionStr = theme.fg("accent", "\u2713 done");
        break;
    }
    const sep = theme.fg("dim", " \xB7 ");
    const parts = [header, goal, model, steers, actionStr].filter(Boolean);
    const line = parts.join(sep);
    const thinkingLine = thinking ? theme.fg("dim", `  ${truncate(thinking, MAX_THINKING_DISPLAY)}`) : "";
    return {
      render: (width) => {
        const l1 = truncateToWidth(line, width);
        if (!thinkingLine) return [l1];
        return [l1, truncateToWidth(thinkingLine, width)];
      },
      invalidate: () => {
      }
    };
  });
}

// node_modules/@jeonghyeon.net/pi-supervisor/src/ui/model-picker.ts
import { ModelSelectorComponent, SettingsManager as SettingsManager2 } from "@mariozechner/pi-coding-agent";
async function pickModel(ctx, currentProvider, currentModelId) {
  const currentModel = currentProvider && currentModelId ? ctx.modelRegistry.find(currentProvider, currentModelId) : void 0;
  const settingsManager = SettingsManager2.inMemory();
  return ctx.ui.custom((tui, _theme, _kb, done) => {
    const component = new ModelSelectorComponent(
      tui,
      currentModel,
      settingsManager,
      ctx.modelRegistry,
      [],
      // no scoped-model cycling — we want the full model list
      (model) => done(model),
      () => done(null)
    );
    component.focused = true;
    return {
      render: (width) => component.render(width),
      invalidate: () => component.invalidate(),
      handleInput: (data) => {
        component.handleInput(data);
        tui.requestRender();
      }
    };
  });
}

// node_modules/@jeonghyeon.net/pi-supervisor/src/ui/settings-panel.ts
import { SettingsList } from "@mariozechner/pi-tui";
import { ModelSelectorComponent as ModelSelectorComponent2, SettingsManager as SettingsManager3 } from "@mariozechner/pi-coding-agent";
var SENSITIVITIES = ["low", "medium", "high"];
var SENSITIVITY_DESCRIPTIONS = {
  low: "Steer only when seriously off track (end of run only)",
  medium: "Steer on clear drift (end of run + every 3rd mid-turn)",
  high: "Proactive steering (end of run + every mid-turn)"
};
async function openSettings(ctx, state, defaultProvider, defaultModelId, defaultSensitivity) {
  const currentProvider = state?.provider ?? defaultProvider;
  const currentModelId = state?.modelId ?? defaultModelId;
  const currentSensitivity = state?.sensitivity ?? defaultSensitivity;
  const isActive = state?.active === true;
  const result = {};
  return ctx.ui.custom((tui, theme, _kb, done) => {
    const makeModelSubmenu = (currentValue, submenuDone) => {
      const [prov, mid] = currentValue.includes("/") ? [currentValue.split("/")[0], currentValue.split("/").slice(1).join("/")] : [currentProvider, currentValue];
      const currentModel = ctx.modelRegistry.find(prov, mid);
      const settingsManager = SettingsManager3.inMemory();
      const component = new ModelSelectorComponent2(
        tui,
        currentModel,
        settingsManager,
        ctx.modelRegistry,
        [],
        (model) => {
          result.model = { provider: model.provider, modelId: model.id };
          submenuDone(`${model.provider}/${model.id}`);
        },
        () => submenuDone()
      );
      component.focused = true;
      return component;
    };
    const items = [
      {
        id: "model",
        label: "Model",
        description: "Supervisor LLM model (Enter to browse)",
        currentValue: `${currentProvider}/${currentModelId}`,
        submenu: makeModelSubmenu
      },
      {
        id: "sensitivity",
        label: "Sensitivity",
        description: SENSITIVITY_DESCRIPTIONS[currentSensitivity],
        currentValue: currentSensitivity,
        values: [...SENSITIVITIES]
      },
      {
        id: "widget",
        label: "Widget",
        description: "Show/hide the supervisor widget in the footer",
        currentValue: isWidgetVisible() ? "visible" : "hidden",
        values: ["visible", "hidden"]
      }
    ];
    if (isActive) {
      items.push({
        id: "outcome",
        label: "Outcome",
        description: `Steers: ${state.interventions.length} \xB7 Turns: ${state.turnCount}`,
        currentValue: `"${state.outcome.length > 60 ? state.outcome.slice(0, 59) + "\u2026" : state.outcome}"`
      });
      items.push({
        id: "stop",
        label: "Stop Supervision",
        description: "Stop the active supervisor",
        currentValue: "",
        values: ["confirm"]
      });
    }
    const settingsTheme = {
      label: (text, selected) => selected ? theme.bold(theme.fg("accent", text)) : theme.fg("dim", text),
      value: (text, selected) => selected ? theme.fg("accent", text) : theme.fg("muted", text),
      description: (text) => theme.fg("dim", text),
      cursor: theme.fg("accent", "\u276F"),
      hint: (text) => theme.fg("dim", text)
    };
    const settingsList = new SettingsList(
      items,
      12,
      settingsTheme,
      (id, newValue) => {
        if (id === "sensitivity") {
          const sens = newValue;
          result.sensitivity = sens;
          settingsList.updateValue("sensitivity", sens);
        } else if (id === "widget") {
          result.widget = newValue === "visible";
        } else if (id === "stop" && newValue === "confirm") {
          result.action = "stop";
          done(result);
        }
      },
      () => {
        const hasChanges = result.model || result.sensitivity || result.widget !== void 0;
        done(hasChanges ? result : null);
      }
    );
    return {
      render: (width) => {
        const lines = [];
        const title = isActive ? `${theme.fg("accent", "\u25C9")} ${theme.bold("Supervisor Settings")} ${theme.fg("dim", "(active)")}` : `${theme.fg("dim", "\u25CB")} ${theme.bold("Supervisor Settings")}`;
        lines.push(title);
        lines.push(theme.fg("dim", "\u2500".repeat(Math.min(40, width))));
        lines.push(...settingsList.render(width));
        return lines;
      },
      invalidate: () => settingsList.invalidate(),
      handleInput: (data) => {
        settingsList.handleInput(data);
        tui.requestRender();
      }
    };
  });
}

// node_modules/@jeonghyeon.net/pi-supervisor/src/workspace-config.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, writeFileSync } from "node:fs";
import { join as join2 } from "node:path";
var PI_DIR = ".pi";
var CONFIG_FILE = "supervisor-config.json";
function loadWorkspaceModel(cwd) {
  const configPath = join2(cwd, PI_DIR, CONFIG_FILE);
  if (!existsSync2(configPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync2(configPath, "utf-8"));
    if (typeof parsed.provider === "string" && typeof parsed.modelId === "string") {
      return { provider: parsed.provider, modelId: parsed.modelId };
    }
  } catch {
  }
  return null;
}
function saveWorkspaceModel(cwd, provider, modelId) {
  const piDir = join2(cwd, PI_DIR);
  if (!existsSync2(piDir)) return false;
  try {
    writeFileSync(
      join2(piDir, CONFIG_FILE),
      JSON.stringify({ provider, modelId }, null, 2) + "\n",
      "utf-8"
    );
    return true;
  } catch {
    return false;
  }
}

// node_modules/@jeonghyeon.net/pi-supervisor/src/index.ts
import { Type } from "@sinclair/typebox";
function extractThinking(accumulated) {
  const keyIdx = accumulated.indexOf('"reasoning"');
  if (keyIdx === -1) return "";
  const after = accumulated.slice(keyIdx + '"reasoning"'.length);
  const openMatch = after.match(/^\s*:\s*"/);
  if (!openMatch) return "";
  const content = after.slice(openMatch[0].length);
  const closeIdx = content.search(/(?<!\\)"/);
  const raw = closeIdx === -1 ? content : content.slice(0, closeIdx);
  return raw.replace(/\\n/g, " ").replace(/\\"/g, '"').trim();
}
var MAX_IDLE_STEERS = 5;
var ANALYSIS_WARNING_INTERVAL_MS = 15e3;
function normalizeMessage(message) {
  return message.trim().replace(/\s+/g, " ");
}
function isDuplicateSteer(state, message) {
  const last = state.interventions[state.interventions.length - 1]?.message;
  return !!last && normalizeMessage(last) === normalizeMessage(message);
}
function src_default(pi) {
  const state = new SupervisorStateManager(pi);
  let currentCtx;
  let idleSteers = 0;
  let lastAnalysisWarningAt = 0;
  function maybeWarnAnalysisError(ctx, reasoning) {
    if (!reasoning.startsWith("Analysis error:")) return;
    const now = Date.now();
    if (now - lastAnalysisWarningAt < ANALYSIS_WARNING_INTERVAL_MS) return;
    lastAnalysisWarningAt = now;
    const detail = reasoning.slice("Analysis error:".length).trim() || "unknown error";
    ctx.ui.notify(`Supervisor analysis failed for this turn: ${detail}`, "warning");
  }
  function sendIdleSteer(message) {
    setTimeout(() => {
      try {
        pi.sendUserMessage(message);
      } catch {
        try {
          pi.sendUserMessage(message, { deliverAs: "followUp" });
        } catch {
        }
      }
    }, 0);
  }
  const onSessionLoad = (ctx) => {
    currentCtx = ctx;
    state.loadFromSession(ctx);
    updateUI(ctx, state.getState());
  };
  pi.on("session_start", async (_event, ctx) => onSessionLoad(ctx));
  pi.on("session_switch", async (_event, ctx) => onSessionLoad(ctx));
  pi.on("session_fork", async (_event, ctx) => onSessionLoad(ctx));
  pi.on("session_tree", async (_event, ctx) => onSessionLoad(ctx));
  pi.on("turn_start", async (_event, ctx) => {
    currentCtx = ctx;
  });
  pi.on("turn_end", async (event, ctx) => {
    currentCtx = ctx;
    if (!state.isActive()) return;
    const s = state.getState();
    if (s.sensitivity === "low") return;
    if (event.turnIndex < 2) return;
    if (s.sensitivity === "medium" && (event.turnIndex - 2) % 3 !== 0) return;
    let decision;
    try {
      decision = await analyze(
        ctx,
        s,
        false,
        false
        /* can't stagnate mid-turn */
      );
    } catch {
      return;
    }
    maybeWarnAnalysisError(ctx, decision.reasoning);
    const threshold = s.sensitivity === "medium" ? 0.9 : 0.85;
    if (decision.action === "steer" && decision.message && decision.confidence >= threshold && !isDuplicateSteer(s, decision.message)) {
      state.addIntervention({
        turnCount: s.turnCount,
        message: decision.message,
        reasoning: decision.reasoning,
        timestamp: Date.now()
      });
      updateUI(ctx, state.getState(), { type: "steering", message: decision.message });
      pi.sendUserMessage(decision.message, { deliverAs: "steer" });
    }
  });
  pi.on("agent_end", async (_event, ctx) => {
    currentCtx = ctx;
    if (!state.isActive()) return;
    state.incrementTurnCount();
    const s = state.getState();
    const stagnating = idleSteers >= MAX_IDLE_STEERS;
    updateUI(ctx, s, { type: "analyzing", turn: s.turnCount });
    const decision = await analyze(ctx, s, true, stagnating, void 0, (accumulated) => {
      const thinking = extractThinking(accumulated);
      updateUI(ctx, state.getState(), { type: "analyzing", turn: s.turnCount, thinking });
    });
    maybeWarnAnalysisError(ctx, decision.reasoning);
    if (decision.action === "steer" && decision.message && !isDuplicateSteer(s, decision.message)) {
      idleSteers++;
      state.addIntervention({
        turnCount: s.turnCount,
        message: decision.message,
        reasoning: decision.reasoning,
        timestamp: Date.now()
      });
      updateUI(ctx, state.getState(), { type: "steering", message: decision.message });
      sendIdleSteer(decision.message);
    } else if (decision.action === "done") {
      idleSteers = 0;
      updateUI(ctx, state.getState(), { type: "done" });
      const suffix = stagnating ? ` (stopped after ${MAX_IDLE_STEERS} steering attempts \u2014 goal substantially achieved)` : "";
      ctx.ui.notify(`Supervisor: outcome achieved! "${s.outcome}"${suffix}`, "info");
      state.stop();
      updateUI(ctx, state.getState());
    } else {
      updateUI(ctx, state.getState(), { type: "watching" });
    }
  });
  pi.registerCommand("supervise", {
    description: "Supervise the chat toward a desired outcome (/supervise <outcome>)",
    handler: async (args, ctx) => {
      currentCtx = ctx;
      const trimmed = args?.trim() ?? "";
      if (trimmed === "widget") {
        const visible = toggleWidget();
        if (state.isActive()) {
          updateUI(ctx, state.getState());
        }
        ctx.ui.notify(`Supervisor widget ${visible ? "shown" : "hidden"}.`, "info");
        return;
      }
      if (trimmed === "stop") {
        if (!state.isActive()) {
          ctx.ui.notify("Supervisor is not active.", "warning");
          return;
        }
        state.stop();
        idleSteers = 0;
        updateUI(ctx, state.getState());
        ctx.ui.notify("Supervisor stopped.", "info");
        return;
      }
      if (trimmed === "status") {
        const s = state.getState();
        if (!s) {
          ctx.ui.notify("No active supervision. Use /supervise <outcome> to start.", "info");
          return;
        }
        const result = await openSettings(ctx, s, DEFAULT_PROVIDER, DEFAULT_MODEL_ID, DEFAULT_SENSITIVITY);
        if (result?.model) {
          if (state.isActive()) state.setModel(result.model.provider, result.model.modelId);
          saveWorkspaceModel(ctx.cwd, result.model.provider, result.model.modelId);
        }
        if (result?.sensitivity && state.isActive()) state.setSensitivity(result.sensitivity);
        if (result?.widget !== void 0 && result.widget !== isWidgetVisible()) toggleWidget();
        if (result?.action === "stop" && state.isActive()) {
          state.stop();
          idleSteers = 0;
        }
        updateUI(ctx, state.getState());
        return;
      }
      if (trimmed === "model" || trimmed.startsWith("model ")) {
        const spec = trimmed.slice(5).trim();
        if (!spec) {
          const s = state.getState();
          const picked = await pickModel(ctx, s?.provider, s?.modelId);
          if (!picked) return;
          const provider3 = picked.provider;
          const modelId3 = picked.id;
          if (state.isActive()) {
            state.setModel(provider3, modelId3);
            updateUI(ctx, state.getState());
          }
          const saved2 = saveWorkspaceModel(ctx.cwd, provider3, modelId3);
          ctx.ui.notify(
            `Supervisor model set to ${provider3}/${modelId3}${state.isActive() ? "" : " (takes effect on next /supervise)"}` + (saved2 ? " \xB7 saved to .pi/" : ""),
            "info"
          );
          return;
        }
        const slashIdx = spec.indexOf("/");
        let provider2;
        let modelId2;
        if (slashIdx === -1) {
          provider2 = state.getState()?.provider ?? DEFAULT_PROVIDER;
          modelId2 = spec;
        } else {
          provider2 = spec.slice(0, slashIdx);
          modelId2 = spec.slice(slashIdx + 1);
        }
        if (state.isActive()) {
          state.setModel(provider2, modelId2);
          updateUI(ctx, state.getState());
        }
        const saved = saveWorkspaceModel(ctx.cwd, provider2, modelId2);
        ctx.ui.notify(
          `Supervisor model set to ${provider2}/${modelId2}${state.isActive() ? "" : " (takes effect on next /supervise)"}` + (saved ? " \xB7 saved to .pi/" : ""),
          "info"
        );
        return;
      }
      if (trimmed.startsWith("sensitivity ")) {
        const level = trimmed.slice(12).trim();
        if (level !== "low" && level !== "medium" && level !== "high") {
          ctx.ui.notify("Usage: /supervise sensitivity <low|medium|high>", "warning");
          return;
        }
        if (!state.isActive()) {
          ctx.ui.notify(`Sensitivity will be set to "${level}" on next /supervise.`, "info");
        } else {
          state.setSensitivity(level);
          updateUI(ctx, state.getState());
          ctx.ui.notify(`Supervisor sensitivity set to "${level}"`, "info");
        }
        return;
      }
      if (!trimmed || trimmed === "settings") {
        const s = state.getState();
        const result = await openSettings(ctx, s, DEFAULT_PROVIDER, DEFAULT_MODEL_ID, DEFAULT_SENSITIVITY);
        if (!result) return;
        if (result.model) {
          const { provider: p, modelId: m } = result.model;
          if (state.isActive()) {
            state.setModel(p, m);
          }
          const saved = saveWorkspaceModel(ctx.cwd, p, m);
          ctx.ui.notify(
            `Supervisor model set to ${p}/${m}${state.isActive() ? "" : " (takes effect on next /supervise)"}` + (saved ? " \xB7 saved to .pi/" : ""),
            "info"
          );
        }
        if (result.sensitivity) {
          if (state.isActive()) {
            state.setSensitivity(result.sensitivity);
          }
          ctx.ui.notify(`Supervisor sensitivity set to "${result.sensitivity}"`, "info");
        }
        if (result.widget !== void 0) {
          const currentlyVisible = isWidgetVisible();
          if (result.widget !== currentlyVisible) {
            toggleWidget();
          }
        }
        if (result.action === "stop" && state.isActive()) {
          state.stop();
          idleSteers = 0;
          ctx.ui.notify("Supervisor stopped.", "info");
        }
        updateUI(ctx, state.getState());
        return;
      }
      const existing = state.getState();
      const workspaceModel = loadWorkspaceModel(ctx.cwd);
      const sessionModel = ctx.model;
      let provider = existing?.provider ?? workspaceModel?.provider ?? sessionModel?.provider ?? DEFAULT_PROVIDER;
      let modelId = existing?.modelId ?? workspaceModel?.modelId ?? sessionModel?.id ?? DEFAULT_MODEL_ID;
      const sensitivity = existing?.sensitivity ?? DEFAULT_SENSITIVITY;
      if (!existing) {
        const apiKey = await ctx.modelRegistry.getApiKeyForProvider(provider);
        if (!apiKey) {
          ctx.ui.notify(`No API key for "${provider}/${modelId}" \u2014 pick a model with an available key.`, "warning");
          const picked = await pickModel(ctx, provider, modelId);
          if (!picked) return;
          provider = picked.provider;
          modelId = picked.id;
        }
      }
      state.start(trimmed, provider, modelId, sensitivity);
      idleSteers = 0;
      updateUI(ctx, state.getState());
      const { source } = loadSystemPrompt(ctx.cwd);
      const promptLabel = source === "built-in" ? "built-in prompt" : source.replace(ctx.cwd, ".");
      ctx.ui.notify(
        `Supervisor active: "${trimmed.slice(0, 50)}${trimmed.length > 50 ? "\u2026" : ""}" | ${provider}/${modelId} | ${promptLabel}`,
        "info"
      );
    }
  });
  pi.registerTool({
    name: "start_supervision",
    label: "Start Supervision",
    description: "Activate the supervisor to track the conversation toward a specific outcome. The supervisor will observe every turn and steer the agent if it drifts. Once supervision is active it is locked \u2014 only the user can change or stop it.",
    parameters: Type.Object({
      outcome: Type.String({
        description: "The desired end-state to supervise toward. Be specific and measurable (e.g. 'Implement JWT auth with refresh tokens and full test coverage')."
      }),
      sensitivity: Type.Optional(Type.Union([
        Type.Literal("low"),
        Type.Literal("medium"),
        Type.Literal("high")
      ], {
        description: "How aggressively to steer. low = only when seriously off track, medium = on mild drift (default), high = proactively + mid-turn checks."
      })),
      model: Type.Optional(Type.String({
        description: "Supervisor model as 'provider/modelId' (e.g. 'anthropic/claude-haiku-4-5-20251001'). Defaults to workspace config, then the active chat model."
      }))
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const text = (msg) => ({ content: [{ type: "text", text: msg }], details: void 0 });
      if (state.isActive()) {
        const s = state.getState();
        return text(
          `Supervision is already active and cannot be changed by the model.
Active outcome: "${s.outcome}"
Only the user can stop or modify supervision via /supervise.`
        );
      }
      const sensitivity = params.sensitivity ?? DEFAULT_SENSITIVITY;
      let provider;
      let modelId;
      if (params.model) {
        const slash = params.model.indexOf("/");
        provider = slash === -1 ? DEFAULT_PROVIDER : params.model.slice(0, slash);
        modelId = slash === -1 ? params.model : params.model.slice(slash + 1);
      } else {
        const workspaceModel = loadWorkspaceModel(ctx.cwd);
        const sessionModel = ctx.model;
        provider = workspaceModel?.provider ?? sessionModel?.provider ?? DEFAULT_PROVIDER;
        modelId = workspaceModel?.modelId ?? sessionModel?.id ?? DEFAULT_MODEL_ID;
      }
      state.start(params.outcome, provider, modelId, sensitivity);
      idleSteers = 0;
      currentCtx = ctx;
      updateUI(ctx, state.getState());
      const { source } = loadSystemPrompt(ctx.cwd);
      const promptLabel = source === "built-in" ? "built-in prompt" : ".pi/SUPERVISOR.md";
      ctx.ui.notify(
        `Supervisor started by agent: "${params.outcome.slice(0, 60)}${params.outcome.length > 60 ? "\u2026" : ""}" | ${provider}/${modelId} | sensitivity: ${sensitivity} | ${promptLabel}`,
        "info"
      );
      return text(`Supervision active. Outcome: "${params.outcome}" | ${provider}/${modelId} | sensitivity: ${sensitivity}`);
    }
  });
}
export {
  src_default as default
};
