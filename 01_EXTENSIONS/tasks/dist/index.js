// node_modules/@jeonghyeon.net/pi-tasks/dist/index.js
import { randomUUID } from "node:crypto";
import { join as join3, resolve } from "node:path";
import { Type } from "@sinclair/typebox";

// node_modules/@jeonghyeon.net/pi-tasks/dist/auto-clear.js
var AutoClearManager = class {
  getStore;
  getMode;
  clearDelayTurns;
  /** Per-task: turn when task was marked completed ("on_task_complete" mode). */
  completedAtTurn = /* @__PURE__ */ new Map();
  /** Turn when ALL tasks became completed ("on_list_complete" mode). */
  allCompletedAtTurn = null;
  constructor(getStore, getMode, clearDelayTurns = 4) {
    this.getStore = getStore;
    this.getMode = getMode;
    this.clearDelayTurns = clearDelayTurns;
  }
  /** Record a task completion. Call AFTER cascade logic. */
  trackCompletion(taskId, currentTurn) {
    const mode = this.getMode();
    if (mode === "never")
      return;
    if (mode === "on_task_complete") {
      this.completedAtTurn.set(taskId, currentTurn);
    } else if (mode === "on_list_complete") {
      this.checkAllCompleted(currentTurn);
    }
  }
  /** Check if all tasks are completed and start/reset the batch countdown. */
  checkAllCompleted(currentTurn) {
    const tasks = this.getStore().list();
    if (tasks.length > 0 && tasks.every((t) => t.status === "completed")) {
      if (this.allCompletedAtTurn === null)
        this.allCompletedAtTurn = currentTurn;
    } else {
      this.allCompletedAtTurn = null;
    }
  }
  /** Reset batch countdown (e.g., when a new task is created or task goes non-completed). */
  resetBatchCountdown() {
    this.allCompletedAtTurn = null;
  }
  /** Reset all tracking state (e.g., on new session). */
  reset() {
    this.completedAtTurn.clear();
    this.allCompletedAtTurn = null;
  }
  /**
   * Called on each turn start. Deletes tasks whose linger period has expired.
   * Returns true if any tasks were cleared.
   */
  onTurnStart(currentTurn) {
    const mode = this.getMode();
    let cleared = false;
    if (mode === "on_task_complete") {
      for (const [taskId, turn] of this.completedAtTurn) {
        const task = this.getStore().get(taskId);
        if (!task || task.status !== "completed") {
          this.completedAtTurn.delete(taskId);
        } else if (currentTurn - turn >= this.clearDelayTurns) {
          this.getStore().delete(taskId);
          this.completedAtTurn.delete(taskId);
          cleared = true;
        }
      }
    } else if (mode === "on_list_complete" && this.allCompletedAtTurn !== null) {
      if (currentTurn - this.allCompletedAtTurn >= this.clearDelayTurns) {
        this.getStore().clearCompleted();
        this.allCompletedAtTurn = null;
        cleared = true;
      }
    }
    return cleared;
  }
};

// node_modules/@jeonghyeon.net/pi-tasks/dist/process-tracker.js
var ProcessTracker = class {
  processes = /* @__PURE__ */ new Map();
  /** Register a spawned process for a task. */
  track(taskId, proc, command) {
    const bp = {
      taskId,
      pid: proc.pid,
      command,
      output: [],
      status: "running",
      startedAt: Date.now(),
      proc,
      abortController: new AbortController(),
      waiters: []
    };
    proc.stdout?.on("data", (data) => {
      bp.output.push(data.toString());
    });
    proc.stderr?.on("data", (data) => {
      bp.output.push(data.toString());
    });
    proc.on("close", (code, _signal) => {
      if (bp.status === "running") {
        bp.status = code === 0 ? "completed" : "error";
      }
      bp.exitCode = code ?? void 0;
      bp.completedAt = Date.now();
      for (const resolve2 of bp.waiters)
        resolve2();
      bp.waiters = [];
    });
    proc.on("error", (err) => {
      if (bp.status === "running") {
        bp.status = "error";
        bp.output.push(`Process error: ${err.message}`);
        bp.completedAt = Date.now();
        for (const resolve2 of bp.waiters)
          resolve2();
        bp.waiters = [];
      }
    });
    this.processes.set(taskId, bp);
  }
  /** Get current output and status for a task's process. */
  getOutput(taskId) {
    const bp = this.processes.get(taskId);
    if (!bp)
      return void 0;
    return {
      output: bp.output.join(""),
      status: bp.status,
      exitCode: bp.exitCode,
      startedAt: bp.startedAt,
      completedAt: bp.completedAt,
      command: bp.command
    };
  }
  /** Wait for a task's process to complete, with timeout. */
  waitForCompletion(taskId, timeout, signal) {
    const bp = this.processes.get(taskId);
    if (!bp)
      return Promise.resolve(void 0);
    if (bp.status !== "running")
      return Promise.resolve(this.getOutput(taskId));
    return new Promise((resolve2) => {
      let settled = false;
      const timer = setTimeout(finish, timeout);
      function finish() {
        if (settled)
          return;
        settled = true;
        clearTimeout(timer);
        resolve2(self.getOutput(taskId));
      }
      const self = this;
      bp.waiters.push(finish);
      signal?.addEventListener("abort", finish, { once: true });
    });
  }
  /** Stop a task's background process. SIGTERM → 5s → SIGKILL. */
  async stop(taskId) {
    const bp = this.processes.get(taskId);
    if (!bp || bp.status !== "running")
      return false;
    bp.status = "stopped";
    bp.proc.kill("SIGTERM");
    await new Promise((resolve2) => {
      const timer = setTimeout(() => {
        try {
          bp.proc.kill("SIGKILL");
        } catch {
        }
        resolve2();
      }, 5e3);
      bp.proc.on("close", () => {
        clearTimeout(timer);
        resolve2();
      });
    });
    bp.completedAt = Date.now();
    for (const resolve2 of bp.waiters)
      resolve2();
    bp.waiters = [];
    return true;
  }
  /** Get the process record for a task. */
  getProcess(taskId) {
    return this.processes.get(taskId);
  }
};

// node_modules/@jeonghyeon.net/pi-tasks/dist/task-store.js
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
var TASKS_DIR = join(homedir(), ".pi", "tasks");
var LOCK_RETRY_MS = 50;
var LOCK_MAX_RETRIES = 100;
function acquireLock(lockPath) {
  for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
    try {
      writeFileSync(lockPath, `${process.pid}`, { flag: "wx" });
      return;
    } catch (e) {
      if (e.code === "EEXIST") {
        try {
          const pid = parseInt(readFileSync(lockPath, "utf-8"), 10);
          if (pid && !isProcessRunning(pid)) {
            unlinkSync(lockPath);
            continue;
          }
        } catch {
        }
        const start = Date.now();
        while (Date.now() - start < LOCK_RETRY_MS) {
        }
        continue;
      }
      throw e;
    }
  }
  throw new Error(`Failed to acquire lock: ${lockPath}`);
}
function releaseLock(lockPath) {
  try {
    unlinkSync(lockPath);
  } catch {
  }
}
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
var TaskStore = class {
  filePath;
  lockPath;
  // In-memory state (always kept in sync)
  nextId = 1;
  tasks = /* @__PURE__ */ new Map();
  constructor(listIdOrPath) {
    if (!listIdOrPath)
      return;
    const isAbsPath = isAbsolute(listIdOrPath);
    const filePath = isAbsPath ? listIdOrPath : join(TASKS_DIR, `${listIdOrPath}.json`);
    mkdirSync(dirname(filePath), { recursive: true });
    this.filePath = filePath;
    this.lockPath = filePath + ".lock";
    this.load();
  }
  /** Read store from disk (file-backed mode only). */
  load() {
    if (!this.filePath)
      return;
    if (!existsSync(this.filePath))
      return;
    try {
      const data = JSON.parse(readFileSync(this.filePath, "utf-8"));
      this.nextId = data.nextId;
      this.tasks.clear();
      for (const t of data.tasks) {
        this.tasks.set(t.id, t);
      }
    } catch {
    }
  }
  /** Write store to disk atomically (file-backed mode only). */
  save() {
    if (!this.filePath)
      return;
    const data = {
      nextId: this.nextId,
      tasks: Array.from(this.tasks.values())
    };
    const tmpPath = this.filePath + ".tmp";
    writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    renameSync(tmpPath, this.filePath);
  }
  /** Execute a mutation with file locking (if file-backed). */
  withLock(fn) {
    if (!this.lockPath)
      return fn();
    acquireLock(this.lockPath);
    try {
      this.load();
      const result = fn();
      this.save();
      return result;
    } finally {
      releaseLock(this.lockPath);
    }
  }
  create(subject, description, activeForm, metadata) {
    return this.withLock(() => {
      const now = Date.now();
      const task = {
        id: String(this.nextId++),
        subject,
        description,
        status: "pending",
        activeForm,
        owner: void 0,
        metadata: metadata ?? {},
        blocks: [],
        blockedBy: [],
        createdAt: now,
        updatedAt: now
      };
      this.tasks.set(task.id, task);
      return task;
    });
  }
  get(id) {
    if (this.filePath)
      this.load();
    return this.tasks.get(id);
  }
  /** List all tasks sorted by ID ascending. */
  list() {
    if (this.filePath)
      this.load();
    return Array.from(this.tasks.values()).sort((a, b) => Number(a.id) - Number(b.id));
  }
  update(id, fields) {
    return this.withLock(() => {
      const task = this.tasks.get(id);
      if (!task)
        return { task: void 0, changedFields: [], warnings: [] };
      const changedFields = [];
      const warnings = [];
      if (fields.status === "deleted") {
        this.tasks.delete(id);
        for (const t of this.tasks.values()) {
          t.blocks = t.blocks.filter((bid) => bid !== id);
          t.blockedBy = t.blockedBy.filter((bid) => bid !== id);
        }
        return { task: void 0, changedFields: ["deleted"], warnings: [] };
      }
      if (fields.status !== void 0) {
        task.status = fields.status;
        changedFields.push("status");
      }
      if (fields.subject !== void 0) {
        task.subject = fields.subject;
        changedFields.push("subject");
      }
      if (fields.description !== void 0) {
        task.description = fields.description;
        changedFields.push("description");
      }
      if (fields.activeForm !== void 0) {
        task.activeForm = fields.activeForm;
        changedFields.push("activeForm");
      }
      if (fields.owner !== void 0) {
        task.owner = fields.owner;
        changedFields.push("owner");
      }
      if (fields.metadata !== void 0) {
        for (const [key, value] of Object.entries(fields.metadata)) {
          if (value === null) {
            delete task.metadata[key];
          } else {
            task.metadata[key] = value;
          }
        }
        changedFields.push("metadata");
      }
      if (fields.addBlocks && fields.addBlocks.length > 0) {
        for (const targetId of fields.addBlocks) {
          if (!task.blocks.includes(targetId)) {
            task.blocks.push(targetId);
          }
          const target = this.tasks.get(targetId);
          if (target && !target.blockedBy.includes(id)) {
            target.blockedBy.push(id);
            target.updatedAt = Date.now();
          }
          if (targetId === id) {
            warnings.push(`#${id} blocks itself`);
          } else if (!target) {
            warnings.push(`#${targetId} does not exist`);
          } else if (target.blocks.includes(id)) {
            warnings.push(`cycle: #${id} and #${targetId} block each other`);
          }
        }
        changedFields.push("blocks");
      }
      if (fields.addBlockedBy && fields.addBlockedBy.length > 0) {
        for (const targetId of fields.addBlockedBy) {
          if (!task.blockedBy.includes(targetId)) {
            task.blockedBy.push(targetId);
          }
          const target = this.tasks.get(targetId);
          if (target && !target.blocks.includes(id)) {
            target.blocks.push(id);
            target.updatedAt = Date.now();
          }
          if (targetId === id) {
            warnings.push(`#${id} blocks itself`);
          } else if (!target) {
            warnings.push(`#${targetId} does not exist`);
          } else if (task.blocks.includes(targetId)) {
            warnings.push(`cycle: #${id} and #${targetId} block each other`);
          }
        }
        changedFields.push("blockedBy");
      }
      task.updatedAt = Date.now();
      return { task, changedFields, warnings };
    });
  }
  /** Delete a task by ID. Returns true if deleted. */
  delete(id) {
    return this.withLock(() => {
      if (!this.tasks.has(id))
        return false;
      this.tasks.delete(id);
      for (const t of this.tasks.values()) {
        t.blocks = t.blocks.filter((bid) => bid !== id);
        t.blockedBy = t.blockedBy.filter((bid) => bid !== id);
      }
      return true;
    });
  }
  /** Remove all tasks. */
  clearAll() {
    return this.withLock(() => {
      const count = this.tasks.size;
      this.tasks.clear();
      return count;
    });
  }
  /** Delete the backing file (if file-backed and empty). */
  deleteFileIfEmpty() {
    if (!this.filePath || this.tasks.size > 0)
      return false;
    try {
      unlinkSync(this.filePath);
    } catch {
    }
    return true;
  }
  /** Remove all completed tasks. */
  clearCompleted() {
    return this.withLock(() => {
      let count = 0;
      for (const [id, task] of this.tasks) {
        if (task.status === "completed") {
          this.tasks.delete(id);
          count++;
        }
      }
      if (count > 0) {
        const validIds = new Set(this.tasks.keys());
        for (const t of this.tasks.values()) {
          t.blocks = t.blocks.filter((bid) => validIds.has(bid));
          t.blockedBy = t.blockedBy.filter((bid) => validIds.has(bid));
        }
      }
      return count;
    });
  }
};

// node_modules/@jeonghyeon.net/pi-tasks/dist/tasks-config.js
import { mkdirSync as mkdirSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname as dirname2, join as join2 } from "node:path";
var CONFIG_PATH = join2(process.cwd(), ".pi", "tasks-config.json");
function loadTasksConfig() {
  try {
    return JSON.parse(readFileSync2(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}
function saveTasksConfig(config) {
  mkdirSync2(dirname2(CONFIG_PATH), { recursive: true });
  writeFileSync2(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// node_modules/@jeonghyeon.net/pi-tasks/dist/ui/settings-menu.js
import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import { Container, SettingsList, Spacer, Text } from "@mariozechner/pi-tui";
async function openSettingsMenu(ui, cfg, onBack, clearDelayTurns) {
  await ui.custom((_tui, theme, _kb, done) => {
    const items = [
      {
        id: "taskScope",
        label: "Task storage",
        description: "memory: tasks live only in memory, lost when session ends. session: persisted per session (tasks-<sessionId>.json), survives resume. project: shared across all sessions (tasks.json). Takes effect on next session start.",
        currentValue: cfg.taskScope ?? "session",
        values: ["memory", "session", "project"]
      },
      {
        id: "autoCascade",
        label: "Auto-execute with agents",
        description: "When ON: pending agent tasks start automatically once their dependencies complete. When OFF: use TaskExecute to launch them manually.",
        currentValue: cfg.autoCascade ?? false ? "on" : "off",
        values: ["on", "off"]
      },
      {
        id: "autoClearCompleted",
        label: "Auto-clear completed tasks",
        description: `never: completed tasks stay visible until manually cleared. on_list_complete: cleared automatically after all tasks are done. on_task_complete: each task cleared shortly after it completes. Clearing lags ~${clearDelayTurns} turns.`,
        currentValue: cfg.autoClearCompleted ?? "on_list_complete",
        values: ["never", "on_list_complete", "on_task_complete"]
      }
    ];
    const list = new SettingsList(
      items,
      /* maxVisible */
      10,
      getSettingsListTheme(),
      /* onChange */
      (id, newValue) => {
        if (id === "autoCascade") {
          cfg.autoCascade = newValue === "on";
          saveTasksConfig(cfg);
        }
        if (id === "taskScope") {
          cfg.taskScope = newValue;
          saveTasksConfig(cfg);
        }
        if (id === "autoClearCompleted") {
          cfg.autoClearCompleted = newValue;
          saveTasksConfig(cfg);
        }
      },
      /* onCancel */
      () => done(void 0)
    );
    class SettingsPanel extends Container {
      handleInput(data) {
        list.handleInput(data);
      }
    }
    const root = new SettingsPanel();
    root.addChild(new Text(theme.bold(theme.fg("accent", "\u2699  Task Settings")), 0, 0));
    root.addChild(new Spacer(1));
    root.addChild(list);
    return root;
  });
  return onBack();
}

// node_modules/@jeonghyeon.net/pi-tasks/dist/ui/task-widget.js
import { truncateToWidth } from "@mariozechner/pi-tui";
var SPINNER = ["\u2733", "\u2734", "\u2735", "\u2736", "\u2737", "\u2738", "\u2739", "\u273A", "\u273B", "\u273C", "\u273D"];
var MAX_VISIBLE_TASKS = 10;
function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1e3);
  if (totalSec < 60)
    return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60)
    return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
}
function formatTokens(n) {
  if (n < 1e3)
    return String(n);
  return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
}
var TaskWidget = class {
  store;
  uiCtx;
  widgetFrame = 0;
  widgetInterval;
  /** IDs of tasks currently being actively executed (show spinner). */
  activeTaskIds = /* @__PURE__ */ new Set();
  /** Per-task runtime metrics keyed by task ID. */
  metrics = /* @__PURE__ */ new Map();
  /** Cached TUI instance for requestRender() calls. */
  tui;
  /** Whether the foreground pi session is currently working. */
  foregroundBusy = false;
  /** Whether the widget callback is currently registered. */
  widgetRegistered = false;
  constructor(store) {
    this.store = store;
  }
  setStore(store) {
    this.store = store;
  }
  setUICtx(ctx) {
    this.uiCtx = ctx;
  }
  /** Add or remove a task from the active spinner set. */
  setActiveTask(taskId, active = true) {
    if (taskId && active) {
      this.activeTaskIds.add(taskId);
      if (!this.metrics.has(taskId)) {
        this.metrics.set(taskId, { startedAt: Date.now(), inputTokens: 0, outputTokens: 0 });
      }
      this.ensureTimer();
    } else if (taskId) {
      this.activeTaskIds.delete(taskId);
    }
    this.update();
  }
  /** Record token usage for the currently active task(s). */
  addTokenUsage(inputTokens, outputTokens) {
    for (const id of this.activeTaskIds) {
      const m = this.metrics.get(id);
      if (m) {
        m.inputTokens += inputTokens;
        m.outputTokens += outputTokens;
      }
    }
  }
  /** Ensure the widget update timer is running. */
  ensureTimer() {
    if (!this.widgetInterval) {
      this.widgetInterval = setInterval(() => this.update(), 80);
    }
  }
  /** Tell the widget whether the main pi session is currently working. */
  setForegroundBusy(busy) {
    if (this.foregroundBusy === busy)
      return;
    this.foregroundBusy = busy;
    this.update();
  }
  /** Build widget lines from current live state. Called from the render callback. */
  renderWidget(tui, theme) {
    const tasks = this.store.list();
    const w = tui.terminal.columns;
    const truncate = (line) => truncateToWidth(line, w);
    if (tasks.length === 0)
      return [];
    const completed = tasks.filter((t) => t.status === "completed");
    const inProgress = tasks.filter((t) => t.status === "in_progress");
    const pending = tasks.filter((t) => t.status === "pending");
    const parts = [];
    if (completed.length > 0)
      parts.push(`${completed.length} done`);
    if (inProgress.length > 0)
      parts.push(`${inProgress.length} in progress`);
    if (pending.length > 0)
      parts.push(`${pending.length} open`);
    const statusText = `${tasks.length} tasks (${parts.join(", ")})`;
    const spinnerChar = SPINNER[this.widgetFrame % SPINNER.length];
    const lines = [truncate(theme.fg("accent", "\u25CF") + " " + theme.fg("accent", statusText))];
    const visible = tasks.slice(0, MAX_VISIBLE_TASKS);
    for (let i = 0; i < visible.length; i++) {
      const task = visible[i];
      const isTrackedActive = this.activeTaskIds.has(task.id) && task.status === "in_progress";
      const isAnimatedActive = isTrackedActive && this.foregroundBusy;
      let icon;
      if (isAnimatedActive) {
        icon = theme.fg("accent", spinnerChar);
      } else if (task.status === "completed") {
        icon = theme.fg("success", "\u2714");
      } else if (task.status === "in_progress") {
        icon = theme.fg("accent", "\u25D0");
      } else {
        icon = "\u25FB";
      }
      let suffix = "";
      if (task.status === "pending" && task.blockedBy.length > 0) {
        const openBlockers = task.blockedBy.filter((bid) => {
          const blocker = this.store.get(bid);
          return blocker && blocker.status !== "completed";
        });
        if (openBlockers.length > 0) {
          suffix = theme.fg("dim", ` \u203A blocked by ${openBlockers.map((id) => "#" + id).join(", ")}`);
        }
      }
      let text;
      if (isTrackedActive) {
        const form = task.activeForm || task.subject;
        const agentId = task.metadata?.agentId;
        const agentLabel = agentId ? ` (agent ${agentId.slice(0, 5)})` : "";
        const m = this.metrics.get(task.id);
        let stats = "";
        if (m) {
          const elapsed = formatDuration(Date.now() - m.startedAt);
          const tokenParts = [];
          if (m.inputTokens > 0)
            tokenParts.push(`\u2191 ${formatTokens(m.inputTokens)}`);
          if (m.outputTokens > 0)
            tokenParts.push(`\u2193 ${formatTokens(m.outputTokens)}`);
          stats = tokenParts.length > 0 ? ` ${theme.fg("dim", `(${elapsed} \xB7 ${tokenParts.join(" ")})`)}` : ` ${theme.fg("dim", `(${elapsed})`)}`;
        }
        const label = isAnimatedActive ? form + agentLabel + "\u2026" : form + agentLabel;
        text = `  ${icon} ${theme.fg("dim", "#" + task.id)} ${theme.fg("accent", label)}${stats}`;
      } else if (task.status === "completed") {
        text = `  ${icon} ${theme.fg("dim", theme.strikethrough("#" + task.id + " " + task.subject))}`;
      } else {
        const agentSuffix = task.status === "in_progress" && task.metadata?.agentId ? theme.fg("dim", ` (agent ${task.metadata.agentId.slice(0, 5)})`) : "";
        text = `  ${icon} ${theme.fg("dim", "#" + task.id)} ${task.subject}${agentSuffix}`;
      }
      lines.push(truncate(text + suffix));
    }
    if (tasks.length > MAX_VISIBLE_TASKS) {
      lines.push(truncate(theme.fg("dim", `    \u2026 and ${tasks.length - MAX_VISIBLE_TASKS} more`)));
    }
    return lines;
  }
  /** Force an immediate widget update. */
  update() {
    if (!this.uiCtx)
      return;
    const tasks = this.store.list();
    if (tasks.length === 0) {
      if (this.widgetRegistered) {
        this.uiCtx.setWidget("tasks", void 0);
        this.widgetRegistered = false;
      }
      if (this.widgetInterval) {
        clearInterval(this.widgetInterval);
        this.widgetInterval = void 0;
      }
      return;
    }
    for (const id of this.activeTaskIds) {
      const t = this.store.get(id);
      if (!t || t.status !== "in_progress") {
        this.activeTaskIds.delete(id);
        this.metrics.delete(id);
      }
    }
    const hasAnimatedSpinner = this.foregroundBusy && tasks.some((t) => this.activeTaskIds.has(t.id) && t.status === "in_progress");
    if (hasAnimatedSpinner) {
      this.ensureTimer();
    } else if (!hasAnimatedSpinner && this.widgetInterval) {
      clearInterval(this.widgetInterval);
      this.widgetInterval = void 0;
    }
    this.widgetFrame++;
    if (!this.widgetRegistered) {
      this.uiCtx.setWidget("tasks", (tui, theme) => {
        this.tui = tui;
        return { render: () => this.renderWidget(tui, theme), invalidate: () => {
        } };
      }, { placement: "aboveEditor" });
      this.widgetRegistered = true;
    } else if (this.tui) {
      this.tui.requestRender();
    }
  }
  dispose() {
    if (this.widgetInterval) {
      clearInterval(this.widgetInterval);
      this.widgetInterval = void 0;
    }
    if (this.uiCtx) {
      this.uiCtx.setWidget("tasks", void 0);
    }
    this.widgetRegistered = false;
    this.tui = void 0;
  }
};

// node_modules/@jeonghyeon.net/pi-tasks/dist/index.js
var DEBUG = !!process.env.PI_TASKS_DEBUG;
function debug(...args) {
  if (DEBUG)
    console.error("[pi-tasks]", ...args);
}
function textResult(msg) {
  return { content: [{ type: "text", text: msg }], details: void 0 };
}
var TASK_TOOL_NAMES = /* @__PURE__ */ new Set(["TaskCreate", "TaskList", "TaskGet", "TaskUpdate", "TaskOutput", "TaskStop", "TaskExecute"]);
var REMINDER_INTERVAL = 4;
var AUTO_CLEAR_DELAY = 4;
var SYSTEM_REMINDER = `<system-reminder>
The task tools haven't been used recently. If you're working on tasks that would benefit from tracking progress, consider using TaskCreate to add new tasks and TaskUpdate to update task status (set to in_progress when starting, completed when done). Also consider cleaning up the task list if it has become stale. Only use these if relevant to the current work. This is just a gentle reminder - ignore if not applicable. Make sure that you NEVER mention this reminder to the user
</system-reminder>`;
function dist_default(pi) {
  const cfg = loadTasksConfig();
  const piTasks = process.env.PI_TASKS;
  const taskScope = cfg.taskScope ?? "session";
  function resolveStorePath(sessionId) {
    if (piTasks === "off")
      return void 0;
    if (piTasks?.startsWith("/"))
      return piTasks;
    if (piTasks?.startsWith("."))
      return resolve(piTasks);
    if (piTasks)
      return piTasks;
    if (taskScope === "memory")
      return void 0;
    if (taskScope === "session" && sessionId) {
      return join3(process.cwd(), ".pi", "tasks", `tasks-${sessionId}.json`);
    }
    if (taskScope === "session")
      return void 0;
    return join3(process.cwd(), ".pi", "tasks", "tasks.json");
  }
  let store = new TaskStore(resolveStorePath());
  const tracker = new ProcessTracker();
  const widget = new TaskWidget(store);
  let latestCtx;
  let cascadeConfig;
  const agentTaskMap = /* @__PURE__ */ new Map();
  function rpcCall(channel, params, timeoutMs) {
    const requestId = randomUUID();
    debug(`rpc:send ${channel}`, { requestId });
    return new Promise((resolve2, reject) => {
      const timer = setTimeout(() => {
        unsub();
        debug(`rpc:timeout ${channel}`, { requestId });
        reject(new Error(`${channel} timeout`));
      }, timeoutMs);
      const unsub = pi.events.on(`${channel}:reply:${requestId}`, (raw) => {
        unsub();
        clearTimeout(timer);
        debug(`rpc:reply ${channel}`, { requestId, raw });
        const reply = raw;
        if (reply.success)
          resolve2(reply.data);
        else
          reject(new Error(reply.error));
      });
      pi.events.emit(channel, { requestId, ...params });
      debug(`rpc:emitted ${channel}`, { requestId });
    });
  }
  function spawnSubagent(type, prompt, options) {
    debug("spawn:call", { type, options: { ...options, prompt: void 0 } });
    return rpcCall("subagents:rpc:spawn", { type, prompt, options }, 3e4).then((d) => {
      debug("spawn:ok", d);
      return d.id;
    });
  }
  function stopSubagent(agentId) {
    return rpcCall("subagents:rpc:stop", { agentId }, 1e4).catch(() => {
    });
  }
  const PROTOCOL_VERSION = 2;
  let subagentsAvailable = false;
  let pendingWarning;
  function checkSubagentsVersion() {
    const requestId = randomUUID();
    const timer = setTimeout(() => {
      unsub();
    }, 5e3);
    const unsub = pi.events.on(`subagents:rpc:ping:reply:${requestId}`, (raw) => {
      unsub();
      clearTimeout(timer);
      const remoteVersion = raw?.data?.version;
      if (remoteVersion === void 0) {
        pendingWarning = "@jeonghyeon.net/pi-subagents is outdated \u2014 please update for task execution support.";
      } else if (remoteVersion > PROTOCOL_VERSION) {
        pendingWarning = `@jeonghyeon.net/pi-tasks is outdated (protocol v${PROTOCOL_VERSION}, pi-subagents has v${remoteVersion}) \u2014 please update for task execution support.`;
      } else if (remoteVersion < PROTOCOL_VERSION) {
        pendingWarning = `@jeonghyeon.net/pi-subagents is outdated (protocol v${remoteVersion}, pi-tasks has v${PROTOCOL_VERSION}) \u2014 please update for task execution support.`;
      } else {
        subagentsAvailable = true;
      }
    });
    pi.events.emit("subagents:rpc:ping", { requestId });
  }
  checkSubagentsVersion();
  pi.events.on("subagents:ready", () => checkSubagentsVersion());
  function buildTaskPrompt(task, additionalContext) {
    let prompt = `You are executing task #${task.id}: "${task.subject}"

${task.description}`;
    if (additionalContext)
      prompt += `

${additionalContext}`;
    prompt += `

Complete this task fully. Do not attempt to manage tasks yourself.`;
    return prompt;
  }
  const autoClear = new AutoClearManager(() => store, () => cfg.autoClearCompleted ?? "on_list_complete", AUTO_CLEAR_DELAY);
  pi.events.on("subagents:completed", async (data) => {
    const { id, result } = data;
    const taskId = agentTaskMap.get(id);
    if (!taskId)
      return;
    agentTaskMap.delete(id);
    const task = store.get(taskId);
    if (!task)
      return;
    store.update(task.id, { status: "completed", metadata: { ...task.metadata, result } });
    widget.setActiveTask(task.id, false);
    if ((cfg.autoCascade ?? false) && cascadeConfig && latestCtx) {
      const unblocked = store.list().filter((t) => t.status === "pending" && t.metadata?.agentType && t.blockedBy.includes(task.id) && t.blockedBy.every((depId) => store.get(depId)?.status === "completed"));
      for (const next of unblocked) {
        store.update(next.id, { status: "in_progress" });
        const prompt = buildTaskPrompt(next, cascadeConfig.additionalContext);
        try {
          const agentId = await spawnSubagent(next.metadata.agentType, prompt, {
            description: next.subject,
            isBackground: true,
            maxTurns: cascadeConfig.maxTurns
          });
          agentTaskMap.set(agentId, next.id);
          store.update(next.id, { owner: agentId, metadata: { ...next.metadata, agentId } });
          widget.setActiveTask(next.id);
        } catch (err) {
          store.update(next.id, { status: "pending", metadata: { ...next.metadata, lastError: err.message } });
        }
      }
    }
    autoClear.trackCompletion(task.id, currentTurn);
    widget.update();
  });
  pi.events.on("subagents:failed", (data) => {
    const { id, error, result, status } = data;
    const taskId = agentTaskMap.get(id);
    if (!taskId)
      return;
    agentTaskMap.delete(id);
    const task = store.get(taskId);
    if (!task)
      return;
    if (status === "stopped") {
      store.update(task.id, { status: "completed", metadata: { ...task.metadata, result: result || task.metadata?.result } });
      autoClear.trackCompletion(task.id, currentTurn);
    } else {
      store.update(task.id, { status: "pending", metadata: { ...task.metadata, lastError: error || status } });
      autoClear.resetBatchCountdown();
    }
    widget.setActiveTask(task.id, false);
    widget.update();
  });
  let storeUpgraded = false;
  let persistedTasksShown = false;
  function upgradeStoreIfNeeded(ctx) {
    if (storeUpgraded)
      return;
    if (taskScope === "session" && !piTasks) {
      const sessionId = ctx.sessionManager.getSessionId();
      const path = resolveStorePath(sessionId);
      store = new TaskStore(path);
      widget.setStore(store);
    }
    storeUpgraded = true;
  }
  function showPersistedTasks(isResume = false) {
    if (persistedTasksShown)
      return;
    persistedTasksShown = true;
    const tasks = store.list();
    if (tasks.length > 0) {
      if (!isResume && tasks.every((t) => t.status === "completed")) {
        store.clearCompleted();
        if (taskScope === "session")
          store.deleteFileIfEmpty();
      } else {
        widget.update();
      }
    }
  }
  let currentTurn = 0;
  let lastTaskToolUseTurn = 0;
  let reminderInjectedThisCycle = false;
  pi.on("turn_start", async (_event, ctx) => {
    currentTurn++;
    latestCtx = ctx;
    widget.setUICtx(ctx.ui);
    widget.setForegroundBusy(true);
    upgradeStoreIfNeeded(ctx);
    if (autoClear.onTurnStart(currentTurn))
      widget.update();
  });
  pi.on("turn_end", async (event) => {
    widget.setForegroundBusy(false);
    const msg = event.message;
    if (msg?.role === "assistant" && msg.usage) {
      widget.addTokenUsage(msg.usage.input ?? 0, msg.usage.output ?? 0);
    }
  });
  pi.on("tool_result", async (event) => {
    if (TASK_TOOL_NAMES.has(event.toolName)) {
      lastTaskToolUseTurn = currentTurn;
      reminderInjectedThisCycle = false;
      return {};
    }
    if (currentTurn - lastTaskToolUseTurn < REMINDER_INTERVAL)
      return {};
    if (reminderInjectedThisCycle)
      return {};
    const tasks = store.list();
    if (tasks.length === 0)
      return {};
    reminderInjectedThisCycle = true;
    lastTaskToolUseTurn = currentTurn;
    return {
      content: [...event.content, { type: "text", text: SYSTEM_REMINDER }]
    };
  });
  pi.on("before_agent_start", async (_event, ctx) => {
    latestCtx = ctx;
    widget.setUICtx(ctx.ui);
    widget.setForegroundBusy(true);
    upgradeStoreIfNeeded(ctx);
    showPersistedTasks();
    if (pendingWarning) {
      ctx.ui.notify(pendingWarning, "warning");
      pendingWarning = void 0;
    }
  });
  pi.on("session_switch", async (event, ctx) => {
    latestCtx = ctx;
    widget.setUICtx(ctx.ui);
    const isResume = event?.reason === "resume";
    storeUpgraded = false;
    persistedTasksShown = false;
    currentTurn = 0;
    lastTaskToolUseTurn = 0;
    reminderInjectedThisCycle = false;
    widget.setForegroundBusy(false);
    autoClear.reset();
    if (!isResume && taskScope === "memory") {
      store.clearAll();
    }
    upgradeStoreIfNeeded(ctx);
    showPersistedTasks(isResume);
  });
  pi.on("tool_execution_start", async (_event, ctx) => {
    latestCtx = ctx;
    widget.setUICtx(ctx.ui);
    widget.setForegroundBusy(true);
    upgradeStoreIfNeeded(ctx);
    widget.update();
  });
  pi.registerTool({
    name: "TaskCreate",
    label: "TaskCreate",
    description: `Use this tool to create a structured task list for your current coding session. This helps you track progress, organize complex tasks, and demonstrate thoroughness to the user.
It also helps the user understand the progress of the task and overall progress of their requests.

## When to Use This Tool

Use this tool proactively in these scenarios:

- Complex multi-step tasks - When a task requires 3 or more distinct steps or actions
- Non-trivial and complex tasks - Tasks that require careful planning or multiple operations
- Plan mode - When using plan mode, create a task list to track the work
- User explicitly requests todo list - When the user directly asks you to use the todo list
- User provides multiple tasks - When users provide a list of things to be done (numbered or comma-separated)
- After receiving new instructions - Immediately capture user requirements as tasks
- When you start working on a task - Mark it as in_progress BEFORE beginning work
- After completing a task - Mark it as completed and add any new follow-up tasks discovered during implementation

## When NOT to Use This Tool

Skip using this tool when:
- There is only a single, straightforward task
- The task is trivial and tracking it provides no organizational benefit
- The task can be completed in less than 3 trivial steps
- The task is purely conversational or informational

NOTE that you should not use this tool if there is only one trivial task to do. In this case you are better off just doing the task directly.

## Task Fields

- **subject**: A brief, actionable title in imperative form (e.g., "Fix authentication bug in login flow")
- **description**: Detailed description of what needs to be done, including context and acceptance criteria
- **activeForm** (optional): Present continuous form shown in the spinner when the task is in_progress (e.g., "Fixing authentication bug"). If omitted, the spinner shows the subject instead.

All tasks are created with status \`pending\`.

## Tips

- Create tasks with clear, specific subjects that describe the outcome
- Include enough detail in the description for another agent to understand and complete the task
- After creating tasks, use TaskUpdate to set up dependencies (blocks/blockedBy) if needed
- Check TaskList first to avoid creating duplicate tasks
- Include \`agentType\` (e.g., "general-purpose", "Explore") to mark tasks for subagent execution via TaskExecute`,
    promptGuidelines: [
      "When working on complex multi-step tasks, use TaskCreate to track progress and TaskUpdate to update status.",
      "Mark tasks as in_progress before starting work and completed when done.",
      "Use TaskList to check for available work after completing a task."
    ],
    parameters: Type.Object({
      subject: Type.String({ description: "A brief title for the task" }),
      description: Type.String({ description: "A detailed description of what needs to be done" }),
      activeForm: Type.Optional(Type.String({ description: "Present continuous form shown in spinner when in_progress (e.g., 'Running tests')" })),
      agentType: Type.Optional(Type.String({ description: "Agent type for subagent execution (e.g., 'general-purpose', 'Explore'). Tasks with agentType can be started via TaskExecute." })),
      metadata: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: "Arbitrary metadata to attach to the task" }))
    }),
    execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      autoClear.resetBatchCountdown();
      const meta = params.metadata ?? {};
      if (params.agentType)
        meta.agentType = params.agentType;
      const task = store.create(params.subject, params.description, params.activeForm, Object.keys(meta).length > 0 ? meta : void 0);
      widget.update();
      return Promise.resolve(textResult(`Task #${task.id} created successfully: ${task.subject}`));
    }
  });
  pi.registerTool({
    name: "TaskList",
    label: "TaskList",
    description: `Use this tool to list all tasks in the task list.

## When to Use This Tool

- To see what tasks are available to work on (status: 'pending', no owner, not blocked)
- To check overall progress on the project
- To find tasks that are blocked and need dependencies resolved
- After completing a task, to check for newly unblocked work or claim the next available task
- **Prefer working on tasks in ID order** (lowest ID first) when multiple tasks are available, as earlier tasks often set up context for later ones

## Output

Returns a summary of each task:
- **id**: Task identifier (use with TaskGet, TaskUpdate)
- **subject**: Brief description of the task
- **status**: 'pending', 'in_progress', or 'completed'
- **owner**: Agent ID if assigned, empty if available
- **blockedBy**: List of open task IDs that must be resolved first (tasks with blockedBy cannot be claimed until dependencies resolve)

Use TaskGet with a specific task ID to view full details including description and comments.`,
    parameters: Type.Object({}),
    execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const tasks = store.list();
      if (tasks.length === 0)
        return Promise.resolve(textResult("No tasks found"));
      const statusOrder = { pending: 0, in_progress: 1, completed: 2 };
      const sorted = [...tasks].sort((a, b) => {
        const so = (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0);
        if (so !== 0)
          return so;
        return Number(a.id) - Number(b.id);
      });
      const lines = sorted.map((task) => {
        let line = `#${task.id} [${task.status}] ${task.subject}`;
        if (task.owner) {
          line += ` (${task.owner})`;
        }
        if (task.blockedBy.length > 0) {
          const openBlockers = task.blockedBy.filter((bid) => {
            const blocker = store.get(bid);
            return blocker && blocker.status !== "completed";
          });
          if (openBlockers.length > 0) {
            line += ` [blocked by ${openBlockers.map((id) => "#" + id).join(", ")}]`;
          }
        }
        return line;
      });
      return Promise.resolve(textResult(lines.join("\n")));
    }
  });
  pi.registerTool({
    name: "TaskGet",
    label: "TaskGet",
    description: `Use this tool to retrieve a task by its ID from the task list.

## When to Use This Tool

- When you need the full description and context before starting work on a task
- To understand task dependencies (what it blocks, what blocks it)
- After being assigned a task, to get complete requirements

## Output

Returns full task details:
- **subject**: Task title
- **description**: Detailed requirements and context
- **status**: 'pending', 'in_progress', or 'completed'
- **blocks**: Tasks waiting on this one to complete
- **blockedBy**: Tasks that must complete before this one can start

## Tips

- After fetching a task, verify its blockedBy list is empty before beginning work.
- Use TaskList to see all tasks in summary form.`,
    parameters: Type.Object({
      taskId: Type.String({ description: "The ID of the task to retrieve" })
    }),
    execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const task = store.get(params.taskId);
      if (!task)
        return Promise.resolve(textResult(`Task not found`));
      const desc = task.description.replace(/\\n/g, "\n");
      const lines = [
        `Task #${task.id}: ${task.subject}`,
        `Status: ${task.status}`
      ];
      if (task.owner) {
        lines.push(`Owner: ${task.owner}`);
      }
      lines.push(`Description: ${desc}`);
      if (task.blockedBy.length > 0) {
        const openBlockers = task.blockedBy.filter((bid) => {
          const blocker = store.get(bid);
          return blocker && blocker.status !== "completed";
        });
        if (openBlockers.length > 0) {
          lines.push(`Blocked by: ${openBlockers.map((id) => "#" + id).join(", ")}`);
        }
      }
      if (task.blocks.length > 0) {
        lines.push(`Blocks: ${task.blocks.map((id) => "#" + id).join(", ")}`);
      }
      const metaKeys = Object.keys(task.metadata);
      if (metaKeys.length > 0) {
        lines.push(`Metadata: ${JSON.stringify(task.metadata)}`);
      }
      return Promise.resolve(textResult(lines.join("\n")));
    }
  });
  pi.registerTool({
    name: "TaskUpdate",
    label: "TaskUpdate",
    description: `Use this tool to update a task in the task list.

## When to Use This Tool

**Before starting work on a task:**
- Mark it in_progress BEFORE beginning \u2014 do not start work without updating status first
- After resolving, call TaskList to find your next task

**Mark tasks as resolved:**
- When you have completed the work described in a task
- When a task is no longer needed or has been superseded
- IMPORTANT: Always mark your assigned tasks as resolved when you finish them
- After resolving, call TaskList to find your next task

- ONLY mark a task as completed when you have FULLY accomplished it
- If you encounter errors, blockers, or cannot finish, keep the task as in_progress
- When blocked, create a new task describing what needs to be resolved
- Never mark a task as completed if:
  - Tests are failing
  - Implementation is partial
  - You encountered unresolved errors
  - You couldn't find necessary files or dependencies

**Delete tasks:**
- When a task is no longer relevant or was created in error
- Setting status to \`deleted\` permanently removes the task

**Update task details:**
- When requirements change or become clearer
- When establishing dependencies between tasks

## Fields You Can Update

- **status**: The task status (see Status Workflow below)
- **subject**: Change the task title (imperative form, e.g., "Run tests")
- **description**: Change the task description
- **activeForm**: Present continuous form shown in spinner when in_progress (e.g., "Running tests")
- **owner**: Change the task owner (agent name)
- **metadata**: Merge metadata keys into the task (set a key to null to delete it)
- **addBlocks**: Mark tasks that cannot start until this one completes
- **addBlockedBy**: Mark tasks that must complete before this one can start

## Status Workflow

Status progresses: \`pending\` \u2192 \`in_progress\` \u2192 \`completed\`

Use \`deleted\` to permanently remove a task.

## Staleness

Make sure to read a task's latest state using \`TaskGet\` before updating it.

## Examples

Mark task as in progress when starting work:
\`\`\`json
{"taskId": "1", "status": "in_progress"}
\`\`\`

Mark task as completed after finishing work:
\`\`\`json
{"taskId": "1", "status": "completed"}
\`\`\`

Delete a task:
\`\`\`json
{"taskId": "1", "status": "deleted"}
\`\`\`

Claim a task by setting owner:
\`\`\`json
{"taskId": "1", "owner": "my-name"}
\`\`\`

Set up task dependencies:
\`\`\`json
{"taskId": "2", "addBlockedBy": ["1"]}
\`\`\``,
    parameters: Type.Object({
      taskId: Type.String({ description: "The ID of the task to update" }),
      status: Type.Optional(Type.Unsafe({
        anyOf: [
          { type: "string", enum: ["pending", "in_progress", "completed"] },
          { type: "string", const: "deleted" }
        ],
        description: "New status for the task"
      })),
      subject: Type.Optional(Type.String({ description: "New subject for the task" })),
      description: Type.Optional(Type.String({ description: "New description for the task" })),
      activeForm: Type.Optional(Type.String({ description: "Present continuous form shown in spinner when in_progress" })),
      owner: Type.Optional(Type.String({ description: "New owner for the task" })),
      metadata: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: "Metadata keys to merge into the task. Set a key to null to delete it." })),
      addBlocks: Type.Optional(Type.Array(Type.String(), { description: "Task IDs that this task blocks" })),
      addBlockedBy: Type.Optional(Type.Array(Type.String(), { description: "Task IDs that block this task" }))
    }),
    execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { taskId, ...fields } = params;
      const { task, changedFields, warnings } = store.update(taskId, fields);
      if (changedFields.length === 0 && !task) {
        return Promise.resolve(textResult(`Task #${taskId} not found`));
      }
      if (fields.status === "in_progress") {
        widget.setActiveTask(taskId);
        autoClear.resetBatchCountdown();
      } else if (fields.status === "pending") {
        autoClear.resetBatchCountdown();
      } else if (fields.status === "completed" || fields.status === "deleted") {
        widget.setActiveTask(taskId, false);
        if (fields.status === "completed")
          autoClear.trackCompletion(taskId, currentTurn);
      }
      widget.update();
      let msg = `Updated task #${taskId} ${changedFields.join(", ")}`;
      if (warnings.length > 0) {
        msg += ` (warning: ${warnings.join("; ")})`;
      }
      return Promise.resolve(textResult(msg));
    }
  });
  pi.registerTool({
    name: "TaskOutput",
    label: "TaskOutput",
    description: `- Retrieves output from a running or completed task (background shell, agent, or remote session)
- Takes a task_id parameter identifying the task
- Returns the task output along with status information
- Use block=true (default) to wait for task completion
- Use block=false for non-blocking check of current status
- Task IDs can be found using the /tasks command
- Works with all task types: background shells, async agents, and remote sessions`,
    parameters: Type.Object({
      task_id: Type.String({ description: "The task ID to get output from" }),
      block: Type.Boolean({ description: "Whether to wait for completion", default: true }),
      timeout: Type.Number({ description: "Max wait time in ms", default: 3e4, minimum: 0, maximum: 6e5 })
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const { task_id, block, timeout } = params;
      const processOutput = tracker.getOutput(task_id);
      if (!processOutput) {
        let resolvedId = task_id;
        if (!store.get(resolvedId)) {
          for (const [agentId, taskId] of agentTaskMap) {
            if (agentId === task_id || agentId.startsWith(task_id)) {
              resolvedId = taskId;
              break;
            }
          }
        }
        const task = store.get(resolvedId);
        if (!task)
          throw new Error(`No task found with ID ${task_id}`);
        if (task.metadata?.agentId) {
          if (block && task.status === "in_progress") {
            await new Promise((resolve2) => {
              const timer = setTimeout(() => {
                unsubOk();
                unsubFail();
                resolve2();
              }, timeout ?? 3e4);
              const cleanup = () => {
                clearTimeout(timer);
                resolve2();
              };
              const unsubOk = pi.events.on("subagents:completed", (d) => {
                if (d.id === task.metadata?.agentId) {
                  unsubOk();
                  unsubFail();
                  cleanup();
                }
              });
              const unsubFail = pi.events.on("subagents:failed", (d) => {
                if (d.id === task.metadata?.agentId) {
                  unsubOk();
                  unsubFail();
                  cleanup();
                }
              });
              const current = store.get(task_id);
              if (current && current.status !== "in_progress") {
                unsubOk();
                unsubFail();
                cleanup();
              }
              signal?.addEventListener("abort", () => {
                unsubOk();
                unsubFail();
                cleanup();
              }, { once: true });
            });
          }
          const updated = store.get(task_id) ?? task;
          return textResult(`Task #${task_id} [${updated.status}] \u2014 subagent ${task.metadata.agentId}`);
        }
        throw new Error(`No background process for task ${task_id}`);
      }
      if (block && processOutput.status === "running") {
        const result = await tracker.waitForCompletion(task_id, timeout ?? 3e4, signal ?? void 0);
        if (result) {
          return textResult(`Task #${task_id} (${result.status})${result.exitCode !== void 0 ? ` exit code: ${result.exitCode}` : ""}

${result.output}`);
        }
      }
      return textResult(`Task #${task_id} (${processOutput.status})${processOutput.exitCode !== void 0 ? ` exit code: ${processOutput.exitCode}` : ""}

${processOutput.output}`);
    }
  });
  pi.registerTool({
    name: "TaskStop",
    label: "TaskStop",
    description: `
- Stops a running background task by its ID
- Takes a task_id parameter identifying the task to stop
- Returns a success or failure status
- Use this tool when you need to terminate a long-running task`,
    parameters: Type.Object({
      task_id: Type.Optional(Type.String({ description: "The ID of the background task to stop" })),
      shell_id: Type.Optional(Type.String({ description: "Deprecated: use task_id instead" }))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const taskId = params.task_id ?? params.shell_id;
      if (!taskId)
        throw new Error("task_id is required");
      const stopped = await tracker.stop(taskId);
      if (!stopped) {
        let resolvedId = taskId;
        if (!store.get(resolvedId)) {
          for (const [agentId, tId] of agentTaskMap) {
            if (agentId === taskId || agentId.startsWith(taskId)) {
              resolvedId = tId;
              break;
            }
          }
        }
        const task = store.get(resolvedId);
        if (task?.metadata?.agentId && task.status === "in_progress") {
          store.update(taskId, { status: "completed" });
          autoClear.trackCompletion(taskId, currentTurn);
          await stopSubagent(task.metadata.agentId);
          widget.setActiveTask(taskId, false);
          widget.update();
          return textResult(`Task #${taskId} stopped successfully`);
        }
        throw new Error(`No running background process for task ${taskId}`);
      }
      store.update(taskId, { status: "completed" });
      autoClear.trackCompletion(taskId, currentTurn);
      widget.setActiveTask(taskId, false);
      widget.update();
      return textResult(`Task #${taskId} stopped successfully`);
    }
  });
  pi.registerTool({
    name: "TaskExecute",
    label: "TaskExecute",
    description: `Execute one or more tasks as subagents.

## When to Use This Tool

- To start execution of tasks that have \`agentType\` set (created via TaskCreate with agentType parameter)
- Tasks must be \`pending\` with all blockedBy dependencies \`completed\`
- Each task runs as an independent background subagent

## Parameters

- **task_ids**: Array of task IDs to execute
- **additional_context**: Extra context appended to each agent's prompt
- **model**: Model override for agents (e.g., "sonnet", "haiku")
- **max_turns**: Maximum turns per agent`,
    promptGuidelines: [
      "Never use the Agent tool for tasks launched via TaskExecute \u2014 agents are already running."
    ],
    parameters: Type.Object({
      task_ids: Type.Array(Type.String(), { description: "Task IDs to execute as subagents" }),
      additional_context: Type.Optional(Type.String({ description: "Extra context for agent prompts" })),
      model: Type.Optional(Type.String({ description: "Model override for agents" })),
      max_turns: Type.Optional(Type.Number({ description: "Max turns per agent", minimum: 1 }))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!subagentsAvailable) {
        return textResult("Subagent execution is currently unavailable. Ensure the @jeonghyeon.net/pi-subagents extension is loaded and try again.");
      }
      const results = [];
      const launched = [];
      for (const taskId of params.task_ids) {
        const task = store.get(taskId);
        if (!task) {
          results.push(`#${taskId}: not found`);
          continue;
        }
        if (task.status !== "pending") {
          results.push(`#${taskId}: not pending (status: ${task.status})`);
          continue;
        }
        if (!task.metadata?.agentType) {
          results.push(`#${taskId}: no agentType set \u2014 create with agentType parameter or update metadata`);
          continue;
        }
        const openBlockers = task.blockedBy.filter((bid) => {
          const blocker = store.get(bid);
          return !blocker || blocker.status !== "completed";
        });
        if (openBlockers.length > 0) {
          results.push(`#${taskId}: blocked by ${openBlockers.map((id) => "#" + id).join(", ")}`);
          continue;
        }
        store.update(taskId, { status: "in_progress" });
        const prompt = buildTaskPrompt(task, params.additional_context);
        try {
          const agentId = await spawnSubagent(task.metadata.agentType, prompt, {
            description: task.subject,
            isBackground: true,
            maxTurns: params.max_turns
          });
          agentTaskMap.set(agentId, taskId);
          store.update(taskId, { owner: agentId, metadata: { ...task.metadata, agentId } });
          widget.setActiveTask(taskId);
          launched.push(`#${taskId} \u2192 agent ${agentId}`);
        } catch (err) {
          debug(`spawn:error task=#${taskId}`, err);
          store.update(taskId, { status: "pending" });
          results.push(`#${taskId}: spawn failed \u2014 ${err.message}`);
        }
      }
      cascadeConfig = {
        additionalContext: params.additional_context,
        model: params.model,
        maxTurns: params.max_turns
      };
      widget.update();
      const lines = [];
      if (launched.length > 0) {
        lines.push(`Launched ${launched.length} agent(s):
${launched.join("\n")}
Use TaskOutput to check progress. Do not spawn additional agents for these tasks.`);
      }
      if (results.length > 0)
        lines.push(`Skipped:
${results.join("\n")}`);
      if (lines.length === 0)
        lines.push("No tasks to execute.");
      return textResult(lines.join("\n\n"));
    }
  });
  pi.registerCommand("tasks", {
    description: "Manage tasks \u2014 view, create, clear completed",
    handler: async (_args, ctx) => {
      const ui = ctx.ui;
      const mainMenu = async () => {
        const tasks = store.list();
        const taskCount = tasks.length;
        const completedCount = tasks.filter((t) => t.status === "completed").length;
        const choices = [
          `View all tasks (${taskCount})`,
          "Create task"
        ];
        if (completedCount > 0)
          choices.push(`Clear completed (${completedCount})`);
        if (taskCount > 0)
          choices.push(`Clear all (${taskCount})`);
        choices.push("Settings");
        const choice = await ui.select("Tasks", choices);
        if (!choice)
          return;
        if (choice.startsWith("View")) {
          await viewTasks();
        } else if (choice === "Create task") {
          await createTask();
        } else if (choice === "Settings") {
          await settingsMenu();
        } else if (choice.startsWith("Clear completed")) {
          store.clearCompleted();
          if (taskScope === "session")
            store.deleteFileIfEmpty();
          widget.update();
          await mainMenu();
        } else if (choice.startsWith("Clear all")) {
          store.clearAll();
          if (taskScope === "session")
            store.deleteFileIfEmpty();
          widget.update();
          await mainMenu();
        }
      };
      const viewTasks = async () => {
        const tasks = store.list();
        if (tasks.length === 0) {
          await ui.select("No tasks", ["\u2190 Back"]);
          return mainMenu();
        }
        const statusIcon = (status) => {
          switch (status) {
            case "completed":
              return "\u2714";
            case "in_progress":
              return "\u25D0";
            default:
              return "\u25FB";
          }
        };
        const choices = tasks.map((t) => `${statusIcon(t.status)} #${t.id} [${t.status}] ${t.subject}`);
        choices.push("\u2190 Back");
        const selected = await ui.select("Tasks", choices);
        if (!selected || selected === "\u2190 Back")
          return mainMenu();
        const match = selected.match(/#(\d+)/);
        if (match)
          await viewTaskDetail(match[1]);
        else
          return viewTasks();
      };
      const viewTaskDetail = async (taskId) => {
        const task = store.get(taskId);
        if (!task)
          return viewTasks();
        const actions = [];
        if (task.status === "pending") {
          actions.push("\u25B8 Start (in_progress)");
        }
        if (task.status === "in_progress") {
          actions.push("\u2713 Complete");
        }
        actions.push("\u2717 Delete");
        actions.push("\u2190 Back");
        const title = `#${task.id} [${task.status}] ${task.subject}
${task.description}`;
        const action = await ui.select(title, actions);
        if (action === "\u25B8 Start (in_progress)") {
          store.update(taskId, { status: "in_progress" });
          widget.setActiveTask(taskId);
          widget.update();
          return viewTasks();
        } else if (action === "\u2713 Complete") {
          store.update(taskId, { status: "completed" });
          autoClear.trackCompletion(taskId, currentTurn);
          widget.setActiveTask(taskId, false);
          widget.update();
          return viewTasks();
        } else if (action === "\u2717 Delete") {
          store.update(taskId, { status: "deleted" });
          widget.setActiveTask(taskId, false);
          widget.update();
          return viewTasks();
        }
        return viewTasks();
      };
      const settingsMenu = () => openSettingsMenu(ui, cfg, mainMenu, AUTO_CLEAR_DELAY);
      const createTask = async () => {
        const subject = await ui.input("Task subject");
        if (!subject)
          return mainMenu();
        const description = await ui.input("Task description");
        if (!description)
          return mainMenu();
        store.create(subject, description);
        widget.update();
        return mainMenu();
      };
      await mainMenu();
    }
  });
}
export {
  dist_default as default
};
