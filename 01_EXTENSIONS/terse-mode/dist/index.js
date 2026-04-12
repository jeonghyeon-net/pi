// src/constants.ts
var DEFAULT_ENABLED = true;
var STYLE_SECTION = "## Terse Response Style";
var STYLE_PROMPT = [
  "Respond tersely. Keep technical substance exact. Remove filler, pleasantries, and hedging.",
  "",
  "Prefer short sentences or fragments when clear. Use precise technical terms.",
  "Keep code blocks, commands, paths, URLs, and exact error text unchanged.",
  "",
  "Pattern: [thing] [action] [reason]. [next step].",
  "",
  "For security warnings, destructive actions, or ambiguous multi-step instructions, switch to explicit normal wording.",
  "Do not mention token savings, compression ratios, or caveman branding unless the user asks."
].join("\n");

// src/state.ts
var enabled = DEFAULT_ENABLED;
function isEnabled() {
  return enabled;
}
function setEnabled(next) {
  const changed = enabled !== next;
  enabled = next;
  return changed;
}

// src/command.ts
function createTerseCommand(saveState) {
  return {
    description: "\uC9E7\uC740 \uC751\uB2F5 \uC2A4\uD0C0\uC77C \uC81C\uC5B4. \uC0AC\uC6A9\uBC95: /terse on|off|status|toggle",
    handler: async (args, ctx) => {
      const action = normalizeAction(args);
      if (action === "status") return notifyStatus(ctx.ui.notify.bind(ctx.ui));
      if (action === "on") return applyState(true, saveState, ctx.ui.notify.bind(ctx.ui));
      if (action === "off") return applyState(false, saveState, ctx.ui.notify.bind(ctx.ui));
      if (action === "toggle") return applyState(!isEnabled(), saveState, ctx.ui.notify.bind(ctx.ui));
      ctx.ui.notify("\uC0AC\uC6A9\uBC95: /terse on|off|status|toggle", "warning");
    }
  };
}
function normalizeAction(raw) {
  const trimmed = raw.trim().toLowerCase();
  return trimmed || "status";
}
async function applyState(next, saveState, notify) {
  const previous = isEnabled();
  const changed = setEnabled(next);
  if (!changed) return notify(next ? "terse mode \uC774\uBBF8 \uCF1C\uC838 \uC788\uC5B4." : "terse mode \uC774\uBBF8 \uAEBC\uC838 \uC788\uC5B4.", "info");
  try {
    await saveState(next);
    notify(next ? "terse mode \uCF30\uC5B4. \uC0C8 \uC138\uC158\uC5D0\uB3C4 \uC720\uC9C0\uB3FC." : "terse mode \uAED0\uC5B4. \uC0C8 \uC138\uC158\uC5D0\uB3C4 \uC720\uC9C0\uB3FC.", "info");
  } catch {
    setEnabled(previous);
    notify("terse mode \uC0C1\uD0DC \uC800\uC7A5 \uC2E4\uD328. \uAE30\uC874 \uAC12\uC73C\uB85C \uC720\uC9C0\uD588\uC5B4.", "error");
  }
}
function notifyStatus(notify) {
  notify(isEnabled() ? "terse mode \uD604\uC7AC \uCF1C\uC9D0." : "terse mode \uD604\uC7AC \uAEBC\uC9D0.", "info");
}

// src/config.ts
import { getAgentDir, withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
function getConfigPath(baseDir = getAgentDir()) {
  return join(baseDir, "extensions", "terse-mode.json");
}
async function loadGlobalState(path = getConfigPath()) {
  if (!existsSync(path)) return DEFAULT_ENABLED;
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return isPersistedConfig(parsed) ? parsed.enabled : DEFAULT_ENABLED;
  } catch {
    return DEFAULT_ENABLED;
  }
}
async function saveGlobalState(enabled2, path = getConfigPath()) {
  await withFileMutationQueue(path, async () => {
    await mkdir(dirname(path), { recursive: true });
    const data = { enabled: enabled2 };
    const tempPath = `${path}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(data, null, 2)}
`, "utf8");
    await rename(tempPath, path);
  });
}
function isPersistedConfig(value) {
  if (!isRecord(value)) return false;
  return typeof value.enabled === "boolean";
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}

// src/handlers.ts
function onRestore(loadState = loadGlobalState) {
  return async () => {
    try {
      setEnabled(await loadState());
    } catch {
      setEnabled(DEFAULT_ENABLED);
    }
  };
}
function onBeforeAgentStart() {
  return async (event) => {
    if (!isEnabled()) return void 0;
    return {
      systemPrompt: `${event.systemPrompt}

${STYLE_SECTION}
${STYLE_PROMPT}`
    };
  };
}

// src/index.ts
function index_default(pi) {
  pi.registerCommand("terse", createTerseCommand(saveGlobalState));
  pi.on("session_start", onRestore());
  pi.on("session_tree", onRestore());
  pi.on("before_agent_start", onBeforeAgentStart());
}
export {
  index_default as default
};
