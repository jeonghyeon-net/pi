// src/state.ts
var todos = [];
var nextId = 1;
function getState() {
  return { todos: [...todos], nextId };
}
function getTodos() {
  return todos;
}
function addTodo(text) {
  const todo = { id: nextId++, text, done: false };
  todos.push(todo);
  return todo;
}
function toggleTodo(id) {
  const todo = todos.find((t) => t.id === id);
  if (todo) todo.done = !todo.done;
  return todo;
}
function clearTodos() {
  const count = todos.length;
  todos = [];
  nextId = 1;
  return count;
}
function buildEntry() {
  return { todos: [...todos], nextId, updatedAt: Date.now() };
}
function restoreFromEntries(entries) {
  todos = [];
  nextId = 1;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.type !== "custom" || e.customType !== "todo-state") continue;
    const data = e.data;
    if (data?.todos) {
      todos = data.todos;
      nextId = data.nextId;
      return;
    }
  }
}

// src/format.ts
function formatTodoLine(t) {
  return `[${t.done ? "x" : " "}] #${t.id}: ${t.text}`;
}
function formatSummary(state) {
  if (state.todos.length === 0) return "No todos";
  const done = state.todos.filter((t) => t.done).length;
  const lines = [
    `Progress: ${done}/${state.todos.length}`,
    ...state.todos.map(formatTodoLine)
  ];
  return lines.join("\n");
}

// src/context.ts
function buildTurnContext() {
  const todos2 = getTodos();
  if (todos2.length === 0) return null;
  const summary = formatSummary(getState());
  const active = todos2.find((t) => !t.done);
  const directive = active ? `Active: #${active.id} ${active.text}` : "All items complete.";
  return { content: [summary, directive].join("\n"), display: false };
}

// src/render.ts
import { Text, truncateToWidth } from "@mariozechner/pi-tui";
var SPINNER_FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
var SPINNER_INTERVAL_MS = 120;
function createWidgetFactory(todos2, firstActive, running, onStartSpinner) {
  return (tui, theme) => {
    const content = new Text("", 0, 0);
    if (running && firstActive) {
      onStartSpinner(setInterval(() => tui.requestRender(), SPINNER_INTERVAL_MS));
    }
    return {
      render(width) {
        const w = Math.max(8, width);
        const frame = Math.floor(Date.now() / SPINNER_INTERVAL_MS) % SPINNER_FRAMES.length;
        const spinner = SPINNER_FRAMES[frame];
        const lines = todos2.map((t) => {
          if (t.done) {
            return theme.fg("dim", theme.strikethrough(truncateToWidth(`\u25CF #${t.id} ${t.text}`, w)));
          }
          if (t === firstActive && running) {
            return theme.bold(theme.fg("accent", truncateToWidth(`${spinner} #${t.id} ${t.text}`, w)));
          }
          if (t === firstActive) {
            return theme.fg("accent", truncateToWidth(`\u2192 #${t.id} ${t.text}`, w));
          }
          return theme.fg("toolOutput", truncateToWidth(`\u25CB #${t.id} ${t.text}`, w));
        });
        content.setText(lines.join("\n"));
        return content.render(width);
      },
      invalidate() {
        content.invalidate();
      }
    };
  };
}

// src/widget.ts
var WIDGET_KEY = "todo";
var HIDE_AFTER_TURNS = 2;
var HIDE_AFTER_MS = 9e4;
var spinnerTimer;
var hideTimer;
var agentRunning = false;
var currentTurn = 0;
var completedAt;
var completedTurn;
var latestCtx;
var latestPi;
function setAgentRunning(running) {
  agentRunning = running;
}
function incrementTurn() {
  currentTurn++;
}
function clearSpinnerTimer() {
  if (!spinnerTimer) return;
  clearInterval(spinnerTimer);
  spinnerTimer = void 0;
}
function clearHideTimer() {
  if (!hideTimer) return;
  clearTimeout(hideTimer);
  hideTimer = void 0;
}
function syncWidget(ctx, pi) {
  latestCtx = ctx;
  if (pi) latestPi = pi;
  if (!ctx.hasUI) return;
  clearSpinnerTimer();
  const { todos: todos2 } = getState();
  if (todos2.length === 0) {
    clearHideTimer();
    ctx.ui.setWidget(WIDGET_KEY, void 0);
    return;
  }
  const hasRemaining = todos2.some((t) => !t.done);
  if (hasRemaining) {
    completedAt = void 0;
    completedTurn = void 0;
  } else {
    completedAt ??= Date.now();
    completedTurn ??= currentTurn;
    if (currentTurn - completedTurn >= HIDE_AFTER_TURNS || Date.now() - completedAt >= HIDE_AFTER_MS) {
      clearHideTimer();
      clearTodos();
      if (latestPi) latestPi.appendEntry("todo-state", buildEntry());
      ctx.ui.setWidget(WIDGET_KEY, void 0);
      return;
    }
    clearHideTimer();
    const remainingMs = Math.max(0, HIDE_AFTER_MS - (Date.now() - completedAt));
    hideTimer = setTimeout(() => {
      hideTimer = void 0;
      if (latestCtx) syncWidget(latestCtx, latestPi);
    }, remainingMs);
  }
  const firstActive = todos2.find((t) => !t.done);
  const factory = createWidgetFactory(todos2, firstActive, agentRunning, (timer) => {
    spinnerTimer = timer;
  });
  ctx.ui.setWidget(WIDGET_KEY, factory);
}
function cleanupWidget(ctx) {
  clearSpinnerTimer();
  clearHideTimer();
  agentRunning = false;
  currentTurn = 0;
  completedAt = void 0;
  completedTurn = void 0;
  latestCtx = void 0;
  latestPi = void 0;
  if (!ctx.hasUI) return;
  ctx.ui.setWidget(WIDGET_KEY, void 0);
}

// src/handlers.ts
function onRestore(pi) {
  return async (_e, ctx) => {
    restoreFromEntries(ctx.sessionManager.getBranch());
    syncWidget(ctx, pi);
  };
}
function onBeforeAgentStart() {
  return async () => {
    const ctx = buildTurnContext();
    if (!ctx) return;
    return {
      message: { customType: "todo-context", content: ctx.content, display: ctx.display }
    };
  };
}
function onAgentStart(pi) {
  return async (_e, ctx) => {
    setAgentRunning(true);
    syncWidget(ctx, pi);
  };
}
function onAgentEnd(pi) {
  return async (_e, ctx) => {
    setAgentRunning(false);
    pi.appendEntry("todo-state", buildEntry());
    syncWidget(ctx, pi);
  };
}
function onMessageEnd(pi) {
  return async (_e, ctx) => {
    incrementTurn();
    syncWidget(ctx, pi);
  };
}
function onCompact(pi) {
  return async (_e, ctx) => {
    restoreFromEntries(ctx.sessionManager.getBranch());
    syncWidget(ctx, pi);
  };
}
function onShutdown() {
  return async (_e, ctx) => {
    cleanupWidget(ctx);
  };
}

// src/tool.ts
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";

// src/execute.ts
function result(text, details) {
  return { content: [{ type: "text", text }], details };
}
function listAction() {
  return result(formatSummary(getState()), { action: "list", ...getState() });
}
function addAction(text) {
  if (!text) {
    return result("Error: text required", { action: "add", ...getState(), error: "text required" });
  }
  const todo = addTodo(text);
  return result(`Added #${todo.id}: ${todo.text}`, { action: "add", ...getState() });
}
function toggleAction(id) {
  if (id === void 0) {
    return result("Error: id required", { action: "toggle", ...getState(), error: "id required" });
  }
  const todo = toggleTodo(id);
  if (!todo) {
    return result(`#${id} not found`, { action: "toggle", ...getState(), error: `#${id} not found` });
  }
  return result(
    `#${todo.id} ${todo.done ? "completed" : "uncompleted"}`,
    { action: "toggle", ...getState() }
  );
}
function clearAction() {
  const count = clearTodos();
  return result(`Cleared ${count} todos`, { action: "clear", ...getState() });
}
function execute(params) {
  switch (params.action) {
    case "list":
      return listAction();
    case "add":
      return addAction(params.text);
    case "toggle":
      return toggleAction(params.id);
    case "clear":
      return clearAction();
    default:
      return result(`Unknown: ${params.action}`, {
        action: "list",
        ...getState(),
        error: `unknown: ${params.action}`
      });
  }
}

// src/tool.ts
var TodoParams = Type.Object({
  action: StringEnum(["list", "add", "toggle", "clear"]),
  text: Type.Optional(Type.String({ description: "Todo text (for add)" })),
  id: Type.Optional(Type.Number({ description: "Todo ID (for toggle)" }))
});
function createTodoTool(pi) {
  return {
    name: "todo",
    label: "Todo",
    description: "Manage a todo list. Actions: list, add (text), toggle (id), clear",
    parameters: TodoParams,
    execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result2 = execute(params);
      pi.appendEntry("todo-state", buildEntry());
      syncWidget(ctx, pi);
      return Promise.resolve(result2);
    }
  };
}

// src/index.ts
function index_default(pi) {
  pi.on("session_start", onRestore(pi));
  pi.on("session_tree", onRestore(pi));
  pi.on("before_agent_start", onBeforeAgentStart());
  pi.on("agent_start", onAgentStart(pi));
  pi.on("agent_end", onAgentEnd(pi));
  pi.on("message_end", onMessageEnd(pi));
  pi.on("session_compact", onCompact(pi));
  pi.on("session_shutdown", onShutdown());
  pi.registerTool(createTodoTool(pi));
}
export {
  index_default as default
};
