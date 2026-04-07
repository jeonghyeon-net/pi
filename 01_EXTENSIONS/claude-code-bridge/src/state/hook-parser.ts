import { DEFAULT_TIMEOUT_SECONDS, SUPPORTED_EVENTS, hookTypeAllowed } from "../core/constants.js";
import type { EventName, HookDef, HookKind, Scope } from "../core/types.js";

export function addHookGroups(eventName: string, groups: any, path: string, scope: Scope, warnings: string[], hooksByEvent: Map<EventName, HookDef[]>) {
	if (!SUPPORTED_EVENTS.has(eventName as EventName)) return warnings.push(`Claude event '${eventName}' exists in ${path} but is not bridged by this extension.`);
	if (!Array.isArray(groups)) return;
	for (const group of groups) for (const hookDef of Array.isArray(group?.hooks) ? group.hooks : []) addHook(eventName as EventName, group, hookDef, path, scope, warnings, hooksByEvent);
}

function addHook(eventName: EventName, group: any, hookDef: any, path: string, scope: Scope, warnings: string[], hooksByEvent: Map<EventName, HookDef[]>) {
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

function buildHookDef(eventName: EventName, group: any, hookDef: any, path: string, scope: Scope): HookDef | undefined {
	const type = hookDef.type as HookKind;
	const base: HookDef = { eventName, type, scope, sourcePath: path, matcher: typeof group?.matcher === "string" ? group.matcher : undefined, timeoutSeconds: typeof hookDef?.timeout === "number" ? hookDef.timeout : DEFAULT_TIMEOUT_SECONDS[type], async: hookDef?.async === true };
	if (type === "command") return typeof hookDef?.command === "string" ? { ...base, command: hookDef.command } : undefined;
	if (type === "http") return typeof hookDef?.url === "string" ? { ...base, url: hookDef.url, headers: hookDef?.headers && typeof hookDef.headers === "object" ? hookDef.headers : undefined, allowedEnvVars: Array.isArray(hookDef?.allowedEnvVars) ? hookDef.allowedEnvVars.filter((value: unknown) => typeof value === "string") : undefined } : undefined;
	return typeof hookDef?.prompt === "string" ? { ...base, prompt: hookDef.prompt, model: typeof hookDef?.model === "string" ? hookDef.model : undefined } : undefined;
}

function isHookType(value: unknown): value is HookKind {
	return value === "command" || value === "http" || value === "prompt" || value === "agent";
}
