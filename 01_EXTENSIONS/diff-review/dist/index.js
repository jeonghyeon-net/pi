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
import { dirname, join as join2 } from "node:path";
import { fileURLToPath } from "node:url";
function nativeBinaryExists() {
  return existsSync(join2(__dirname, "glimpse"));
}
function env(name) {
  return (process.env[name] || "").toLowerCase();
}
function hyprlandSocketExists() {
  const signature = process.env.HYPRLAND_INSTANCE_SIGNATURE;
  if (!signature) return false;
  const candidates = [];
  if (process.env.XDG_RUNTIME_DIR) {
    candidates.push(join2(process.env.XDG_RUNTIME_DIR, "hypr", signature, ".socket.sock"));
  }
  if (process.env.UID) {
    candidates.push(join2("/run/user", process.env.UID, "hypr", signature, ".socket.sock"));
  }
  candidates.push(join2("/tmp", "hypr", signature, ".socket.sock"));
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
import { dirname as dirname2, isAbsolute, join as join3, normalize, resolve } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
function resolveChromiumBackend() {
  return {
    path: process.execPath,
    extraArgs: [join3(__dirname2, "chromium-backend.mjs")],
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
        path: join3(__dirname2, "glimpse"),
        platform: "darwin",
        buildHint: "Run 'npm run build:macos' or 'swiftc -O src/glimpse.swift -o src/glimpse'"
      };
    case "linux": {
      const backend = process.env.GLIMPSE_BACKEND;
      if (backend === "chromium") return resolveChromiumBackend();
      const nativePath = join3(__dirname2, "glimpse");
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
        path: normalize(join3(__dirname2, "..", "native", "windows", "bin", "glimpse.exe")),
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
    const skippedBuildPath = join3(__dirname2, "..", ".glimpse-build-skipped");
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

// lib/git-read.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
async function runGitAllowFailure(pi, cwd, args) {
  const result = await pi.exec("git", args, { cwd });
  return result.code === 0 ? result.stdout : "";
}
async function runBashAllowFailure(pi, cwd, script) {
  const result = await pi.exec("bash", ["-lc", script], { cwd });
  return result.code === 0 ? result.stdout : "";
}
async function readWorkingTree(repoRoot, path) {
  if (!path) return "";
  return readFile(join(repoRoot, path), "utf8").catch(() => "");
}
async function readRevision(pi, repoRoot, revision, path) {
  return revision && path ? runGitAllowFailure(pi, repoRoot, ["show", `${revision}:${path}`]) : "";
}

// lib/git-base.ts
async function currentBranch(pi, cwd) {
  return (await runGitAllowFailure(pi, cwd, ["branch", "--show-current"])).trim() || "HEAD";
}
async function getRepoRoot(pi, cwd) {
  const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd });
  if (result.code !== 0) throw new Error("Not inside a git repository.");
  return result.stdout.trim();
}
async function hasHead(pi, cwd) {
  return (await pi.exec("git", ["rev-parse", "--verify", "HEAD"], { cwd })).code === 0;
}
async function getCommitParent(pi, cwd, sha) {
  return (await runGitAllowFailure(pi, cwd, ["rev-parse", `${sha}^`])).trim() || null;
}
async function findReviewBase(pi, cwd) {
  const branch = await currentBranch(pi, cwd);
  const upstream = (await runGitAllowFailure(pi, cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])).trim();
  const originHead = (await runGitAllowFailure(pi, cwd, ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"])).trim();
  for (const candidate of new Set([upstream, originHead, "origin/main", "origin/master", "origin/develop", "main", "master", "develop"].filter(Boolean))) {
    if (candidate === branch || candidate.endsWith(`/${branch}`)) continue;
    const mergeBase = (await runGitAllowFailure(pi, cwd, ["merge-base", "HEAD", candidate])).trim();
    if (mergeBase) return { baseRef: candidate, mergeBase };
  }
  return null;
}
async function listCommits(pi, cwd, range) {
  return runGitAllowFailure(pi, cwd, ["log", "-100", "--format=%H%x1f%h%x1f%s%x1f%an%x1f%aI", range]);
}

// lib/git-kinds.ts
import { extname } from "node:path";
var imageTypes = new Map(Object.entries({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp", ".ico": "image/x-icon" }));
var binaryExts = /* @__PURE__ */ new Set([".pdf", ".zip", ".gz", ".tar", ".7z", ".bin", ".exe", ".dll", ".so"]);
function detectFileKind(path) {
  const ext = extname(path).toLowerCase();
  const image = imageTypes.get(ext);
  if (image) return { kind: "image", mimeType: image };
  if (binaryExts.has(ext)) return { kind: "binary", mimeType: null };
  return { kind: "text", mimeType: null };
}

// lib/git-filter.ts
function isReviewablePath(path) {
  const lower = path.toLowerCase();
  return !lower.endsWith(".min.js") && !lower.endsWith(".min.css");
}

// lib/git-parse.ts
function toStatus(code) {
  if (code === "M") return "modified";
  if (code === "A") return "added";
  if (code === "D") return "deleted";
  if (code === "R") return "renamed";
  return null;
}
function parseChangedPaths(output) {
  return output.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).flatMap((line) => {
    const [rawCode, first, second] = line.split("	");
    const status = toStatus((rawCode ?? "")[0] ?? "");
    const oldPath = status === "added" ? null : first ?? null;
    const newPath = status === "deleted" ? null : status === "renamed" ? second ?? null : first ?? null;
    const path = newPath ?? oldPath ?? "";
    if (!status || !path || !isReviewablePath(path)) return [];
    const displayPath = status === "renamed" ? `${oldPath ?? ""} -> ${newPath ?? ""}` : path;
    return [{ status, oldPath, newPath, displayPath }];
  }).sort((a, b) => a.displayPath.localeCompare(b.displayPath));
}
function toComparison(change) {
  return { ...change, hasOriginal: change.oldPath != null, hasModified: change.newPath != null };
}

// lib/git-scripts.ts
function shellQuote(value) {
  return `'${value.replace(/'/gu, `'\\''`)}'`;
}
function snapshotNameStatusScript(base) {
  return [
    "set -euo pipefail",
    'tmp=$(mktemp "/tmp/pi-diff-review-index.XXXXXX")',
    `trap 'rm -f "$tmp"' EXIT`,
    'export GIT_INDEX_FILE="$tmp"',
    ...base ? [`git read-tree ${shellQuote(base)}`] : ['rm -f "$tmp"'],
    "git add -A -- .",
    base ? `git diff --cached --find-renames -M --name-status ${shellQuote(base)} --` : "git diff --cached --find-renames -M --name-status --root --"
  ].join("\n");
}

// lib/git-working-tree.ts
var WORKING_TREE_SHA = "__pi_working_tree__";
function isWorkingTreeCommitSha(sha) {
  return sha === WORKING_TREE_SHA;
}
function createWorkingTreeCommit() {
  return { sha: WORKING_TREE_SHA, shortSha: "WT", subject: "Uncommitted changes", authorName: "", authorDate: "", kind: "working-tree" };
}

// lib/git-commit-files.ts
function toCommitFile(sha, change) {
  const path = change.newPath ?? change.oldPath ?? change.displayPath;
  return { id: `commit::${sha}::${change.displayPath}`, path, worktreeStatus: null, hasWorkingTreeFile: change.newPath != null, inGitDiff: true, gitDiff: toComparison(change), ...detectFileKind(path) };
}
async function getCommitFiles(pi, cwd, sha) {
  const repoRoot = await getRepoRoot(pi, cwd);
  const output = isWorkingTreeCommitSha(sha) ? await runBashAllowFailure(pi, repoRoot, snapshotNameStatusScript("HEAD")) : await runBashAllowFailure(pi, repoRoot, `git show --format= --find-renames -M --name-status ${JSON.stringify(sha)} --`);
  return parseChangedPaths(output).map((change) => toCommitFile(sha, change));
}

// lib/git-file-contents.ts
function blank(file, originalExists, modifiedExists, originalContent, modifiedContent) {
  return { kind: file.kind, mimeType: file.mimeType, originalExists, modifiedExists, originalContent, modifiedContent, originalPreviewUrl: null, modifiedPreviewUrl: null };
}
async function loadBranch(repoRoot, file, mergeBase, pi) {
  const diff = file.gitDiff;
  const originalContent = await readRevision(pi, repoRoot, mergeBase, diff?.oldPath ?? null);
  const modifiedContent = file.hasWorkingTreeFile ? await readWorkingTree(repoRoot, diff?.newPath ?? file.path) : "";
  return blank(file, diff?.hasOriginal ?? false, file.hasWorkingTreeFile, originalContent, modifiedContent);
}
async function loadCommit(repoRoot, file, sha, pi) {
  if (isWorkingTreeCommitSha(sha ?? "")) return blank(file, !!file.gitDiff?.oldPath, file.hasWorkingTreeFile, await readRevision(pi, repoRoot, "HEAD", file.gitDiff?.oldPath ?? null), await readWorkingTree(repoRoot, file.gitDiff?.newPath ?? file.path));
  const parent = sha ? await getCommitParent(pi, repoRoot, sha) : null;
  const originalContent = await readRevision(pi, repoRoot, parent, file.gitDiff?.oldPath ?? null);
  const modifiedContent = await readRevision(pi, repoRoot, sha, file.gitDiff?.newPath ?? null);
  return blank(file, file.gitDiff?.hasOriginal ?? false, file.gitDiff?.hasModified ?? false, originalContent, modifiedContent);
}
async function loadAll(repoRoot, file) {
  const modifiedContent = file.hasWorkingTreeFile ? await readWorkingTree(repoRoot, file.gitDiff?.newPath ?? file.path) : "";
  return blank(file, false, file.hasWorkingTreeFile, "", modifiedContent);
}
async function loadReviewFileContents(pi, repoRoot, file, scope, commitSha, branchMergeBaseSha) {
  if (scope === "branch") return loadBranch(repoRoot, file, branchMergeBaseSha, pi);
  if (scope === "commits") return loadCommit(repoRoot, file, commitSha, pi);
  return loadAll(repoRoot, file);
}

// lib/git-review-data.ts
function parseCommits(output) {
  return output.split(/\r?\n/u).filter(Boolean).map((line) => {
    const [sha, shortSha, subject, authorName, authorDate] = line.split("");
    return { sha, shortSha, subject, authorName, authorDate, kind: "commit" };
  });
}
function toBranchFile(change) {
  const path = change.newPath ?? change.oldPath ?? change.displayPath;
  return { id: `branch::${change.displayPath}`, path, worktreeStatus: change.status, hasWorkingTreeFile: change.newPath != null, inGitDiff: true, gitDiff: toComparison(change), ...detectFileKind(path) };
}
async function hasWorkingTreeChanges(pi, cwd) {
  const result = await pi.exec("git", ["status", "--porcelain=1", "--untracked-files=all"], { cwd });
  return result.stdout.trim().length > 0;
}
async function getReviewData(pi, cwd) {
  const repoRoot = await getRepoRoot(pi, cwd);
  const repositoryHasHead = await hasHead(pi, repoRoot);
  const base = repositoryHasHead ? await findReviewBase(pi, repoRoot) : null;
  const branchMergeBaseSha = base?.mergeBase ?? (repositoryHasHead ? "HEAD" : null);
  const files = parseChangedPaths(await runBashAllowFailure(pi, repoRoot, snapshotNameStatusScript(branchMergeBaseSha))).map(toBranchFile);
  const range = base ? `${base.mergeBase}..HEAD` : repositoryHasHead ? "HEAD" : "";
  const commits = range ? parseCommits(await listCommits(pi, repoRoot, range)) : [];
  return { repoRoot, files, branchBaseRef: base?.baseRef ?? null, branchMergeBaseSha, repositoryHasHead, commits: await hasWorkingTreeChanges(pi, repoRoot) ? [createWorkingTreeCommit(), ...commits] : commits };
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
import { spawn as spawn2 } from "node:child_process";
import { EventEmitter as EventEmitter2 } from "node:events";
import { existsSync as existsSync3 } from "node:fs";
import { createInterface as createInterface2 } from "node:readline";
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
  const host = await getNativeHost();
  if (!existsSync3(host.path)) throw new Error(`Glimpse host not found at '${host.path}'.${host.buildHint ? ` ${host.buildHint}` : ""}`);
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
import { dirname as dirname3, join as join4 } from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
var here = dirname3(fileURLToPath3(import.meta.url));
var webDir = join4(here, "..", "web");
var scripts = ["state.js", "helpers.js", "protocol.js", "render.js", "app.js"];
function escapeInline(value) {
  return value.replace(/</gu, "\\u003c").replace(/>/gu, "\\u003e").replace(/&/gu, "\\u0026");
}
function buildReviewHtml(data) {
  const html = readFileSync2(join4(webDir, "index.html"), "utf8");
  const css = readFileSync2(join4(webDir, "style.css"), "utf8");
  const js = scripts.map((file) => readFileSync2(join4(webDir, file), "utf8")).join("\n");
  return html.replace("__INLINE_STYLE__", css).replace('"__INLINE_DATA__"', escapeInline(JSON.stringify(data))).replace("__INLINE_JS__", js);
}

// lib/diff-review-core.ts
function appendPrompt(ctx, prompt2) {
  ctx.ui.pasteToEditor(`${ctx.ui.getEditorText().trim() ? "\n\n" : ""}${prompt2}`);
}
function replaceFiles(target, files) {
  for (const [id, file] of [...target.entries()]) if (!id.startsWith("commit::")) target.delete(id);
  for (const file of files) target.set(file.id, file);
}
function registerDiffReview(_pi) {
  let activeWindow = null;
  const ignored = /* @__PURE__ */ new WeakSet();
  const closeWindow = (suppress = false) => {
    if (activeWindow) {
      const window = activeWindow;
      activeWindow = null;
      if (suppress) ignored.add(window);
      window.close();
    }
  };
  const handleCommand = async (_args, ctx) => {
    if (activeWindow) return void ctx.ui.notify("A diff review window is already open.", "warning");
    try {
      let data = await getReviewData(_pi, ctx.cwd);
      if (data.files.length === 0 && data.commits.length === 0) return void ctx.ui.notify("No reviewable changes found.", "info");
      const fileMap = new Map(data.files.map((file) => [file.id, file]));
      const commitCache = /* @__PURE__ */ new Map();
      const contentCache = /* @__PURE__ */ new Map();
      const window = await openQuietGlimpse(buildReviewHtml(data), { width: 1680, height: 1020, title: "pi diff review" });
      activeWindow = window;
      window.on("message", async (message) => {
        if (isRequestCommit(message)) try {
          const files = await (commitCache.get(message.sha) ?? getCommitFiles(_pi, data.repoRoot, message.sha));
          commitCache.set(message.sha, Promise.resolve(files));
          files.forEach((file) => fileMap.set(file.id, file));
          sendWindowMessage(window, { type: "commit-data", requestId: message.requestId, sha: message.sha, files });
        } catch (error) {
          sendWindowMessage(window, { type: "commit-error", requestId: message.requestId, sha: message.sha, message: error instanceof Error ? error.message : String(error) });
        }
        if (isRequestFile(message)) try {
          const file = fileMap.get(message.fileId);
          if (!file) throw new Error("Unknown file requested.");
          const key = `${message.scope}:${message.commitSha ?? ""}:${message.fileId}`;
          const contents = await (contentCache.get(key) ?? loadReviewFileContents(_pi, data.repoRoot, file, message.scope, message.commitSha ?? null, data.branchMergeBaseSha));
          contentCache.set(key, Promise.resolve(contents));
          sendWindowMessage(window, { type: "file-data", requestId: message.requestId, fileId: message.fileId, scope: message.scope, commitSha: message.commitSha ?? null, ...contents });
        } catch (error) {
          sendWindowMessage(window, { type: "file-error", requestId: message.requestId, fileId: message.fileId, scope: message.scope, commitSha: message.commitSha ?? null, message: error instanceof Error ? error.message : String(error) });
        }
        if (isRequestReviewData(message)) {
          commitCache.clear();
          contentCache.clear();
          data = await getReviewData(_pi, data.repoRoot);
          replaceFiles(fileMap, data.files);
          sendWindowMessage(window, { type: "review-data", requestId: message.requestId, files: data.files, commits: data.commits, branchBaseRef: data.branchBaseRef, branchMergeBaseSha: data.branchMergeBaseSha, repositoryHasHead: data.repositoryHasHead });
        }
        if (isCancel(message)) ctx.ui.notify("Diff review cancelled.", "info");
        if (isSubmit(message) && hasReviewFeedback(message)) {
          appendPrompt(ctx, composeReviewPrompt([...fileMap.values()], message));
          ctx.ui.notify("Appended diff review feedback to the editor.", "info");
        }
      });
      window.on("closed", () => {
        if (activeWindow === window) activeWindow = null;
      });
      window.on("error", (error) => {
        if (!ignored.has(window)) ctx.ui.notify(`Diff review failed: ${error.message}`, "error");
      });
      ctx.ui.notify("Opened diff review window.", "info");
    } catch (error) {
      closeWindow(true);
      ctx.ui.notify(`Diff review failed: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
  };
  _pi.registerCommand("diff-review", { description: "Open a native diff review window for the current repository", handler: handleCommand });
  _pi.on("session_shutdown", (_event, _ctx) => closeWindow(true));
}
export {
  registerDiffReview as default
};
