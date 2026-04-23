import { trimHookOutput } from "./text.js";
import { shouldNotifyParseError } from "./session-state.js";
import type { HookExecResult, LoadedSettings, RuntimeContextLike } from "./types.js";

export function notifyOnceForParseError(ctx: RuntimeContextLike, loaded: LoadedSettings): void {
  if (!loaded.parseError || !ctx.hasUI || !shouldNotifyParseError(loaded.path)) return;
  ctx.ui.notify(`[claude-hooks-bridge] ${loaded.parseError}`, "warning");
}
export function notifySessionStartHookResult(ctx: RuntimeContextLike, result: HookExecResult): void {
  if (!ctx.hasUI) return;
  const out = result.stdout.trim();
  const err = result.stderr.trim();
  if (out) ctx.ui.notify(trimHookOutput(out), "info");
  if (err) ctx.ui.notify(trimHookOutput(err), "warning");
}
