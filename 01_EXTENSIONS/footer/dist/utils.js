import { execFile } from "node:child_process";
import { STATUS_STYLE_MAP } from "./types.js";
/* v8 ignore next 7 */
export function defaultExec(command, args, options) {
    return new Promise((resolve) => {
        execFile(command, args, { cwd: options?.cwd }, (error, stdout) => {
            resolve({ stdout: stdout ?? "", code: error ? 1 : 0 });
        });
    });
}
export function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
export function getFolderName(cwd) {
    const parts = cwd.split(/[\\/]/).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : cwd || "unknown";
}
export function sanitizeStatusText(text) {
    return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}
export function styleStatus(theme, key, text) {
    const style = STATUS_STYLE_MAP[key];
    return style ? style(theme, text) : text;
}
export async function getRepoName(cwd, exec) {
    const result = await exec("git", ["remote", "get-url", "origin"], { cwd });
    if (result.code !== 0 || !result.stdout?.trim())
        return null;
    const url = result.stdout.trim();
    const match = url.match(/\/([^/]+?)(?:\.git)?$/);
    if (!match)
        return null;
    return match[1];
}
export async function hasUncommittedChanges(cwd, exec) {
    const result = await exec("git", ["status", "--porcelain=1", "--untracked-files=normal"], { cwd });
    if (result.code !== 0)
        return false;
    return result.stdout.trim().length > 0;
}
