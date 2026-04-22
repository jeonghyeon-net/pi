var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/glimpseui/src/follow-cursor-support.mjs
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
function nativeBinaryExists() {
  return existsSync(join(__dirname, "glimpse"));
}
function env(name) {
  return (process.env[name] || "").toLowerCase();
}
function hyprlandSocketExists() {
  const signature = process.env.HYPRLAND_INSTANCE_SIGNATURE;
  if (!signature) return false;
  const candidates = [];
  if (process.env.XDG_RUNTIME_DIR) {
    candidates.push(join(process.env.XDG_RUNTIME_DIR, "hypr", signature, ".socket.sock"));
  }
  if (process.env.UID) {
    candidates.push(join("/run/user", process.env.UID, "hypr", signature, ".socket.sock"));
  }
  candidates.push(join("/tmp", "hypr", signature, ".socket.sock"));
  return candidates.some((path) => existsSync(path));
}
function detect() {
  if (process.platform === "darwin") {
    return { supported: true, reason: null };
  }
  if (process.platform === "win32") {
    return { supported: true, reason: null };
  }
  if (process.platform !== "linux") {
    return { supported: false, reason: `unsupported platform: ${process.platform}` };
  }
  const sessionType = env("XDG_SESSION_TYPE");
  const desktop = [env("XDG_CURRENT_DESKTOP"), env("DESKTOP_SESSION")].filter(Boolean).join(" ");
  const isHyprland = Boolean(process.env.HYPRLAND_INSTANCE_SIGNATURE) || desktop.includes("hyprland");
  const isWayland = Boolean(process.env.WAYLAND_DISPLAY) || sessionType === "wayland";
  const isX11 = Boolean(process.env.DISPLAY) || sessionType === "x11";
  if (isHyprland) {
    return hyprlandSocketExists() ? { supported: true, reason: null } : { supported: false, reason: "Hyprland detected but its IPC socket was not found" };
  }
  const usingChromium = process.env.GLIMPSE_BACKEND === "chromium" || process.platform === "linux" && !nativeBinaryExists();
  if (isWayland && !usingChromium) {
    return { supported: false, reason: "Wayland follow-cursor is disabled without a compositor-specific backend" };
  }
  if (isX11) {
    if (usingChromium) {
      return { supported: true, reason: null };
    }
    return { supported: false, reason: "X11 follow-cursor backend is not implemented yet" };
  }
  return { supported: false, reason: "No supported follow-cursor backend detected" };
}
function getFollowCursorSupport() {
  if (!cached) cached = detect();
  return cached;
}
function supportsFollowCursor() {
  return getFollowCursorSupport().supported;
}
var __dirname, cached;
var init_follow_cursor_support = __esm({
  "node_modules/glimpseui/src/follow-cursor-support.mjs"() {
    __dirname = dirname(fileURLToPath(import.meta.url));
    cached = null;
  }
});

// node_modules/glimpseui/src/glimpse.mjs
var glimpse_exports = {};
__export(glimpse_exports, {
  getFollowCursorSupport: () => getFollowCursorSupport,
  getNativeHostInfo: () => getNativeHostInfo,
  open: () => open,
  prompt: () => prompt,
  statusItem: () => statusItem,
  supportsFollowCursor: () => supportsFollowCursor
});
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync as existsSync2, readFileSync } from "node:fs";
import { dirname as dirname2, isAbsolute, join as join2, normalize, resolve } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
function resolveChromiumBackend() {
  return {
    path: process.execPath,
    extraArgs: [join2(__dirname2, "chromium-backend.mjs")],
    platform: "linux-chromium",
    buildHint: "Using system Chromium via CDP (no native binary needed)"
  };
}
function resolveNativeHost() {
  const override = process.env.GLIMPSE_BINARY_PATH || process.env.GLIMPSE_HOST_PATH;
  if (override) {
    return {
      path: isAbsolute(override) ? override : resolve(process.cwd(), override),
      platform: "override",
      buildHint: `Using override: ${override}`
    };
  }
  switch (process.platform) {
    case "darwin":
      return {
        path: join2(__dirname2, "glimpse"),
        platform: "darwin",
        buildHint: "Run 'npm run build:macos' or 'swiftc -O src/glimpse.swift -o src/glimpse'"
      };
    case "linux": {
      const backend = process.env.GLIMPSE_BACKEND;
      if (backend === "chromium") return resolveChromiumBackend();
      const nativePath = join2(__dirname2, "glimpse");
      if (backend === "native" || existsSync2(nativePath)) {
        return {
          path: nativePath,
          platform: "linux",
          buildHint: "Run 'npm run build:linux' (requires Rust toolchain and GTK4/WebKitGTK dev packages)"
        };
      }
      return resolveChromiumBackend();
    }
    case "win32":
      return {
        path: normalize(join2(__dirname2, "..", "native", "windows", "bin", "glimpse.exe")),
        platform: "win32",
        buildHint: "Run 'npm run build:windows' (requires .NET 8 SDK and WebView2 Runtime)"
      };
    default:
      throw new Error(`Unsupported platform: ${process.platform}. Glimpse supports macOS, Linux, and Windows.`);
  }
}
function getNativeHostInfo() {
  return resolveNativeHost();
}
function ensureBinary() {
  const host = resolveNativeHost();
  if (host.platform === "linux-chromium") return host;
  if (!existsSync2(host.path)) {
    const skippedBuildPath = join2(__dirname2, "..", ".glimpse-build-skipped");
    const skippedReason = existsSync2(skippedBuildPath) ? readFileSync(skippedBuildPath, "utf8").trim() : null;
    throw new Error(
      skippedReason ? `Glimpse host not found at '${host.path}'. ${skippedReason}` : `Glimpse host not found at '${host.path}'. ${host.buildHint}`
    );
  }
  return host;
}
function open(html, options = {}) {
  const host = ensureBinary();
  const args = [];
  if (options.width != null) args.push("--width", String(options.width));
  if (options.height != null) args.push("--height", String(options.height));
  if (options.title != null) args.push("--title", options.title);
  if (options.frameless) args.push("--frameless");
  if (options.floating) args.push("--floating");
  if (options.transparent) args.push("--transparent");
  if (options.clickThrough) args.push("--click-through");
  if (options.hidden) args.push("--hidden");
  if (options.autoClose) args.push("--auto-close");
  const supportsOpenLinks = host.platform === "darwin" || host.platform === "override";
  if (options.openLinks && supportsOpenLinks) args.push("--open-links");
  if (options.openLinksApp && supportsOpenLinks) args.push("--open-links-app", options.openLinksApp);
  if (options.followCursor && supportsFollowCursor()) {
    args.push("--follow-cursor");
  } else if (options.followCursor) {
    const { reason } = getFollowCursorSupport();
    process.emitWarning(`followCursor disabled: ${reason}`, { code: "GLIMPSE_FOLLOW_CURSOR_UNSUPPORTED" });
  }
  if (options.x != null) args.push(`--x=${options.x}`);
  if (options.y != null) args.push(`--y=${options.y}`);
  if (options.cursorOffset?.x != null) args.push(`--cursor-offset-x=${options.cursorOffset.x}`);
  if (options.cursorOffset?.y != null) args.push(`--cursor-offset-y=${options.cursorOffset.y}`);
  if (options.cursorAnchor) args.push("--cursor-anchor", options.cursorAnchor);
  if (options.followMode != null) args.push("--follow-mode", options.followMode);
  const spawnArgs = [...host.extraArgs || [], ...args];
  const proc = spawn(host.path, spawnArgs, {
    stdio: ["pipe", "pipe", "inherit"],
    windowsHide: process.platform === "win32"
  });
  return new GlimpseWindow(proc, html);
}
function statusItem(html, options = {}) {
  const host = ensureBinary();
  if (host.platform !== "darwin" && host.platform !== "linux-chromium") {
    throw new Error(`statusItem() is only supported on macOS and Linux/Chromium (current platform: ${host.platform})`);
  }
  const args = ["--status-item"];
  if (options.width != null) args.push("--width", String(options.width));
  if (options.height != null) args.push("--height", String(options.height));
  if (options.title != null) args.push("--title", options.title);
  const spawnArgs = [...host.extraArgs || [], ...args];
  const proc = spawn(host.path, spawnArgs, { stdio: ["pipe", "pipe", "inherit"] });
  return new GlimpseStatusItem(proc, html);
}
function prompt(html, options = {}) {
  return new Promise((resolve2, reject) => {
    const win = open(html, { ...options, autoClose: true });
    let resolved = false;
    const timer = options.timeout ? setTimeout(() => {
      if (!resolved) {
        resolved = true;
        win.close();
        reject(new Error("Prompt timed out"));
      }
    }, options.timeout) : null;
    win.once("message", (data) => {
      if (!resolved) {
        resolved = true;
        if (timer) clearTimeout(timer);
        resolve2(data);
      }
    });
    win.once("closed", () => {
      if (timer) clearTimeout(timer);
      if (!resolved) {
        resolved = true;
        resolve2(null);
      }
    });
    win.once("error", (err) => {
      if (timer) clearTimeout(timer);
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
  });
}
var __dirname2, GlimpseWindow, GlimpseStatusItem;
var init_glimpse = __esm({
  "node_modules/glimpseui/src/glimpse.mjs"() {
    init_follow_cursor_support();
    __dirname2 = dirname2(fileURLToPath2(import.meta.url));
    GlimpseWindow = class extends EventEmitter {
      #proc;
      #closed = false;
      #pendingHTML = null;
      #info = null;
      constructor(proc, initialHTML) {
        super();
        this.#proc = proc;
        this.#pendingHTML = initialHTML;
        proc.stdin.on("error", () => {
        });
        const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });
        rl.on("line", (line) => {
          let msg;
          try {
            msg = JSON.parse(line);
          } catch {
            this.emit("error", new Error(`Malformed protocol line: ${line}`));
            return;
          }
          switch (msg.type) {
            case "ready": {
              const info = { screen: msg.screen, screens: msg.screens, appearance: msg.appearance, cursor: msg.cursor, cursorTip: msg.cursorTip ?? null };
              this.#info = info;
              if (this.#pendingHTML) {
                this.setHTML(this.#pendingHTML);
                this.#pendingHTML = null;
              } else {
                this.emit("ready", info);
              }
              break;
            }
            case "info":
              this.#info = { screen: msg.screen, screens: msg.screens, appearance: msg.appearance, cursor: msg.cursor, cursorTip: msg.cursorTip ?? null };
              this.emit("info", this.#info);
              break;
            case "message":
              this.emit("message", msg.data);
              break;
            case "click":
              this.emit("click");
              break;
            case "closed":
              if (!this.#closed) {
                this.#closed = true;
                this.emit("closed");
              }
              break;
            default:
              break;
          }
        });
        proc.on("error", (err) => this.emit("error", err));
        proc.on("exit", () => {
          if (!this.#closed) {
            this.#closed = true;
            this.emit("closed");
          }
        });
      }
      #write(obj) {
        if (this.#closed) return;
        this.#proc.stdin.write(JSON.stringify(obj) + "\n");
      }
      /** @internal — for subclass use only */
      _write(obj) {
        this.#write(obj);
      }
      send(js) {
        this.#write({ type: "eval", js });
      }
      setHTML(html) {
        this.#write({ type: "html", html: Buffer.from(html).toString("base64") });
      }
      show(options = {}) {
        const msg = { type: "show" };
        if (options.title != null) msg.title = options.title;
        this.#write(msg);
      }
      close() {
        this.#write({ type: "close" });
      }
      loadFile(path) {
        this.#write({ type: "file", path });
      }
      get info() {
        return this.#info;
      }
      getInfo() {
        this.#write({ type: "get-info" });
      }
      followCursor(enabled, anchor, mode) {
        if (enabled && !supportsFollowCursor()) {
          const { reason } = getFollowCursorSupport();
          process.emitWarning(`followCursor disabled: ${reason}`, { code: "GLIMPSE_FOLLOW_CURSOR_UNSUPPORTED" });
          return;
        }
        const msg = { type: "follow-cursor", enabled };
        if (anchor !== void 0) msg.anchor = anchor;
        if (mode !== void 0) msg.mode = mode;
        this.#write(msg);
      }
    };
    GlimpseStatusItem = class extends GlimpseWindow {
      setTitle(title) {
        this._write({ type: "title", title });
      }
      resize(width, height) {
        this._write({ type: "resize", width, height });
      }
    };
  }
});

// lib/original-git.js
import { readFile as F } from "node:fs/promises";
import { extname as M, join as A } from "node:path";
var W = "__pi_working_tree__";
var N = "WT";
var O = "Uncommitted changes";
function y(e) {
  return e === W;
}
function X() {
  return { sha: W, shortSha: N, subject: O, authorName: "", authorDate: "", kind: "working-tree" };
}
async function f(e, t, n) {
  const i = await e.exec("git", n, { cwd: t });
  return i.code !== 0 ? "" : i.stdout;
}
async function z(e, t, n) {
  const i = await e.exec("bash", ["-lc", n], { cwd: t });
  return i.code !== 0 ? "" : i.stdout;
}
async function G(e, t) {
  const n = await e.exec("git", ["rev-parse", "--show-toplevel"], { cwd: t });
  if (n.code !== 0) throw new Error("Not inside a git repository.");
  return n.stdout.trim();
}
async function p(e, t) {
  return (await e.exec("git", ["rev-parse", "--verify", "HEAD"], { cwd: t })).code === 0;
}
async function K(e, t) {
  const n = await e.exec("git", ["branch", "--show-current"], { cwd: t });
  return n.code === 0 && n.stdout.trim() || "HEAD";
}
async function L(e, t) {
  const i = (await f(e, t, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])).trim();
  return i.length > 0 ? i : null;
}
async function J(e, t) {
  const i = (await f(e, t, ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"])).trim();
  return i.length > 0 ? i : null;
}
function Q(e, t) {
  return !t || t === "HEAD" ? false : e === t || e.endsWith(`/${t}`);
}
async function Z(e, t) {
  const n = await K(e, t), i = [], r = await L(e, t);
  r && !Q(r, n) && i.push(r);
  const a = await J(e, t);
  a && i.push(a), i.push("origin/main", "origin/master", "origin/develop", "main", "master", "develop");
  const o = /* @__PURE__ */ new Set();
  for (const s of i) {
    if (!s || o.has(s)) continue;
    o.add(s);
    const u = (await f(e, t, ["merge-base", "HEAD", s])).trim();
    if (u.length > 0) return { mergeBase: u, baseRef: s };
  }
  return null;
}
function q(e) {
  const t = (e[0] ?? "")[0];
  if (t === "R") {
    const i = e[1] ?? null, r = e[2] ?? null;
    return i == null || r == null ? null : { status: "renamed", oldPath: i, newPath: r };
  }
  const n = e[1] ?? null;
  return n == null ? null : t === "M" ? { status: "modified", oldPath: n, newPath: n } : t === "A" ? { status: "added", oldPath: null, newPath: n } : t === "D" ? { status: "deleted", oldPath: n, newPath: null } : null;
}
function C(e) {
  const t = e.split(/\r?\n/).map((i) => i.trim()).filter((i) => i.length > 0), n = [];
  for (const i of t) {
    const r = q(i.split("	"));
    r != null && n.push(r);
  }
  return n;
}
function H(e) {
  const t = { hasChanges: false, hasReviewableChanges: false, hasUntracked: false, hasTrackedDeletions: false, hasRenames: false, untrackedPaths: [] }, n = e.split("\0");
  for (let i = 0; i < n.length; ) {
    const r = n[i] ?? "";
    if (r.length === 0) {
      i += 1;
      continue;
    }
    const a = r.slice(0, 2), o = r.slice(3), s = a.includes("R") || a.includes("C"), u = a !== "!!" && o.length > 0 && x(o);
    a !== "!!" && (t.hasChanges = true), u && (t.hasReviewableChanges = true), a === "??" ? u && (t.hasUntracked = true, t.untrackedPaths.push(o)) : u && (a.includes("D") && (t.hasTrackedDeletions = true), s && (t.hasRenames = true)), i += s ? 2 : 1;
  }
  return t;
}
async function V(e, t) {
  const n = await f(e, t, ["status", "--porcelain=1", "--untracked-files=all", "-z"]);
  return H(n);
}
function Y(e) {
  return e.status === "renamed" ? `${e.oldPath ?? ""} -> ${e.newPath ?? ""}` : e.newPath ?? e.oldPath ?? "(unknown)";
}
function v(e) {
  return { status: e.status, oldPath: e.oldPath, newPath: e.newPath, displayPath: Y(e), hasOriginal: e.oldPath != null, hasModified: e.newPath != null };
}
function ee(e, t, n) {
  return ["branch", e, t ? "working" : "gone", n.displayPath].join("::");
}
function D(e, t) {
  return ["commit", e, t.displayPath].join("::");
}
async function w(e, t, n, i) {
  const r = await e.exec("git", ["show", `${n}:${i}`], { cwd: t });
  return r.code !== 0 ? "" : r.stdout;
}
async function k(e, t) {
  try {
    return await F(A(e, t), "utf8");
  } catch {
    return "";
  }
}
async function ne(e, t) {
  try {
    return await F(A(e, t));
  } catch {
    return null;
  }
}
function T(e) {
  return `'${e.replace(/'/g, "'\\''")}'`;
}
async function te(e, t, n, i) {
  const r = T(`${n}:${i}`), a = await e.exec("bash", ["-lc", `git show ${r} | base64 | tr -d '\\n'`], { cwd: t });
  if (a.code !== 0) return null;
  const o = (a.stdout ?? "").trim();
  try {
    return Buffer.from(o, "base64");
  } catch {
    return null;
  }
}
var ie = /* @__PURE__ */ new Map([[".avif", "image/avif"], [".bmp", "image/bmp"], [".gif", "image/gif"], [".ico", "image/x-icon"], [".jpeg", "image/jpeg"], [".jpg", "image/jpeg"], [".png", "image/png"], [".webp", "image/webp"]]);
var re = /* @__PURE__ */ new Set([".7z", ".a", ".avi", ".avif", ".bin", ".bmp", ".class", ".dll", ".dylib", ".eot", ".exe", ".gif", ".gz", ".ico", ".jar", ".jpeg", ".jpg", ".lockb", ".map", ".mov", ".mp3", ".mp4", ".o", ".otf", ".pdf", ".png", ".pyc", ".so", ".svgz", ".tar", ".ttf", ".wasm", ".webm", ".webp", ".woff", ".woff2", ".zip"]);
function se(e) {
  const t = M(e.toLowerCase()), n = ie.get(t) ?? null;
  return n != null ? { kind: "image", mimeType: n } : re.has(t) ? { kind: "binary", mimeType: null } : { kind: "text", mimeType: null };
}
function x(e) {
  const t = e.toLowerCase(), n = t.split("/").pop() ?? t;
  return !(n.length === 0 || n.endsWith(".min.js") || n.endsWith(".min.css"));
}
function S(e, t) {
  return `data:${t};base64,${e.toString("base64")}`;
}
function E(e, t) {
  const n = v(e), i = e.newPath ?? e.oldPath ?? n.displayPath, r = se(i);
  return { id: t.id, path: i, worktreeStatus: t.worktreeStatus, hasWorkingTreeFile: t.hasWorkingTreeFile, inGitDiff: true, gitDiff: n, kind: r.kind, mimeType: r.mimeType };
}
async function b(e, t, n) {
  if (t == null) return { exists: false, previewUrl: null };
  const i = await ne(e, t);
  return i == null ? { exists: false, previewUrl: null } : { exists: true, previewUrl: n ? S(i, n) : null };
}
async function P(e, t, n, i, r) {
  if (i == null) return { exists: false, previewUrl: null };
  const a = await te(e, t, n, i);
  return a == null ? { exists: false, previewUrl: null } : { exists: true, previewUrl: r ? S(a, r) : null };
}
function ae(...e) {
  const t = /* @__PURE__ */ new Map();
  for (const n of e) for (const i of n) {
    const r = i.newPath ?? i.oldPath ?? "";
    r.length !== 0 && t.set(r, i);
  }
  return [...t.values()];
}
function oe(e) {
  return e.map((t) => ({ status: "added", oldPath: null, newPath: t }));
}
function B(e, t) {
  return t.hasRenames ? true : t.hasUntracked ? e.some((n) => n.status === "deleted") : false;
}
async function le(e, t, n) {
  return C(await f(e, t, ["diff", "--find-renames", "-M", "--name-status", n, "--"]));
}
async function _(e, t, n) {
  const i = ["set -euo pipefail", 'tmp_index=$(mktemp "/tmp/pi-diff-review-index.XXXXXX")', `trap 'rm -f "$tmp_index"' EXIT`, 'export GIT_INDEX_FILE="$tmp_index"'];
  n != null ? i.push(`git read-tree ${T(n)}`) : i.push('rm -f "$tmp_index"'), i.push("git add -A -- ."), i.push(n != null ? `git diff --cached --find-renames -M --name-status ${T(n)} --` : "git diff --cached --find-renames -M --name-status --root --");
  const r = await z(e, t, i.join(`
`));
  return C(r);
}
async function ue(e, t, n, i) {
  if (!n) return [];
  const r = await le(e, t, n);
  return B(r, i) ? _(e, t, n) : ae(r, oe(i.untrackedPaths));
}
async function $(e, t, n) {
  return _(e, t, n ? "HEAD" : null);
}
function I(e, t) {
  return e.path.localeCompare(t.path);
}
function de(e) {
  const t = v(e), n = e.newPath ?? e.oldPath ?? t.displayPath;
  return E(e, { id: ee(n, e.newPath != null, t), worktreeStatus: e.status, hasWorkingTreeFile: e.newPath != null });
}
async function fe(e, t) {
  const n = await G(e, t), i = await p(e, n), r = i ? await Z(e, n) : null, a = r?.mergeBase ?? (i ? "HEAD" : null), o = await V(e, n), u = (i ? await ue(e, n, a, o) : await $(e, n, false)).filter((m) => x(m.newPath ?? m.oldPath ?? "")).map(de).sort(I), h = r ? await j(e, n, `${r.mergeBase}..HEAD`, 100) : [], l = o.hasReviewableChanges ? [X()] : [], d = i && u.length === 0 && h.length === 0 && !o.hasReviewableChanges ? await j(e, n, "HEAD", 20) : h;
  return { repoRoot: n, files: u, commits: [...l, ...d], branchBaseRef: r?.baseRef ?? null, branchMergeBaseSha: a, repositoryHasHead: i };
}
async function j(e, t, n, i) {
  const a = ["%H", "%h", "%s", "%an", "%aI"].join("");
  return (await f(e, t, ["log", `-${i}`, `--format=${a}`, n])).split(/\r?\n/).map((s) => s.trimEnd()).filter((s) => s.length > 0).map((s) => {
    const [u, h, l, d, m] = s.split("");
    return { sha: u ?? "", shortSha: h ?? (u ?? "").slice(0, 7), subject: l ?? "", authorName: d ?? "", authorDate: m ?? "", kind: "commit" };
  }).filter((s) => s.sha.length > 0);
}
async function he(e, t, n) {
  if (y(n)) {
    const a = await p(e, t);
    return (await $(e, t, a)).filter((s) => x(s.newPath ?? s.oldPath ?? "")).map((s) => {
      const u = v(s);
      return E(s, { id: D(n, u), worktreeStatus: s.status, hasWorkingTreeFile: s.newPath != null });
    }).sort(I);
  }
  const i = await f(e, t, ["diff-tree", "--root", "--find-renames", "-M", "--name-status", "--no-commit-id", "-r", n]);
  return C(i).filter((a) => x(a.newPath ?? a.oldPath ?? "")).map((a) => {
    const o = v(a);
    return E(a, { id: D(n, o), worktreeStatus: null, hasWorkingTreeFile: false });
  }).sort(I);
}
async function we(e, t, n, i, r = null, a = null) {
  const o = { originalContent: "", modifiedContent: "", kind: n.kind, mimeType: n.mimeType, originalExists: false, modifiedExists: false, originalPreviewUrl: null, modifiedPreviewUrl: null };
  if (n.kind !== "text") {
    if (i === "all") {
      const g = n.gitDiff?.newPath ?? (n.hasWorkingTreeFile ? n.path : null), c = n.hasWorkingTreeFile ? await b(t, g, n.mimeType) : await P(e, t, "HEAD", g, n.mimeType);
      return { ...o, modifiedExists: c.exists, modifiedPreviewUrl: c.previewUrl };
    }
    const l = n.gitDiff;
    if (l == null) return o;
    if (i === "commits") {
      if (!r) return o;
      if (y(r)) {
        const U = await p(e, t) ? await P(e, t, "HEAD", l.oldPath, n.mimeType) : { exists: false, previewUrl: null }, R = n.hasWorkingTreeFile ? await b(t, l.newPath, n.mimeType) : { exists: false, previewUrl: null };
        return { ...o, originalExists: U.exists, modifiedExists: R.exists, originalPreviewUrl: U.previewUrl, modifiedPreviewUrl: R.previewUrl };
      }
      const g = await P(e, t, `${r}^`, l.oldPath, n.mimeType), c = await P(e, t, r, l.newPath, n.mimeType);
      return { ...o, originalExists: g.exists, modifiedExists: c.exists, originalPreviewUrl: g.previewUrl, modifiedPreviewUrl: c.previewUrl };
    }
    if (!a) return o;
    const d = await P(e, t, a, l.oldPath, n.mimeType), m = n.hasWorkingTreeFile ? await b(t, l.newPath, n.mimeType) : await P(e, t, "HEAD", l.newPath, n.mimeType);
    return { ...o, originalExists: d.exists, modifiedExists: m.exists, originalPreviewUrl: d.previewUrl, modifiedPreviewUrl: m.previewUrl };
  }
  if (i === "all") {
    const l = n.gitDiff?.newPath ?? (n.hasWorkingTreeFile ? n.path : null), d = l == null ? "" : n.hasWorkingTreeFile ? await k(t, l) : await w(e, t, "HEAD", l);
    return { originalContent: d, modifiedContent: d, kind: n.kind, mimeType: n.mimeType, originalExists: l != null, modifiedExists: l != null, originalPreviewUrl: null, modifiedPreviewUrl: null };
  }
  const s = n.gitDiff;
  if (s == null) return { originalContent: "", modifiedContent: "", kind: n.kind, mimeType: n.mimeType, originalExists: false, modifiedExists: false, originalPreviewUrl: null, modifiedPreviewUrl: null };
  if (i === "commits") {
    if (!r) return { originalContent: "", modifiedContent: "", kind: n.kind, mimeType: n.mimeType, originalExists: false, modifiedExists: false, originalPreviewUrl: null, modifiedPreviewUrl: null };
    if (y(r)) {
      const m = await p(e, t), g = m && s.oldPath != null ? await w(e, t, "HEAD", s.oldPath) : "", c = s.newPath == null ? "" : n.hasWorkingTreeFile ? await k(t, s.newPath) : "";
      return { originalContent: g, modifiedContent: c, kind: n.kind, mimeType: n.mimeType, originalExists: m && s.oldPath != null, modifiedExists: s.newPath != null, originalPreviewUrl: null, modifiedPreviewUrl: null };
    }
    const l = s.oldPath == null ? "" : await w(e, t, `${r}^`, s.oldPath), d = s.newPath == null ? "" : await w(e, t, r, s.newPath);
    return { originalContent: l, modifiedContent: d, kind: n.kind, mimeType: n.mimeType, originalExists: s.oldPath != null, modifiedExists: s.newPath != null, originalPreviewUrl: null, modifiedPreviewUrl: null };
  }
  if (!a) return { originalContent: "", modifiedContent: "", kind: n.kind, mimeType: n.mimeType, originalExists: false, modifiedExists: false, originalPreviewUrl: null, modifiedPreviewUrl: null };
  const u = s.oldPath == null ? "" : await w(e, t, a, s.oldPath), h = s.newPath == null ? "" : n.hasWorkingTreeFile ? await k(t, s.newPath) : await w(e, t, "HEAD", s.newPath);
  return { originalContent: u, modifiedContent: h, kind: n.kind, mimeType: n.mimeType, originalExists: s.oldPath != null, modifiedExists: s.newPath != null, originalPreviewUrl: null, modifiedPreviewUrl: null };
}

// lib/message-guards.ts
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function hasType(value, type) {
  return isRecord(value) && value.type === type;
}
function isRequestCommit(value) {
  return hasType(value, "request-commit") && typeof value.requestId === "string" && typeof value.sha === "string";
}
function isRequestFile(value) {
  return hasType(value, "request-file") && typeof value.requestId === "string" && typeof value.fileId === "string" && (value.scope === "branch" || value.scope === "commits" || value.scope === "all");
}
function isRequestReviewData(value) {
  return hasType(value, "request-review-data") && typeof value.requestId === "string";
}
function isCancel(value) {
  return hasType(value, "cancel");
}
function isSubmit(value) {
  return hasType(value, "submit") && typeof value.overallComment === "string" && Array.isArray(value.comments);
}

// lib/prompt-location.ts
function scopeLabel(comment) {
  if (comment.scope === "branch") return "branch diff";
  if (comment.scope === "all") return "all files";
  if (comment.commitKind === "working-tree") return "working tree changes";
  return comment.commitShort ? `commit ${comment.commitShort}` : "commit";
}
function pathLabel(file) {
  return file?.gitDiff?.displayPath ?? file?.path ?? "(unknown file)";
}
function formatCommentLocation(comment, file) {
  const prefix = `[${scopeLabel(comment)}] ${pathLabel(file)}`;
  if (comment.side === "file" || comment.startLine == null) return prefix;
  const range = comment.endLine && comment.endLine !== comment.startLine ? `${comment.startLine}-${comment.endLine}` : String(comment.startLine);
  const suffix = comment.scope === "all" ? "" : comment.side === "original" ? " (old)" : " (new)";
  return `${prefix}:${range}${suffix}`;
}

// lib/prompt.ts
function hasReviewFeedback(payload) {
  return payload.overallComment.trim().length > 0 || payload.comments.some((comment) => comment.body.trim().length > 0);
}
function composeReviewPrompt(files, payload) {
  const fileMap = new Map(files.map((file) => [file.id, file]));
  const lines = ["Please address the following feedback", ""];
  const overall = payload.overallComment.trim();
  if (overall) lines.push(overall, "");
  payload.comments.forEach((comment, index) => {
    lines.push(`${index + 1}. ${formatCommentLocation(comment, fileMap.get(comment.fileId))}`);
    lines.push(`   ${comment.body.trim()}`);
    lines.push("");
  });
  return lines.join("\n").trim();
}

// lib/glimpse-window.ts
import { spawn as spawn2, spawnSync } from "node:child_process";
import { EventEmitter as EventEmitter2 } from "node:events";
import { chmodSync, existsSync as existsSync3 } from "node:fs";
import { dirname as dirname3, join as join3 } from "node:path";
import { createInterface as createInterface2 } from "node:readline";
import { fileURLToPath as fileURLToPath3 } from "node:url";
var here = dirname3(fileURLToPath3(import.meta.url));
function tryBuildMacHost(sourcePath, targetPath) {
  if (process.platform !== "darwin" || !existsSync3(sourcePath)) return false;
  const result = spawnSync("swiftc", ["-O", sourcePath, "-o", targetPath], { stdio: "ignore" });
  if (result.status !== 0 || !existsSync3(targetPath)) return false;
  chmodSync(targetPath, 493);
  return true;
}
function resolveFallbackHost(host) {
  if (existsSync3(host.path) || host.extraArgs?.length) return host;
  const fileName = process.platform === "win32" ? "glimpse.exe" : "glimpse";
  const packageDir = join3(here, "..", "node_modules", "glimpseui", "src");
  const packageHost = join3(packageDir, fileName);
  const packageSource = join3(packageDir, "glimpse.swift");
  if ((existsSync3(packageHost) || tryBuildMacHost(packageSource, packageHost)) && process.platform !== "win32") chmodSync(packageHost, 493);
  return existsSync3(packageHost) ? { ...host, path: packageHost } : host;
}
var QuietWindow = class extends EventEmitter2 {
  #proc;
  #closed = false;
  constructor(proc, html) {
    super();
    this.#proc = proc;
    createInterface2({ input: proc.stdout, crlfDelay: Infinity }).on("line", (line) => this.#onLine(line, html));
    proc.on("error", (error) => this.emit("error", error));
    proc.on("exit", () => this.#markClosed());
  }
  #onLine(line, html) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return void this.emit("error", new Error(`Malformed glimpse line: ${line}`));
    }
    if (message.type === "ready") return void this.#write({ type: "html", html: Buffer.from(html).toString("base64") });
    if (message.type === "message") this.emit("message", message.data);
    if (message.type === "closed") this.#markClosed();
  }
  #markClosed() {
    if (!this.#closed) {
      this.#closed = true;
      this.emit("closed");
    }
  }
  #write(payload) {
    if (!this.#closed) this.#proc.stdin.write(`${JSON.stringify(payload)}
`);
  }
  send(js) {
    this.#write({ type: "eval", js });
  }
  close() {
    this.#write({ type: "close" });
  }
};
async function getNativeHost() {
  return (await Promise.resolve().then(() => (init_glimpse(), glimpse_exports))).getNativeHostInfo();
}
async function openQuietGlimpse(html, options = {}) {
  const host = resolveFallbackHost(await getNativeHost());
  if (!existsSync3(host.path) && !host.extraArgs?.length) throw new Error(`Glimpse host not found at '${host.path}'.${host.buildHint ? ` ${host.buildHint}` : ""}`);
  const args = [options.width && `--width=${options.width}`, options.height && `--height=${options.height}`, options.title && "--title", options.title].filter((value) => typeof value === "string");
  return new QuietWindow(spawn2(host.path, [...host.extraArgs ?? [], ...args], { stdio: ["pipe", "pipe", "pipe"], windowsHide: process.platform === "win32", env: { ...process.env, OS_ACTIVITY_MODE: process.env.OS_ACTIVITY_MODE ?? "disable" } }), html);
}

// lib/window-send.ts
function sendWindowMessage(window, message) {
  const payload = JSON.stringify(message).replace(/</gu, "\\u003c").replace(/>/gu, "\\u003e").replace(/&/gu, "\\u0026");
  window.send(`window.__reviewReceive(${payload});`);
}

// src/ui.ts
import { readFileSync as readFileSync2 } from "node:fs";
import { dirname as dirname4, join as join4 } from "node:path";
import { fileURLToPath as fileURLToPath4 } from "node:url";
var here2 = dirname4(fileURLToPath4(import.meta.url));
var webDir = join4(here2, "..", "web");
function escapeInline(value) {
  return value.replace(/</gu, "\\u003c").replace(/>/gu, "\\u003e").replace(/&/gu, "\\u0026");
}
function buildReviewHtml(data) {
  const html = readFileSync2(join4(webDir, "index.html"), "utf8");
  const css = readFileSync2(join4(webDir, "style.css"), "utf8");
  const js = readFileSync2(join4(webDir, "app.js"), "utf8");
  return html.replace("__INLINE_STYLE__", css).replace('"__INLINE_DATA__"', escapeInline(JSON.stringify(data))).replace("__INLINE_JS__", js);
}

// lib/diff-review-core.ts
function appendPrompt(ctx, prompt2) {
  ctx.ui.pasteToEditor(`${ctx.ui.getEditorText().trim().length > 0 ? "\n\n" : ""}${prompt2}`);
}
function registerDiffReview(_pi) {
  let activeWindow = null;
  const suppressed = /* @__PURE__ */ new WeakSet();
  const closeWindow = (options = {}) => {
    if (!activeWindow) return;
    const window = activeWindow;
    activeWindow = null;
    if (options.suppressResults) suppressed.add(window);
    try {
      window.close();
    } catch {
    }
  };
  const reviewRepository = async (ctx) => {
    if (activeWindow) return void ctx.ui.notify("A review window is already open.", "warning");
    try {
      let reviewData = await fe(_pi, ctx.cwd);
      const { repoRoot } = reviewData;
      if (reviewData.files.length === 0 && reviewData.commits.length === 0) return void ctx.ui.notify("No reviewable files found.", "info");
      const window = await openQuietGlimpse(buildReviewHtml(reviewData), { width: 1680, height: 1020, title: "pi review" });
      activeWindow = window;
      const fileMap = new Map(reviewData.files.map((file) => [file.id, file]));
      const commitCache = /* @__PURE__ */ new Map();
      const contentCache = /* @__PURE__ */ new Map();
      const clearRefreshableCaches = () => {
        contentCache.clear();
        for (const sha of commitCache.keys()) if (y(sha)) commitCache.delete(sha);
      };
      const send = (message) => {
        if (activeWindow === window) sendWindowMessage(window, message);
      };
      const loadCommitFiles = (sha) => {
        const cached2 = commitCache.get(sha);
        if (cached2) return cached2;
        const pending = he(_pi, repoRoot, sha);
        commitCache.set(sha, pending);
        pending.then((files) => files.forEach((file) => fileMap.set(file.id, file))).catch(() => {
        });
        return pending;
      };
      const loadContents = (file, scope, commitSha) => {
        const key = `${scope}:${commitSha ?? ""}:${file.id}`;
        const cached2 = contentCache.get(key);
        if (cached2) return cached2;
        const pending = we(_pi, repoRoot, file, scope, commitSha, reviewData.branchMergeBaseSha);
        contentCache.set(key, pending);
        return pending;
      };
      const terminalMessagePromise = new Promise((resolve2, reject) => {
        let settled = false;
        let closeTimer = null;
        const cleanup = () => {
          if (closeTimer) clearTimeout(closeTimer);
          window.removeListener("message", onMessage);
          window.removeListener("closed", onClosed);
          window.removeListener("error", onError);
          if (activeWindow === window) activeWindow = null;
        };
        const settle = (value) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve2(value);
        };
        const onMessage = (message) => {
          if (isRequestFile(message)) return void loadContents(fileMap.get(message.fileId) ?? (() => {
            throw new Error("Unknown file requested.");
          })(), message.scope, message.commitSha ?? null).then((contents) => send({ type: "file-data", requestId: message.requestId, fileId: message.fileId, scope: message.scope, commitSha: message.commitSha ?? null, ...contents })).catch((error) => send({ type: "file-error", requestId: message.requestId, fileId: message.fileId, scope: message.scope, commitSha: message.commitSha ?? null, message: error instanceof Error ? error.message : String(error) }));
          if (isRequestCommit(message)) return void loadCommitFiles(message.sha).then((files) => send({ type: "commit-data", requestId: message.requestId, sha: message.sha, files })).catch((error) => send({ type: "commit-error", requestId: message.requestId, sha: message.sha, message: error instanceof Error ? error.message : String(error) }));
          if (isRequestReviewData(message)) return void (clearRefreshableCaches(), fe(_pi, repoRoot).then((data) => {
            reviewData = data;
            data.files.forEach((file) => fileMap.set(file.id, file));
            send({ type: "review-data", requestId: message.requestId, files: data.files, commits: data.commits, branchBaseRef: data.branchBaseRef, branchMergeBaseSha: data.branchMergeBaseSha, repositoryHasHead: data.repositoryHasHead });
          }));
          if (isSubmit(message) || isCancel(message)) settle(message);
        };
        const onClosed = () => {
          if (settled || closeTimer) return;
          closeTimer = setTimeout(() => settle(null), 250);
        };
        const onError = (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        };
        window.on("message", onMessage);
        window.on("closed", onClosed);
        window.on("error", onError);
      });
      void (async () => {
        try {
          const message = await terminalMessagePromise;
          if (suppressed.has(window) || message == null) return;
          if (isCancel(message)) return void ctx.ui.notify("Review cancelled.", "info");
          if (!isSubmit(message) || !hasReviewFeedback(message)) return;
          appendPrompt(ctx, composeReviewPrompt([...fileMap.values()], message));
          ctx.ui.notify("Appended review feedback to the editor.", "info");
        } catch (error) {
          if (!suppressed.has(window)) ctx.ui.notify(`Review failed: ${error instanceof Error ? error.message : String(error)}`, "error");
        }
      })();
      ctx.ui.notify("Opened native review window.", "info");
    } catch (error) {
      closeWindow({ suppressResults: true });
      ctx.ui.notify(`Review failed: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
  };
  _pi.registerCommand("diff-review", { description: "Open a native review window with branch, per-commit, and all-files scopes", handler: async (_args, ctx) => {
    await reviewRepository(ctx);
  } });
  _pi.on("session_shutdown", async () => {
    closeWindow({ suppressResults: true });
  });
}
export {
  registerDiffReview as default
};
