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

// node_modules/@ryan_nookpi/pi-extension-diff-review/git.ts
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
var WORKING_TREE_COMMIT_SHA = "__pi_working_tree__";
var WORKING_TREE_COMMIT_SHORT_SHA = "WT";
var WORKING_TREE_COMMIT_SUBJECT = "Uncommitted changes";
function isWorkingTreeCommitSha(sha) {
  return sha === WORKING_TREE_COMMIT_SHA;
}
function createWorkingTreeCommitInfo() {
  return {
    sha: WORKING_TREE_COMMIT_SHA,
    shortSha: WORKING_TREE_COMMIT_SHORT_SHA,
    subject: WORKING_TREE_COMMIT_SUBJECT,
    authorName: "",
    authorDate: "",
    kind: "working-tree"
  };
}
async function runGitAllowFailure(pi, repoRoot, args) {
  const result = await pi.exec("git", args, { cwd: repoRoot });
  if (result.code !== 0) {
    return "";
  }
  return result.stdout;
}
async function runBashAllowFailure(pi, repoRoot, script) {
  const result = await pi.exec("bash", ["-lc", script], { cwd: repoRoot });
  if (result.code !== 0) {
    return "";
  }
  return result.stdout;
}
async function getRepoRoot(pi, cwd) {
  const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd });
  if (result.code !== 0) {
    throw new Error("Not inside a git repository.");
  }
  return result.stdout.trim();
}
async function hasHead(pi, repoRoot) {
  const result = await pi.exec("git", ["rev-parse", "--verify", "HEAD"], { cwd: repoRoot });
  return result.code === 0;
}
async function currentBranch(pi, repoRoot) {
  const result = await pi.exec("git", ["branch", "--show-current"], { cwd: repoRoot });
  return result.code === 0 ? result.stdout.trim() || "HEAD" : "HEAD";
}
async function getUpstreamRef(pi, repoRoot) {
  const output = await runGitAllowFailure(pi, repoRoot, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{upstream}"
  ]);
  const value = output.trim();
  return value.length > 0 ? value : null;
}
async function getOriginHeadRef(pi, repoRoot) {
  const output = await runGitAllowFailure(pi, repoRoot, ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"]);
  const value = output.trim();
  return value.length > 0 ? value : null;
}
function isSameBranchRef(ref, branch) {
  if (!branch || branch === "HEAD") return false;
  return ref === branch || ref.endsWith(`/${branch}`);
}
async function findReviewBase(pi, repoRoot) {
  const branch = await currentBranch(pi, repoRoot);
  const candidates = [];
  const upstreamRef = await getUpstreamRef(pi, repoRoot);
  if (upstreamRef && !isSameBranchRef(upstreamRef, branch)) {
    candidates.push(upstreamRef);
  }
  const originHeadRef = await getOriginHeadRef(pi, repoRoot);
  if (originHeadRef) {
    candidates.push(originHeadRef);
  }
  candidates.push("origin/main", "origin/master", "origin/develop", "main", "master", "develop");
  const seen = /* @__PURE__ */ new Set();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    const mergeBase = (await runGitAllowFailure(pi, repoRoot, ["merge-base", "HEAD", candidate])).trim();
    if (mergeBase.length > 0) {
      return { mergeBase, baseRef: candidate };
    }
  }
  return null;
}
function parseNameStatusLine(parts) {
  const code = (parts[0] ?? "")[0];
  if (code === "R") {
    const oldPath = parts[1] ?? null;
    const newPath = parts[2] ?? null;
    if (oldPath == null || newPath == null) return null;
    return { status: "renamed", oldPath, newPath };
  }
  const path = parts[1] ?? null;
  if (path == null) return null;
  if (code === "M") return { status: "modified", oldPath: path, newPath: path };
  if (code === "A") return { status: "added", oldPath: null, newPath: path };
  if (code === "D") return { status: "deleted", oldPath: path, newPath: null };
  return null;
}
function parseNameStatus(output) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  const changes = [];
  for (const line of lines) {
    const change = parseNameStatusLine(line.split("	"));
    if (change != null) changes.push(change);
  }
  return changes;
}
function parseStatusPorcelainZ(output) {
  const info = {
    hasChanges: false,
    hasReviewableChanges: false,
    hasUntracked: false,
    hasTrackedDeletions: false,
    hasRenames: false,
    untrackedPaths: []
  };
  const tokens = output.split("\0");
  for (let index = 0; index < tokens.length; ) {
    const token = tokens[index] ?? "";
    if (token.length === 0) {
      index += 1;
      continue;
    }
    const code = token.slice(0, 2);
    const path = token.slice(3);
    const isRenameOrCopy = code.includes("R") || code.includes("C");
    const isReviewablePath = code !== "!!" && path.length > 0 && isIncludedReviewPath(path);
    if (code !== "!!") {
      info.hasChanges = true;
    }
    if (isReviewablePath) {
      info.hasReviewableChanges = true;
    }
    if (code === "??") {
      if (isReviewablePath) {
        info.hasUntracked = true;
        info.untrackedPaths.push(path);
      }
    } else if (isReviewablePath) {
      if (code.includes("D")) info.hasTrackedDeletions = true;
      if (isRenameOrCopy) info.hasRenames = true;
    }
    index += isRenameOrCopy ? 2 : 1;
  }
  return info;
}
async function getWorkingTreeStatusInfo(pi, repoRoot) {
  const output = await runGitAllowFailure(pi, repoRoot, ["status", "--porcelain=1", "--untracked-files=all", "-z"]);
  return parseStatusPorcelainZ(output);
}
function toDisplayPath(change) {
  if (change.status === "renamed") {
    return `${change.oldPath ?? ""} -> ${change.newPath ?? ""}`;
  }
  return change.newPath ?? change.oldPath ?? "(unknown)";
}
function toComparison(change) {
  return {
    status: change.status,
    oldPath: change.oldPath,
    newPath: change.newPath,
    displayPath: toDisplayPath(change),
    hasOriginal: change.oldPath != null,
    hasModified: change.newPath != null
  };
}
function buildBranchFileId(path, hasWorkingTreeFile, gitDiff) {
  return ["branch", path, hasWorkingTreeFile ? "working" : "gone", gitDiff.displayPath].join("::");
}
function buildCommitFileId(sha, comparison) {
  return ["commit", sha, comparison.displayPath].join("::");
}
async function getRevisionContent(pi, repoRoot, revision, path) {
  const result = await pi.exec("git", ["show", `${revision}:${path}`], { cwd: repoRoot });
  if (result.code !== 0) {
    return "";
  }
  return result.stdout;
}
async function getWorkingTreeContent(repoRoot, path) {
  try {
    return await readFile(join(repoRoot, path), "utf8");
  } catch {
    return "";
  }
}
async function getWorkingTreeBytes(repoRoot, path) {
  try {
    return await readFile(join(repoRoot, path));
  } catch {
    return null;
  }
}
function shellQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
async function getRevisionBytes(pi, repoRoot, revision, path) {
  const spec = shellQuote(`${revision}:${path}`);
  const result = await pi.exec("bash", ["-lc", `git show ${spec} | base64 | tr -d '\\n'`], { cwd: repoRoot });
  if (result.code !== 0) return null;
  const encoded = (result.stdout ?? "").trim();
  try {
    return Buffer.from(encoded, "base64");
  } catch {
    return null;
  }
}
var imageMimeTypes = /* @__PURE__ */ new Map([
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"]
]);
var binaryExtensions = /* @__PURE__ */ new Set([
  ".7z",
  ".a",
  ".avi",
  ".avif",
  ".bin",
  ".bmp",
  ".class",
  ".dll",
  ".dylib",
  ".eot",
  ".exe",
  ".gif",
  ".gz",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".lockb",
  ".map",
  ".mov",
  ".mp3",
  ".mp4",
  ".o",
  ".otf",
  ".pdf",
  ".png",
  ".pyc",
  ".so",
  ".svgz",
  ".tar",
  ".ttf",
  ".wasm",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip"
]);
function classifyFilePath(path) {
  const extension = extname(path.toLowerCase());
  const mimeType = imageMimeTypes.get(extension) ?? null;
  if (mimeType != null) return { kind: "image", mimeType };
  if (binaryExtensions.has(extension)) return { kind: "binary", mimeType: null };
  return { kind: "text", mimeType: null };
}
function isIncludedReviewPath(path) {
  const lowerPath = path.toLowerCase();
  const fileName = lowerPath.split("/").pop() ?? lowerPath;
  if (fileName.length === 0) return false;
  if (fileName.endsWith(".min.js") || fileName.endsWith(".min.css")) return false;
  return true;
}
function bufferToDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}
function toReviewFile(change, options) {
  const comparison = toComparison(change);
  const path = change.newPath ?? change.oldPath ?? comparison.displayPath;
  const meta = classifyFilePath(path);
  return {
    id: options.id,
    path,
    worktreeStatus: options.worktreeStatus,
    hasWorkingTreeFile: options.hasWorkingTreeFile,
    inGitDiff: true,
    gitDiff: comparison,
    kind: meta.kind,
    mimeType: meta.mimeType
  };
}
async function loadBinarySideFromWorkingTree(repoRoot, path, mimeType) {
  if (path == null) return { exists: false, previewUrl: null };
  const bytes = await getWorkingTreeBytes(repoRoot, path);
  if (bytes == null) return { exists: false, previewUrl: null };
  return { exists: true, previewUrl: mimeType ? bufferToDataUrl(bytes, mimeType) : null };
}
async function loadBinarySideFromRevision(pi, repoRoot, revision, path, mimeType) {
  if (path == null) return { exists: false, previewUrl: null };
  const bytes = await getRevisionBytes(pi, repoRoot, revision, path);
  if (bytes == null) return { exists: false, previewUrl: null };
  return { exists: true, previewUrl: mimeType ? bufferToDataUrl(bytes, mimeType) : null };
}
function mergeChangedPaths(...groups) {
  const merged = /* @__PURE__ */ new Map();
  for (const group of groups) {
    for (const change of group) {
      const key = change.newPath ?? change.oldPath ?? "";
      if (key.length === 0) continue;
      merged.set(key, change);
    }
  }
  return [...merged.values()];
}
function toUntrackedChangedPaths(paths) {
  return paths.map((path) => ({ status: "added", oldPath: null, newPath: path }));
}
function shouldNormalizeBranchChanges(trackedChanges, workingTreeStatus) {
  if (workingTreeStatus.hasRenames) return true;
  if (!workingTreeStatus.hasUntracked) return false;
  return trackedChanges.some((change) => change.status === "deleted");
}
async function getTrackedBranchReviewChanges(pi, repoRoot, branchComparisonBase) {
  return parseNameStatus(
    await runGitAllowFailure(pi, repoRoot, [
      "diff",
      "--find-renames",
      "-M",
      "--name-status",
      branchComparisonBase,
      "--"
    ])
  );
}
async function getWorkingTreeSnapshotChanges(pi, repoRoot, baseRevision) {
  const scriptLines = [
    "set -euo pipefail",
    'tmp_index=$(mktemp "/tmp/pi-diff-review-index.XXXXXX")',
    `trap 'rm -f "$tmp_index"' EXIT`,
    'export GIT_INDEX_FILE="$tmp_index"'
  ];
  if (baseRevision != null) {
    scriptLines.push(`git read-tree ${shellQuote(baseRevision)}`);
  } else {
    scriptLines.push('rm -f "$tmp_index"');
  }
  scriptLines.push("git add -A -- .");
  scriptLines.push(
    baseRevision != null ? `git diff --cached --find-renames -M --name-status ${shellQuote(baseRevision)} --` : "git diff --cached --find-renames -M --name-status --root --"
  );
  const output = await runBashAllowFailure(pi, repoRoot, scriptLines.join("\n"));
  return parseNameStatus(output);
}
async function getBranchReviewChanges(pi, repoRoot, branchComparisonBase, workingTreeStatus) {
  if (!branchComparisonBase) return [];
  const trackedChanges = await getTrackedBranchReviewChanges(pi, repoRoot, branchComparisonBase);
  if (shouldNormalizeBranchChanges(trackedChanges, workingTreeStatus)) {
    return getWorkingTreeSnapshotChanges(pi, repoRoot, branchComparisonBase);
  }
  return mergeChangedPaths(trackedChanges, toUntrackedChangedPaths(workingTreeStatus.untrackedPaths));
}
async function getWorkingTreeReviewChanges(pi, repoRoot, repositoryHasHead) {
  return getWorkingTreeSnapshotChanges(pi, repoRoot, repositoryHasHead ? "HEAD" : null);
}
function compareReviewFiles(a, b) {
  return a.path.localeCompare(b.path);
}
function toBranchReviewFile(change) {
  const comparison = toComparison(change);
  const path = change.newPath ?? change.oldPath ?? comparison.displayPath;
  return toReviewFile(change, {
    id: buildBranchFileId(path, change.newPath != null, comparison),
    worktreeStatus: change.status,
    hasWorkingTreeFile: change.newPath != null
  });
}
async function getReviewWindowData(pi, cwd) {
  const repoRoot = await getRepoRoot(pi, cwd);
  const repositoryHasHead = await hasHead(pi, repoRoot);
  const reviewBase = repositoryHasHead ? await findReviewBase(pi, repoRoot) : null;
  const branchComparisonBase = reviewBase?.mergeBase ?? (repositoryHasHead ? "HEAD" : null);
  const workingTreeStatus = await getWorkingTreeStatusInfo(pi, repoRoot);
  const branchChanges = repositoryHasHead ? await getBranchReviewChanges(pi, repoRoot, branchComparisonBase, workingTreeStatus) : await getWorkingTreeReviewChanges(pi, repoRoot, false);
  const files = branchChanges.filter((change) => isIncludedReviewPath(change.newPath ?? change.oldPath ?? "")).map(toBranchReviewFile).sort(compareReviewFiles);
  const commits = reviewBase ? await listRangeCommits(pi, repoRoot, `${reviewBase.mergeBase}..HEAD`, 100) : [];
  const workingTreeCommit = workingTreeStatus.hasReviewableChanges ? [createWorkingTreeCommitInfo()] : [];
  const fallbackCommits = repositoryHasHead && files.length === 0 && commits.length === 0 && !workingTreeStatus.hasReviewableChanges ? await listRangeCommits(pi, repoRoot, "HEAD", 20) : commits;
  return {
    repoRoot,
    files,
    commits: [...workingTreeCommit, ...fallbackCommits],
    branchBaseRef: reviewBase?.baseRef ?? null,
    branchMergeBaseSha: branchComparisonBase,
    repositoryHasHead
  };
}
async function listRangeCommits(pi, repoRoot, range, limit) {
  const sep = "";
  const format = ["%H", "%h", "%s", "%an", "%aI"].join(sep);
  const output = await runGitAllowFailure(pi, repoRoot, ["log", `-${limit}`, `--format=${format}`, range]);
  return output.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.length > 0).map((line) => {
    const [sha, shortSha, subject, authorName, authorDate] = line.split(sep);
    return {
      sha: sha ?? "",
      shortSha: shortSha ?? (sha ?? "").slice(0, 7),
      subject: subject ?? "",
      authorName: authorName ?? "",
      authorDate: authorDate ?? "",
      kind: "commit"
    };
  }).filter((commit) => commit.sha.length > 0);
}
async function getCommitFiles(pi, repoRoot, sha) {
  if (isWorkingTreeCommitSha(sha)) {
    const repositoryHasHead = await hasHead(pi, repoRoot);
    const changes2 = (await getWorkingTreeReviewChanges(pi, repoRoot, repositoryHasHead)).filter(
      (change) => isIncludedReviewPath(change.newPath ?? change.oldPath ?? "")
    );
    return changes2.map((change) => {
      const comparison = toComparison(change);
      return toReviewFile(change, {
        id: buildCommitFileId(sha, comparison),
        worktreeStatus: change.status,
        hasWorkingTreeFile: change.newPath != null
      });
    }).sort(compareReviewFiles);
  }
  const output = await runGitAllowFailure(pi, repoRoot, [
    "diff-tree",
    "--root",
    "--find-renames",
    "-M",
    "--name-status",
    "--no-commit-id",
    "-r",
    sha
  ]);
  const changes = parseNameStatus(output).filter(
    (change) => isIncludedReviewPath(change.newPath ?? change.oldPath ?? "")
  );
  return changes.map((change) => {
    const comparison = toComparison(change);
    return toReviewFile(change, {
      id: buildCommitFileId(sha, comparison),
      worktreeStatus: null,
      hasWorkingTreeFile: false
    });
  }).sort(compareReviewFiles);
}
async function loadReviewFileContents(pi, repoRoot, file, scope, commitSha = null, branchMergeBaseSha = null) {
  const emptyBinaryContents = {
    originalContent: "",
    modifiedContent: "",
    kind: file.kind,
    mimeType: file.mimeType,
    originalExists: false,
    modifiedExists: false,
    originalPreviewUrl: null,
    modifiedPreviewUrl: null
  };
  if (file.kind !== "text") {
    if (scope === "all") {
      const path = file.gitDiff?.newPath ?? (file.hasWorkingTreeFile ? file.path : null);
      const modifiedSide2 = file.hasWorkingTreeFile ? await loadBinarySideFromWorkingTree(repoRoot, path, file.mimeType) : await loadBinarySideFromRevision(pi, repoRoot, "HEAD", path, file.mimeType);
      return {
        ...emptyBinaryContents,
        modifiedExists: modifiedSide2.exists,
        modifiedPreviewUrl: modifiedSide2.previewUrl
      };
    }
    const comparison2 = file.gitDiff;
    if (comparison2 == null) return emptyBinaryContents;
    if (scope === "commits") {
      if (!commitSha) return emptyBinaryContents;
      if (isWorkingTreeCommitSha(commitSha)) {
        const repositoryHasHead = await hasHead(pi, repoRoot);
        const originalSide3 = repositoryHasHead ? await loadBinarySideFromRevision(pi, repoRoot, "HEAD", comparison2.oldPath, file.mimeType) : { exists: false, previewUrl: null };
        const modifiedSide3 = file.hasWorkingTreeFile ? await loadBinarySideFromWorkingTree(repoRoot, comparison2.newPath, file.mimeType) : { exists: false, previewUrl: null };
        return {
          ...emptyBinaryContents,
          originalExists: originalSide3.exists,
          modifiedExists: modifiedSide3.exists,
          originalPreviewUrl: originalSide3.previewUrl,
          modifiedPreviewUrl: modifiedSide3.previewUrl
        };
      }
      const originalSide2 = await loadBinarySideFromRevision(
        pi,
        repoRoot,
        `${commitSha}^`,
        comparison2.oldPath,
        file.mimeType
      );
      const modifiedSide2 = await loadBinarySideFromRevision(pi, repoRoot, commitSha, comparison2.newPath, file.mimeType);
      return {
        ...emptyBinaryContents,
        originalExists: originalSide2.exists,
        modifiedExists: modifiedSide2.exists,
        originalPreviewUrl: originalSide2.previewUrl,
        modifiedPreviewUrl: modifiedSide2.previewUrl
      };
    }
    if (!branchMergeBaseSha) return emptyBinaryContents;
    const originalSide = await loadBinarySideFromRevision(
      pi,
      repoRoot,
      branchMergeBaseSha,
      comparison2.oldPath,
      file.mimeType
    );
    const modifiedSide = file.hasWorkingTreeFile ? await loadBinarySideFromWorkingTree(repoRoot, comparison2.newPath, file.mimeType) : await loadBinarySideFromRevision(pi, repoRoot, "HEAD", comparison2.newPath, file.mimeType);
    return {
      ...emptyBinaryContents,
      originalExists: originalSide.exists,
      modifiedExists: modifiedSide.exists,
      originalPreviewUrl: originalSide.previewUrl,
      modifiedPreviewUrl: modifiedSide.previewUrl
    };
  }
  if (scope === "all") {
    const path = file.gitDiff?.newPath ?? (file.hasWorkingTreeFile ? file.path : null);
    const content = path == null ? "" : file.hasWorkingTreeFile ? await getWorkingTreeContent(repoRoot, path) : await getRevisionContent(pi, repoRoot, "HEAD", path);
    return {
      originalContent: content,
      modifiedContent: content,
      kind: file.kind,
      mimeType: file.mimeType,
      originalExists: path != null,
      modifiedExists: path != null,
      originalPreviewUrl: null,
      modifiedPreviewUrl: null
    };
  }
  const comparison = file.gitDiff;
  if (comparison == null) {
    return {
      originalContent: "",
      modifiedContent: "",
      kind: file.kind,
      mimeType: file.mimeType,
      originalExists: false,
      modifiedExists: false,
      originalPreviewUrl: null,
      modifiedPreviewUrl: null
    };
  }
  if (scope === "commits") {
    if (!commitSha) {
      return {
        originalContent: "",
        modifiedContent: "",
        kind: file.kind,
        mimeType: file.mimeType,
        originalExists: false,
        modifiedExists: false,
        originalPreviewUrl: null,
        modifiedPreviewUrl: null
      };
    }
    if (isWorkingTreeCommitSha(commitSha)) {
      const repositoryHasHead = await hasHead(pi, repoRoot);
      const originalContent3 = repositoryHasHead && comparison.oldPath != null ? await getRevisionContent(pi, repoRoot, "HEAD", comparison.oldPath) : "";
      const modifiedContent3 = comparison.newPath == null ? "" : file.hasWorkingTreeFile ? await getWorkingTreeContent(repoRoot, comparison.newPath) : "";
      return {
        originalContent: originalContent3,
        modifiedContent: modifiedContent3,
        kind: file.kind,
        mimeType: file.mimeType,
        originalExists: repositoryHasHead && comparison.oldPath != null,
        modifiedExists: comparison.newPath != null,
        originalPreviewUrl: null,
        modifiedPreviewUrl: null
      };
    }
    const originalContent2 = comparison.oldPath == null ? "" : await getRevisionContent(pi, repoRoot, `${commitSha}^`, comparison.oldPath);
    const modifiedContent2 = comparison.newPath == null ? "" : await getRevisionContent(pi, repoRoot, commitSha, comparison.newPath);
    return {
      originalContent: originalContent2,
      modifiedContent: modifiedContent2,
      kind: file.kind,
      mimeType: file.mimeType,
      originalExists: comparison.oldPath != null,
      modifiedExists: comparison.newPath != null,
      originalPreviewUrl: null,
      modifiedPreviewUrl: null
    };
  }
  if (!branchMergeBaseSha) {
    return {
      originalContent: "",
      modifiedContent: "",
      kind: file.kind,
      mimeType: file.mimeType,
      originalExists: false,
      modifiedExists: false,
      originalPreviewUrl: null,
      modifiedPreviewUrl: null
    };
  }
  const originalContent = comparison.oldPath == null ? "" : await getRevisionContent(pi, repoRoot, branchMergeBaseSha, comparison.oldPath);
  const modifiedContent = comparison.newPath == null ? "" : file.hasWorkingTreeFile ? await getWorkingTreeContent(repoRoot, comparison.newPath) : await getRevisionContent(pi, repoRoot, "HEAD", comparison.newPath);
  return {
    originalContent,
    modifiedContent,
    kind: file.kind,
    mimeType: file.mimeType,
    originalExists: comparison.oldPath != null,
    modifiedExists: comparison.newPath != null,
    originalPreviewUrl: null,
    modifiedPreviewUrl: null
  };
}

// node_modules/@ryan_nookpi/pi-extension-diff-review/prompt.ts
function formatScopeLabel(comment) {
  switch (comment.scope) {
    case "branch":
      return "branch diff";
    case "commits":
      return comment.commitKind === "working-tree" ? "working tree changes" : comment.commitShort ? `commit ${comment.commitShort}` : "commit";
    default:
      return "all files";
  }
}
function getCommentFilePath(file) {
  if (file == null) return "(unknown file)";
  return file.gitDiff?.displayPath ?? file.path;
}
function formatLocation(comment, file) {
  const filePath = getCommentFilePath(file);
  const scopePrefix = `[${formatScopeLabel(comment)}] `;
  if (comment.side === "file" || comment.startLine == null) {
    return `${scopePrefix}${filePath}`;
  }
  const range = comment.endLine != null && comment.endLine !== comment.startLine ? `${comment.startLine}-${comment.endLine}` : `${comment.startLine}`;
  if (comment.scope === "all") {
    return `${scopePrefix}${filePath}:${range}`;
  }
  const suffix = comment.side === "original" ? " (old)" : " (new)";
  return `${scopePrefix}${filePath}:${range}${suffix}`;
}
function composeReviewPrompt(files, payload) {
  const fileMap = new Map(files.map((file) => [file.id, file]));
  const lines = [];
  lines.push("Please address the following feedback");
  lines.push("");
  const overallComment = payload.overallComment.trim();
  if (overallComment.length > 0) {
    lines.push(overallComment);
    lines.push("");
  }
  payload.comments.forEach((comment, index) => {
    const file = fileMap.get(comment.fileId);
    lines.push(`${index + 1}. ${formatLocation(comment, file)}`);
    lines.push(`   ${comment.body.trim()}`);
    lines.push("");
  });
  return lines.join("\n").trim();
}

// node_modules/@ryan_nookpi/pi-extension-diff-review/quiet-glimpse.ts
import { spawn as spawn2, spawnSync as spawnSync2 } from "node:child_process";
import { EventEmitter as EventEmitter2 } from "node:events";
import { chmodSync as chmodSync2, existsSync as existsSync3 } from "node:fs";
import { createInterface as createInterface2 } from "node:readline";
var QuietGlimpseWindowImpl = class extends EventEmitter2 {
  #proc;
  #closed = false;
  #pendingHTML;
  #stderr = "";
  constructor(proc, initialHTML) {
    super();
    this.#proc = proc;
    this.#pendingHTML = initialHTML;
    proc.stdin.on("error", () => {
    });
    proc.stderr.on("data", (chunk) => {
      this.#stderr += chunk.toString();
    });
    const rl = createInterface2({ input: proc.stdout, crlfDelay: Infinity });
    rl.on("line", (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        this.emit("error", new Error(`Malformed glimpse protocol line: ${line}`));
        return;
      }
      switch (message.type) {
        case "ready":
          if (this.#pendingHTML != null) {
            this.setHTML(this.#pendingHTML);
            this.#pendingHTML = null;
          }
          break;
        case "message":
          this.emit("message", message.data);
          break;
        case "closed":
          this.#markClosed();
          break;
        default:
          break;
      }
    });
    proc.on("error", (error) => this.emit("error", error));
    proc.on("exit", (code) => {
      const stderr = this.#stderr.trim();
      if (!this.#closed && code && stderr) {
        this.emit("error", new Error(stderr));
      }
      this.#markClosed();
    });
  }
  send(js) {
    this.#write({ type: "eval", js });
  }
  close() {
    this.#write({ type: "close" });
  }
  #markClosed() {
    if (this.#closed) return;
    this.#closed = true;
    this.emit("closed");
  }
  #write(obj) {
    if (this.#closed) return;
    this.#proc.stdin.write(`${JSON.stringify(obj)}
`);
  }
  setHTML(html) {
    this.#write({ type: "html", html: Buffer.from(html).toString("base64") });
  }
};
async function getNativeHostInfo2() {
  const glimpseModule = await Promise.resolve().then(() => (init_glimpse(), glimpse_exports));
  return glimpseModule.getNativeHostInfo();
}
function tryBuildMacHost2(sourcePath, targetPath) {
  if (process.platform !== "darwin" || !existsSync3(sourcePath)) return false;
  const result = spawnSync2("swiftc", ["-O", sourcePath, "-o", targetPath], { stdio: "ignore" });
  if (result.status !== 0 || !existsSync3(targetPath)) return false;
  chmodSync2(targetPath, 493);
  return true;
}
function resolveFallbackHost2(host) {
  if (existsSync3(host.path) || host.extraArgs?.length) return host;
  const here = dirname(fileURLToPath(import.meta.url));
  const fileName = process.platform === "win32" ? "glimpse.exe" : "glimpse";
  const packageDir = join2(here, "..", "node_modules", "glimpseui", "src");
  const packageHost = join2(packageDir, fileName);
  const packageSource = join2(packageDir, "glimpse.swift");
  if ((existsSync3(packageHost) || tryBuildMacHost2(packageSource, packageHost)) && process.platform !== "win32") chmodSync2(packageHost, 493);
  return existsSync3(packageHost) ? { ...host, path: packageHost } : host;
}
async function openQuietGlimpse(html, options = {}) {
  const host = resolveFallbackHost2(await getNativeHostInfo2());
  if (!existsSync3(host.path) && !host.extraArgs?.length) {
    const hint = host.buildHint ? ` ${host.buildHint}` : "";
    throw new Error(`Glimpse host not found at '${host.path}'.${hint}`);
  }
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
  if (options.x != null) args.push(`--x=${options.x}`);
  if (options.y != null) args.push(`--y=${options.y}`);
  if (options.cursorOffset?.x != null) args.push(`--cursor-offset-x=${options.cursorOffset.x}`);
  if (options.cursorOffset?.y != null) args.push(`--cursor-offset-y=${options.cursorOffset.y}`);
  if (options.cursorAnchor != null) args.push("--cursor-anchor", options.cursorAnchor);
  if (options.followMode != null) args.push("--follow-mode", options.followMode);
  if (options.followCursor) args.push("--follow-cursor");
  const proc = spawn2(host.path, [...host.extraArgs ?? [], ...args], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: process.platform === "win32",
    env: {
      ...process.env,
      OS_ACTIVITY_MODE: process.env.OS_ACTIVITY_MODE ?? "disable"
    }
  });
  return new QuietGlimpseWindowImpl(proc, html);
}

// node_modules/@ryan_nookpi/pi-extension-diff-review/ui.ts
import { readFileSync as readFileSync2 } from "node:fs";
import { dirname as dirname3, join as join4 } from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
var __dirname3 = dirname3(fileURLToPath3(import.meta.url));
var webDir = join4(__dirname3, "web");
function escapeForInlineScript(value) {
  return value.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
var templateHtml = "<!DOCTYPE html>\n<html lang=\"en\" class=\"h-full bg-[#0d1117]\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>pi review</title>\n<script src=\"https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4\"></script>\n<style>\n  :root {\n      --color-review-bg: #0d1117;\n      --color-review-inset: #010409;\n      --color-review-panel: #151b23;\n      --color-review-panel-hover: #1f242c;\n      --color-review-border: #3d444d;\n      --color-review-border-muted: #2f353d;\n      --color-review-text: #f0f6fc;\n      --color-review-muted: #9198a1;\n      --color-review-subtle: #6e7681;\n      --color-review-accent: #4493f8;\n      --color-review-accent-emphasis: #1f6feb;\n      --color-review-success: #3fb950;\n      --color-review-success-emphasis: #238636;\n      --color-review-danger: #f85149;\n      --color-review-attention: #d29922;\n    }\n\n    .bg-review-bg { background-color: var(--color-review-bg); }\n    .bg-review-panel { background-color: var(--color-review-panel); }\n    .border-review-border { border-color: var(--color-review-border); }\n    .text-review-text { color: var(--color-review-text); }\n    .text-review-muted { color: var(--color-review-muted); }\n    .placeholder\\:text-review-muted::placeholder { color: var(--color-review-muted); }\n    .focus\\:border-review-accent:focus { border-color: var(--color-review-accent); }\n    .focus\\:ring-review-accent:focus { --tw-ring-color: var(--color-review-accent); }\n</style>\n<style>\n  html, body {\n        width: 100%;\n        height: 100%;\n        overflow: hidden;\n      }\n\n      .scrollbar-thin::-webkit-scrollbar {\n        width: 10px;\n        height: 10px;\n      }\n\n      .scrollbar-thin::-webkit-scrollbar-thumb {\n        background: #3d444d;\n        border-radius: 999px;\n        border: 3px solid #151b23;\n      }\n\n      .scrollbar-thin::-webkit-scrollbar-track {\n        background: transparent;\n      }\n\n      .review-popover {\n        position: absolute;\n        width: min(420px, 92vw);\n        background: #151b23;\n        border: 1px solid #3d444d;\n        border-radius: 10px;\n        box-shadow: 0 8px 24px rgba(1, 4, 9, 0.6);\n        padding: 12px;\n        z-index: 100;\n        animation: reviewPopIn 120ms ease-out;\n      }\n\n      @keyframes reviewPopIn {\n        from { opacity: 0; transform: translateY(-4px); }\n        to   { opacity: 1; transform: none; }\n      }\n\n      .review-popover::before {\n        content: \"\";\n        position: absolute;\n        top: -6px;\n        width: 10px;\n        height: 10px;\n        background: #151b23;\n        border-top: 1px solid #3d444d;\n        border-left: 1px solid #3d444d;\n        transform: rotate(45deg);\n      }\n\n      .review-popover[data-arrow=\"right\"]::before { right: 18px; }\n      .review-popover[data-arrow=\"left\"]::before  { left: 18px; }\n\n      .review-popover textarea {\n        min-height: 120px;\n        max-height: 40vh;\n      }\n\n      /* Icon button — compact square toggle matching the GitHub Dark palette. */\n      .icon-button {\n        display: inline-flex;\n        align-items: center;\n        justify-content: center;\n        width: 28px;\n        height: 28px;\n        padding: 0;\n        border-radius: 6px;\n        border: 1px solid #3d444d;\n        background: #151b23;\n        color: #9198a1;\n        cursor: pointer;\n        transition: background-color 120ms, color 120ms, border-color 120ms;\n        flex-shrink: 0;\n      }\n\n      .icon-button:hover:not([disabled]) {\n        background: #1f242c;\n        color: #f0f6fc;\n      }\n\n      .icon-button[data-active=\"true\"] {\n        background: rgba(35, 134, 54, 0.15);\n        border-color: rgba(63, 185, 80, 0.45);\n        color: #3fb950;\n      }\n\n      .icon-button[data-active=\"true\"]:hover:not([disabled]) {\n        background: rgba(35, 134, 54, 0.25);\n        color: #3fb950;\n      }\n\n      .icon-button[disabled] {\n        opacity: 0.4;\n        cursor: default;\n      }\n\n      .icon-button svg {\n        width: 14px;\n        height: 14px;\n      }\n\n      /* Added-only files in inline diff mode: suppress the original gutter/line-number column\n         that Monaco still paints alongside the modified line numbers. */\n      #editor-container[data-added-only=\"true\"] .monaco-diff-editor .editor.original,\n      #editor-container[data-added-only=\"true\"] .monaco-diff-editor .original-in-monaco {\n        visibility: hidden;\n        width: 0;\n        min-width: 0;\n      }\n      #editor-container[data-added-only=\"true\"] .monaco-editor .line-numbers.original,\n      #editor-container[data-added-only=\"true\"] .monaco-editor .margin-view-overlays .line-numbers[data-lineNumberType=\"original\"] {\n        display: none;\n      }\n\n      /* === GitHub-style sidebar === */\n      .gh-tree-row {\n        display: flex;\n        align-items: center;\n        gap: 6px;\n        width: 100%;\n        padding: 3px 8px 3px 8px;\n        text-align: left;\n        font-size: 13px;\n        color: #c9d1d9;\n        border-radius: 6px;\n        cursor: pointer;\n        line-height: 1.4;\n      }\n      .gh-tree-row:hover { background: #1f242c; color: #f0f6fc; }\n      .gh-tree-row[data-selected=\"true\"] { background: rgba(56,139,253,0.15); color: #f0f6fc; }\n      .gh-tree-row .gh-row-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n      .gh-tree-row .gh-row-trail { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }\n      .gh-tree-row svg { flex-shrink: 0; }\n      .gh-dir-icon { color: #79c0ff; }\n      .gh-file-icon { color: #9198a1; }\n\n      /* GitHub-style status square (A / M / D / R). */\n      .gh-status {\n        display: inline-flex;\n        align-items: center;\n        justify-content: center;\n        width: 16px;\n        height: 16px;\n        border-radius: 4px;\n        font-size: 9px;\n        font-weight: 700;\n        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n        line-height: 1;\n        flex-shrink: 0;\n      }\n      .gh-status-added    { background: rgba(46,160,67,0.35);  color: #3fb950; }\n      .gh-status-modified { background: rgba(210,153,34,0.30); color: #d29922; }\n      .gh-status-deleted  { background: rgba(248,81,73,0.30);  color: #f85149; }\n      .gh-status-renamed  { background: rgba(56,139,253,0.30); color: #58a6ff; }\n\n      .gh-comment-count {\n        display: inline-flex;\n        align-items: center;\n        justify-content: center;\n        min-width: 18px;\n        height: 16px;\n        padding: 0 4px;\n        border-radius: 9999px;\n        background: #1f242c;\n        color: #f0f6fc;\n        font-size: 10px;\n        font-weight: 600;\n        border: 1px solid #3d444d;\n      }\n\n      /* === GitHub-style file header (main pane) === */\n      .gh-file-header {\n        display: flex;\n        align-items: center;\n        gap: 8px;\n        min-width: 0;\n      }\n      .gh-file-path {\n        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n        font-size: 13px;\n        font-weight: 600;\n        color: #f0f6fc;\n        overflow: hidden;\n        text-overflow: ellipsis;\n        white-space: nowrap;\n      }\n      .gh-file-path .gh-file-path-dir { color: #9198a1; font-weight: 400; }\n\n      .gh-diff-stats {\n        display: inline-flex;\n        align-items: center;\n        gap: 6px;\n        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n        font-size: 11px;\n        color: #9198a1;\n      }\n      .gh-diff-stats-plus  { color: #3fb950; }\n      .gh-diff-stats-minus { color: #f85149; }\n\n      /* === GitHub-style Viewed checkbox (replaces the Reviewed icon toggle) === */\n      .gh-viewed {\n        display: inline-flex;\n        align-items: center;\n        gap: 6px;\n        padding: 4px 10px;\n        border-radius: 6px;\n        border: 1px solid #3d444d;\n        background: #151b23;\n        color: #c9d1d9;\n        font-size: 12px;\n        font-weight: 500;\n        cursor: pointer;\n        user-select: none;\n        transition: background-color 120ms, color 120ms, border-color 120ms;\n      }\n      .gh-viewed:hover:not([disabled]) { background: #1f242c; color: #f0f6fc; }\n      .gh-viewed[data-active=\"true\"] {\n        background: rgba(35,134,54,0.15);\n        border-color: rgba(63,185,80,0.45);\n        color: #3fb950;\n      }\n      .gh-viewed .gh-viewed-box {\n        display: inline-flex;\n        align-items: center;\n        justify-content: center;\n        width: 14px;\n        height: 14px;\n        border-radius: 3px;\n        border: 1px solid #6e7681;\n        background: transparent;\n      }\n      .gh-viewed[data-active=\"true\"] .gh-viewed-box {\n        border-color: #3fb950;\n        background: #238636;\n      }\n      .gh-viewed .gh-viewed-box svg { width: 10px; height: 10px; opacity: 0; color: #fff; }\n      .gh-viewed[data-active=\"true\"] .gh-viewed-box svg { opacity: 1; }\n\n      /* === Primary CTA (submit review) === */\n      .gh-primary-btn {\n        display: inline-flex;\n        align-items: center;\n        gap: 4px;\n        padding: 6px 12px;\n        border-radius: 6px;\n        border: 1px solid rgba(240,246,252,0.1);\n        background: #238636;\n        color: #ffffff;\n        font-size: 12px;\n        font-weight: 600;\n        cursor: pointer;\n        transition: background-color 120ms;\n      }\n      .gh-primary-btn:hover:not([disabled]) { background: #2ea043; }\n      .gh-primary-btn[disabled] { opacity: 0.5; cursor: default; }\n\n      /* === Commit picker rows === */\n      .commit-row {\n        display: flex;\n        align-items: flex-start;\n        gap: 8px;\n        width: 100%;\n        padding: 6px 8px;\n        text-align: left;\n        border-radius: 6px;\n        cursor: pointer;\n        color: #c9d1d9;\n      }\n      .commit-row:hover { background: #1f242c; }\n      .commit-row[data-selected=\"true\"] {\n        background: rgba(56,139,253,0.15);\n        color: #f0f6fc;\n      }\n      .commit-row-sha {\n        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n        font-size: 10.5px;\n        color: #79c0ff;\n        padding-top: 2px;\n        flex-shrink: 0;\n      }\n      .commit-row-body { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }\n      .commit-row-subject {\n        font-size: 12.5px;\n        font-weight: 500;\n        overflow: hidden;\n        text-overflow: ellipsis;\n        white-space: nowrap;\n      }\n      .commit-row-meta {\n        font-size: 10.5px;\n        color: #9198a1;\n        overflow: hidden;\n        text-overflow: ellipsis;\n        white-space: nowrap;\n      }\n      .commit-row-status {\n        font-size: 10px;\n        color: #9198a1;\n        padding-top: 2px;\n        flex-shrink: 0;\n      }\n\n      /* === GitHub-style Monaco diff backgrounds === */\n      .monaco-editor .line-insert,\n      .monaco-editor .char-insert {\n        background: rgba(46,160,67,0.18);\n      }\n      .monaco-editor .line-delete,\n      .monaco-editor .char-delete {\n        background: rgba(248,81,73,0.18);\n      }\n\n      #editor-container {\n        height: 100%;\n        min-height: 0;\n        overflow: hidden;\n        position: relative; /* anchor for overlays */\n      }\n\n      #editor-container > div,\n      #editor-container .monaco-diff-editor,\n      #editor-container .monaco-editor {\n        height: 100%;\n      }\n\n      #editor-container[data-preview-active=\"true\"] .monaco-diff-editor,\n      #editor-container[data-preview-active=\"true\"] .monaco-editor {\n        opacity: 0;\n        pointer-events: none;\n      }\n\n      #binary-preview {\n        position: absolute;\n        inset: 0;\n        z-index: 4;\n        display: none;\n        overflow: auto;\n        background: #0d1117;\n        padding: 20px;\n      }\n\n      #binary-preview[data-active=\"true\"] {\n        display: block;\n      }\n\n      .binary-preview-grid {\n        display: grid;\n        gap: 16px;\n        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));\n      }\n\n      .binary-preview-card {\n        border: 1px solid #3d444d;\n        border-radius: 10px;\n        background: #151b23;\n        overflow: hidden;\n      }\n\n      .binary-preview-card-header {\n        display: flex;\n        align-items: center;\n        justify-content: space-between;\n        gap: 12px;\n        padding: 10px 12px;\n        border-bottom: 1px solid #3d444d;\n        font-size: 12px;\n        color: #9198a1;\n      }\n\n      .binary-preview-card-body {\n        padding: 12px;\n      }\n\n      .binary-preview-image {\n        display: block;\n        width: 100%;\n        height: auto;\n        border-radius: 8px;\n        background: #010409;\n      }\n\n      .binary-preview-empty {\n        min-height: 180px;\n        display: flex;\n        align-items: center;\n        justify-content: center;\n        border: 1px dashed #3d444d;\n        border-radius: 8px;\n        color: #9198a1;\n        background: #0d1117;\n        text-align: center;\n        padding: 16px;\n        font-size: 13px;\n      }\n\n      .binary-preview-note {\n        margin-top: 16px;\n        padding: 12px 14px;\n        border: 1px solid #3d444d;\n        border-radius: 10px;\n        background: #151b23;\n        color: #9198a1;\n        font-size: 13px;\n        line-height: 1.5;\n      }\n\n      .gh-kind-badge {\n        display: inline-flex;\n        align-items: center;\n        justify-content: center;\n        min-width: 32px;\n        padding: 1px 6px;\n        border-radius: 999px;\n        border: 1px solid #3d444d;\n        background: #0d1117;\n        color: #9198a1;\n        font-size: 10px;\n        font-weight: 600;\n        letter-spacing: 0.02em;\n      }\n\n      /* Opaque cover painted on top of the diff editor during remount. Monaco keeps\n         rendering/computing underneath at full speed — unlike opacity:0 on the\n         container, Monaco is NOT affected by this overlay and reliably settles\n         hideUnchangedRegions before we unveil. Removing the cover is a single\n         discrete paint, so no sub-frame shift is observable. */\n\n      #editor-cover {\n        position: absolute;\n        inset: 0;\n        background: #0d1117;\n        z-index: 5;\n        pointer-events: none;\n        opacity: 0;\n        transition: opacity 80ms linear;\n      }\n\n      #editor-cover[data-active=\"true\"] {\n        opacity: 1;\n        transition: none;\n      }\n\n\n      .monaco-editor .view-zones {\n        z-index: 10;\n      }\n\n      .view-zone-container {\n        padding: 8px 16px 10px 16px;\n        border-top: 1px solid #3d444d;\n        border-bottom: 1px solid #3d444d;\n        background: #151b23;\n        overflow: visible;\n      }\n\n      .monaco-editor .review-comment-line-original {\n        background: rgba(210, 153, 34, 0.15);\n      }\n\n      .monaco-editor .review-comment-line-modified {\n        background: rgba(68, 147, 248, 0.15);\n      }\n\n      .monaco-editor .review-comment-glyph-original,\n      .monaco-editor .review-comment-glyph-modified {\n        border-radius: 999px;\n        width: 8px;\n        height: 8px;\n        margin-left: 6px;\n        margin-top: 5px;\n        cursor: pointer;\n      }\n\n      .monaco-editor .review-comment-glyph-original {\n        background: #d29922;\n      }\n\n      .monaco-editor .review-comment-glyph-modified {\n        background: #4493f8;\n      }\n\n      .monaco-editor .review-glyph-plus {\n        background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' width='16' height='16'%3E%3Cpath fill='%23f0f6fc' d='M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z'%3E%3C/path%3E%3C/svg%3E\");\n        background-repeat: no-repeat;\n        background-position: center;\n        background-size: 12px;\n        background-color: #238636;\n        border-radius: 4px;\n        cursor: pointer;\n        margin-left: 2px;\n        margin-top: 2px;\n        width: 16px;\n        height: 16px;\n        box-shadow: 0 0 0 1px rgba(240, 246, 252, 0.08);\n      }\n</style>\n</head>\n<body class=\"h-full overflow-hidden bg-review-bg text-review-text antialiased\">\n<div id=\"root-layout\" class=\"flex h-full w-full flex-col\">\n  <div class=\"flex items-center justify-between gap-4 border-b border-review-border bg-[#010409] px-4 py-3\">\n    <div class=\"min-w-0 flex items-center gap-3\">\n      <button type=\"button\" id=\"toggle-sidebar-button\" class=\"icon-button\" title=\"Toggle sidebar\" aria-label=\"Toggle sidebar\">\n        <svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"2\" y=\"3\" width=\"12\" height=\"10\" rx=\"1.25\"/><line x1=\"6\" y1=\"3\" x2=\"6\" y2=\"13\"/></svg>\n      </button>\n      <div class=\"min-w-0\">\n        <div id=\"window-title\" class=\"text-[15px] font-semibold text-white\">Review</div>\n        <div id=\"repo-root\" class=\"truncate text-[11px] text-review-muted\"></div>\n      </div>\n    </div>\n    <div class=\"flex items-center gap-2\">\n      <div id=\"summary\" class=\"max-w-[24rem] truncate text-[11px] text-review-muted\"></div>\n      <button type=\"button\" id=\"overall-comment-button\" class=\"icon-button\" title=\"Overall review note\" aria-label=\"Overall review note\">\n        <svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M10.5 2.5l3 3-8 8H2.5V10.5z\"/><path d=\"M9 4l3 3\"/></svg>\n      </button>\n      <button type=\"button\" id=\"cancel-button\" class=\"cursor-pointer rounded-md border border-review-border bg-review-panel px-3 py-1.5 text-xs font-medium text-review-text hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30\">Cancel</button>\n      <button type=\"button\" id=\"submit-button\" class=\"gh-primary-btn\">\n        <svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 16 16\" width=\"12\" height=\"12\" fill=\"currentColor\"><path d=\"M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z\"/></svg>\n        Submit review\n      </button>\n    </div>\n  </div>\n\n  <div id=\"content-layout\" class=\"flex min-h-0 flex-1\">\n    <aside id=\"sidebar\" class=\"flex min-h-0 shrink-0 flex-col border-r border-review-border bg-[#0d1117]\" style=\"width: 280px; min-width: 280px; flex-basis: 280px; overflow: hidden;\">\n    <div class=\"border-b border-review-border px-4 py-3\">\n      <div class=\"mb-2 flex items-center justify-between gap-2\">\n        <div id=\"sidebar-title\" class=\"text-[11px] font-semibold uppercase tracking-wider text-review-muted\">Files</div>\n        <div class=\"text-[10px] text-review-muted\">Fuzzy filter</div>\n      </div>\n      <div class=\"mb-3 flex flex-wrap items-center gap-2\">\n        <button type=\"button\" id=\"scope-branch-button\" class=\"cursor-pointer rounded-md border border-review-border bg-review-panel px-2.5 py-1 text-[11px] font-medium text-review-text hover:bg-[#1f242c]\">Branch</button>\n        <button type=\"button\" id=\"scope-commits-button\" class=\"cursor-pointer rounded-md border border-review-border bg-review-panel px-2.5 py-1 text-[11px] font-medium text-review-text hover:bg-[#1f242c]\">Commits</button>\n        <button type=\"button\" id=\"scope-all-button\" class=\"cursor-pointer rounded-md border border-review-border bg-review-panel px-2.5 py-1 text-[11px] font-medium text-review-text hover:bg-[#1f242c]\">All</button>\n      </div>\n      <input id=\"sidebar-search-input\" type=\"text\" spellcheck=\"false\" autocomplete=\"off\" placeholder=\"Search files\" class=\"w-full rounded-md border border-review-border bg-review-panel px-3 py-2 text-sm text-review-text outline-none placeholder:text-review-muted focus:border-review-accent focus:ring-1 focus:ring-review-accent\">\n    </div>\n    <div id=\"commit-picker\" class=\"border-b border-review-border\" style=\"display:none;\">\n      <div class=\"px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-review-muted\">Commits</div>\n      <div id=\"commit-list\" class=\"scrollbar-thin max-h-[38vh] overflow-auto px-2 pb-2\"></div>\n    </div>\n    <div id=\"file-tree\" class=\"scrollbar-thin min-h-0 flex-1 overflow-auto px-2 pb-2\"></div>\n  </aside>\n\n    <main id=\"main-pane\" class=\"flex min-h-0 min-w-0 flex-1 flex-col bg-[#0d1117]\">\n    <div class=\"flex items-center justify-between gap-4 border-b border-review-border bg-[#0d1117] px-4 py-2\">\n      <div class=\"gh-file-header min-w-0 flex-1\">\n        <button type=\"button\" id=\"file-collapse-button\" class=\"icon-button\" title=\"Collapse file\" aria-label=\"Collapse file\" style=\"width:22px;height:22px;\">\n          <svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 16 16\" fill=\"currentColor\"><path d=\"M12.78 6.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 7.28a.749.749 0 1 1 1.06-1.06L8 9.939l3.72-3.719a.749.749 0 0 1 1.06 0Z\"/></svg>\n        </button>\n        <span id=\"file-status-badge\" class=\"gh-status\" style=\"display:none;\"></span>\n        <div class=\"min-w-0 flex-1\">\n          <div id=\"current-file-label\" class=\"gh-file-path\"></div>\n          <div id=\"mode-hint\" class=\"mt-0.5 text-[11px] text-review-muted\"></div>\n        </div>\n        <div id=\"file-diff-stats\" class=\"gh-diff-stats\" style=\"display:none;\"></div>\n      </div>\n      <div class=\"flex items-center gap-1.5\">\n        <button type=\"button\" id=\"refresh-working-tree-button\" class=\"cursor-pointer rounded-md border border-review-border bg-review-panel px-2.5 py-1 text-[11px] font-medium text-review-text hover:bg-[#1f242c]\" title=\"Refresh live working tree diff\" aria-label=\"Refresh live working tree diff\" style=\"display:none;\">Refresh live diff</button>\n        <button type=\"button\" id=\"toggle-wrap-button\" class=\"icon-button\" title=\"Wrap long lines\" aria-label=\"Wrap lines\">\n          <svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M2 4h12\"/><path d=\"M2 12h3\"/><path d=\"M2 8h9.5a2.5 2.5 0 010 5H8.5\"/><path d=\"M10.5 10.75L8.5 13l2 2.25\"/></svg>\n        </button>\n        <button type=\"button\" id=\"toggle-unchanged-button\" class=\"icon-button\" title=\"Show changed areas only\" aria-label=\"Show changed areas only\">\n          <svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M2 4h12\"/><path d=\"M2 12h12\"/><path d=\"M5 7l3-3 3 3\"/><path d=\"M5 9l3 3 3-3\"/></svg>\n        </button>\n        <button type=\"button\" id=\"file-comment-button\" class=\"icon-button\" title=\"Add file-level comment\" aria-label=\"Add file comment\">\n          <svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M2.75 2.5h10.5a.75.75 0 01.75.75v7.5a.75.75 0 01-.75.75H7l-3 3v-3H2.75a.75.75 0 01-.75-.75v-7.5a.75.75 0 01.75-.75z\"/><path d=\"M8 6v3.5M6.25 7.75h3.5\"/></svg>\n        </button>\n        <button type=\"button\" id=\"toggle-reviewed-button\" class=\"gh-viewed\" title=\"Mark this file as viewed\" aria-label=\"Mark as viewed\">\n          <span class=\"gh-viewed-box\"><svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 8.5l2.5 2.5L12 5.5\"/></svg></span>\n          <span>Viewed</span>\n        </button>\n      </div>\n    </div>\n    <div id=\"file-comments-container\" class=\"hidden border-b border-review-border bg-[#0d1117] px-4 py-0\"></div>\n    <div id=\"editor-container\" class=\"min-h-0 min-w-0 flex-1\">\n      <div id=\"binary-preview\" data-active=\"false\"></div>\n      <div id=\"editor-cover\" aria-hidden=\"true\"></div>\n    </div>\n    </main>\n  </div>\n</div>\n\n<script id=\"diff-review-data\" type=\"application/json\">\"__INLINE_DATA__\"</script>\n<script>\n/**\n * Keyboard shortcut bridge for WKWebView (glimpseui).\n * glimpseui creates a native window without a macOS Edit menu, so Cmd+C/V/X/A/W\n * key equivalents aren't routed to the WKWebView's first responder chain. We install\n * a capture-phase keydown listener that runs BEFORE any editor handler so we can\n * fill those gaps ourselves.\n *\n * Paste is the tricky case: because there is no \"Paste\" menu item, WKWebView never\n * fires a native `paste` event on the focused element, so neither plain inputs nor\n * Monaco's internal textarea ever see clipboard data. We read the clipboard with\n * navigator.clipboard.readText() and either insert the text directly (plain inputs)\n * or dispatch a synthetic ClipboardEvent carrying pre-filled DataTransfer data\n * (Monaco — it reads clipboardData from the event, not the system clipboard).\n */\n(() => {\n  function insertAtCursor(el, text) {\n    if (el.tagName === \"INPUT\" || el.tagName === \"TEXTAREA\") {\n      const start = el.selectionStart ?? el.value.length;\n      const end = el.selectionEnd ?? el.value.length;\n      el.value = el.value.slice(0, start) + text + el.value.slice(end);\n      el.selectionStart = el.selectionEnd = start + text.length;\n      el.dispatchEvent(new Event(\"input\", { bubbles: true }));\n      return true;\n    }\n    if (el.isContentEditable) {\n      return document.execCommand(\"insertText\", false, text);\n    }\n    return false;\n  }\n\n  function dispatchSyntheticPaste(target, text) {\n    try {\n      const dt = new DataTransfer();\n      dt.setData(\"text/plain\", text);\n      const evt = new ClipboardEvent(\"paste\", { clipboardData: dt, bubbles: true, cancelable: true });\n      target.dispatchEvent(evt);\n      return !evt.defaultPrevented ? null : true;\n    } catch (_err) {\n      return false;\n    }\n  }\n\n  function isMonacoInput(el) {\n    return !!(el?.classList?.contains(\"inputarea\") && el.closest?.(\".monaco-editor\"));\n  }\n\n  async function handlePaste(e) {\n    const active = document.activeElement;\n    if (!active) return;\n    const editable = active.tagName === \"INPUT\" || active.tagName === \"TEXTAREA\" || active.isContentEditable;\n    const monaco = isMonacoInput(active);\n    if (!editable && !monaco) return;\n    if (!navigator.clipboard || typeof navigator.clipboard.readText !== \"function\") return;\n    e.preventDefault();\n    try {\n      const text = await navigator.clipboard.readText();\n      if (!text) return;\n      if (monaco) {\n        dispatchSyntheticPaste(active, text);\n      } else {\n        insertAtCursor(active, text);\n      }\n    } catch (_err) {\n    }\n  }\n\n  document.addEventListener(\n    \"keydown\",\n    (e) => {\n      if (!(e.metaKey || e.ctrlKey)) return;\n      const key = e.key.toLowerCase();\n      if (key === \"w\") {\n        e.preventDefault();\n        if (window.glimpse && typeof window.glimpse.close === \"function\") window.glimpse.close();\n        else if (typeof window.close === \"function\") window.close();\n        return;\n      }\n      if (key === \"v\") {\n        void handlePaste(e);\n        return;\n      }\n      if (key === \"c\" || key === \"x\" || key === \"a\") {\n        if (e.defaultPrevented) return;\n        try {\n          document.execCommand(key === \"c\" ? \"copy\" : key === \"x\" ? \"cut\" : \"selectAll\");\n        } catch (_err) {}\n      }\n    },\n    true,\n  );\n})();\n</script>\n<script src=\"https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs/loader.min.js\"></script>\n<script>\n__INLINE_JS__\n</script>\n</body>\n</html>\n";
var appJs = "let suppressAutoSubmitOnClose = false;\n\nconst reviewData = JSON.parse(document.getElementById(\"diff-review-data\").textContent || \"{}\");\nif (!Array.isArray(reviewData.files)) reviewData.files = [];\nif (!Array.isArray(reviewData.commits)) reviewData.commits = [];\n\nconst defaultScope = reviewData.files.some((file) => file.inGitDiff)\n\t? \"branch\"\n\t: reviewData.commits.length > 0\n\t\t? \"commits\"\n\t\t: \"all\";\n\nconst state = {\n\tactiveFileId: null,\n\tcurrentScope: defaultScope,\n\tselectedCommitSha: reviewData.commits[0]?.sha ?? null,\n\tcommitFilesBySha: {}, // sha -> ReviewFile[]\n\tcommitRequestIds: {}, // sha -> requestId (in-flight)\n\tcommitErrors: {}, // sha -> error message\n\treviewDataRequestId: null,\n\tcomments: [],\n\toverallComment: \"\",\n\thideUnchanged: true,\n\twrapLines: true,\n\tcollapsedDirs: {},\n\treviewedFiles: {},\n\tscrollPositions: {},\n\tsidebarCollapsed: false,\n\tfileFilter: \"\",\n\tfileContents: {},\n\tfileErrors: {},\n\tpendingRequestIds: {},\n\tlastWorkingTreeLoadAt: null,\n};\n\nconst sidebarEl = document.getElementById(\"sidebar\");\nconst sidebarTitleEl = document.getElementById(\"sidebar-title\");\nconst sidebarSearchInputEl = document.getElementById(\"sidebar-search-input\");\nconst toggleSidebarButton = document.getElementById(\"toggle-sidebar-button\");\nconst scopeBranchButton = document.getElementById(\"scope-branch-button\");\nconst scopeCommitsButton = document.getElementById(\"scope-commits-button\");\nconst scopeAllButton = document.getElementById(\"scope-all-button\");\nconst commitPickerEl = document.getElementById(\"commit-picker\");\nconst commitListEl = document.getElementById(\"commit-list\");\nconst windowTitleEl = document.getElementById(\"window-title\");\nconst repoRootEl = document.getElementById(\"repo-root\");\nconst fileTreeEl = document.getElementById(\"file-tree\");\nconst summaryEl = document.getElementById(\"summary\");\nconst currentFileLabelEl = document.getElementById(\"current-file-label\");\nconst modeHintEl = document.getElementById(\"mode-hint\");\nconst fileCommentsContainer = document.getElementById(\"file-comments-container\");\nconst editorContainerEl = document.getElementById(\"editor-container\");\nconst refreshWorkingTreeButton = document.getElementById(\"refresh-working-tree-button\");\nconst submitButton = document.getElementById(\"submit-button\");\nconst cancelButton = document.getElementById(\"cancel-button\");\nconst overallCommentButton = document.getElementById(\"overall-comment-button\");\nconst fileCommentButton = document.getElementById(\"file-comment-button\");\nconst toggleReviewedButton = document.getElementById(\"toggle-reviewed-button\");\nconst toggleUnchangedButton = document.getElementById(\"toggle-unchanged-button\");\nconst toggleWrapButton = document.getElementById(\"toggle-wrap-button\");\nconst fileStatusBadgeEl = document.getElementById(\"file-status-badge\");\nconst fileDiffStatsEl = document.getElementById(\"file-diff-stats\");\nconst editorCoverEl = document.getElementById(\"editor-cover\");\nconst binaryPreviewEl = document.getElementById(\"binary-preview\");\n\n// Octicon-style inline SVGs used by the GitHub-style sidebar tree.\nconst OCTICON_CHEVRON_DOWN =\n\t'<svg width=\"12\" height=\"12\" viewBox=\"0 0 16 16\" fill=\"currentColor\"><path d=\"M12.78 6.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 7.28a.749.749 0 1 1 1.06-1.06L8 9.939l3.72-3.719a.749.749 0 0 1 1.06 0Z\"/></svg>';\nconst OCTICON_CHEVRON_RIGHT =\n\t'<svg width=\"12\" height=\"12\" viewBox=\"0 0 16 16\" fill=\"currentColor\"><path d=\"M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z\"/></svg>';\nconst OCTICON_FOLDER =\n\t'<svg class=\"gh-dir-icon\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\" fill=\"currentColor\"><path d=\"M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2A1.75 1.75 0 0 0 5 1H1.75Z\"/></svg>';\nconst OCTICON_FILE =\n\t'<svg class=\"gh-file-icon\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\" fill=\"currentColor\"><path d=\"M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25V1.75Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5H3.75Zm6.75.5v2.25c0 .138.112.25.25.25h2.25a.25.25 0 0 0 .177-.427L10.927 1.573a.25.25 0 0 0-.427.177Z\"/></svg>';\n\nrepoRootEl.textContent = reviewData.repoRoot || \"\";\nwindowTitleEl.textContent = \"Review\";\n\nlet monacoApi = null;\nlet diffEditor = null;\nlet originalModel = null;\nlet modifiedModel = null;\nlet pendingDiffReveal = null; // { dispose: Disposable, timeoutId: number }\nlet originalDecorations = [];\nlet modifiedDecorations = [];\nlet activeViewZones = [];\nlet editorResizeObserver = null;\nlet requestSequence = 0;\n\nfunction escapeHtml(value) {\n\treturn String(value).replace(/&/g, \"&amp;\").replace(/</g, \"&lt;\").replace(/>/g, \"&gt;\").replace(/\"/g, \"&quot;\");\n}\n\nfunction inferLanguage(path) {\n\tif (!path) return \"plaintext\";\n\tconst lower = path.toLowerCase();\n\tif (lower.endsWith(\".ts\") || lower.endsWith(\".tsx\")) return \"typescript\";\n\tif (lower.endsWith(\".js\") || lower.endsWith(\".jsx\") || lower.endsWith(\".mjs\") || lower.endsWith(\".cjs\"))\n\t\treturn \"javascript\";\n\tif (lower.endsWith(\".json\")) return \"json\";\n\tif (lower.endsWith(\".md\")) return \"markdown\";\n\tif (lower.endsWith(\".css\")) return \"css\";\n\tif (lower.endsWith(\".html\")) return \"html\";\n\tif (lower.endsWith(\".sh\")) return \"shell\";\n\tif (lower.endsWith(\".yml\") || lower.endsWith(\".yaml\")) return \"yaml\";\n\tif (lower.endsWith(\".rs\")) return \"rust\";\n\tif (lower.endsWith(\".java\")) return \"java\";\n\tif (lower.endsWith(\".kt\")) return \"kotlin\";\n\tif (lower.endsWith(\".py\")) return \"python\";\n\tif (lower.endsWith(\".go\")) return \"go\";\n\treturn \"plaintext\";\n}\n\nfunction scopeLabel(scope) {\n\tswitch (scope) {\n\t\tcase \"branch\":\n\t\t\treturn \"Branch\";\n\t\tcase \"commits\":\n\t\t\treturn \"Commits\";\n\t\tdefault:\n\t\t\treturn \"All files\";\n\t}\n}\n\nfunction commitInfoBySha(sha) {\n\tif (!sha) return null;\n\treturn reviewData.commits.find((c) => c.sha === sha) ?? null;\n}\n\nfunction selectedCommitInfo() {\n\treturn commitInfoBySha(state.selectedCommitSha);\n}\n\nfunction selectedCommitKind() {\n\treturn selectedCommitInfo()?.kind ?? \"commit\";\n}\n\nfunction hasRepositoryHead() {\n\treturn reviewData.repositoryHasHead === true;\n}\n\nfunction workingTreeOriginalLabel() {\n\treturn hasRepositoryHead() ? \"HEAD\" : \"Empty tree\";\n}\n\nfunction workingTreeRangeLabel() {\n\treturn hasRepositoryHead() ? \"HEAD → working tree\" : \"Empty tree → working tree\";\n}\n\nfunction isWorkingTreeCommit(sha) {\n\treturn commitInfoBySha(sha)?.kind === \"working-tree\";\n}\n\nfunction isSelectedWorkingTreeCommit() {\n\treturn state.currentScope === \"commits\" && isWorkingTreeCommit(state.selectedCommitSha);\n}\n\nfunction scopeHint(scope) {\n\tconst baseRefLabel = reviewData.branchBaseRef || \"the selected base\";\n\tswitch (scope) {\n\t\tcase \"branch\":\n\t\t\treturn `Review current branch changes against ${baseRefLabel}. This view can include uncommitted working tree edits. Hover or click line numbers in the gutter to add an inline comment.`;\n\t\tcase \"commits\": {\n\t\t\tconst info = selectedCommitInfo();\n\t\t\tif (!info) return \"Pick a branch commit from the list to review its diff.\";\n\t\t\tif (info.kind === \"working-tree\") {\n\t\t\t\treturn hasRepositoryHead()\n\t\t\t\t\t? \"Review uncommitted working tree changes against HEAD. This is a live view — outside edits will not appear here until you refresh.\"\n\t\t\t\t\t: \"Review uncommitted working tree changes against the empty tree in this new repository. This is a live view — outside edits will not appear here until you refresh.\";\n\t\t\t}\n\t\t\treturn `Review commit ${info.shortSha} — ${info.subject}`;\n\t\t}\n\t\tdefault:\n\t\t\treturn \"Review the committed HEAD snapshot for files changed on this branch. Hover or click line numbers in the gutter to add a code review comment.\";\n\t}\n}\n\nfunction currentModeHint() {\n\tconst file = activeFile();\n\tif (!file) return scopeHint(state.currentScope);\n\tif (file.kind === \"image\") {\n\t\treturn state.currentScope === \"all\"\n\t\t\t? \"Review the current image snapshot. File-level comments are supported; inline line comments are unavailable for image previews.\"\n\t\t\t: \"Review image changes side by side. File-level comments are supported; inline line comments are unavailable for image previews.\";\n\t}\n\tif (file.kind === \"binary\") {\n\t\treturn \"Binary files show side existence instead of a text diff. File-level comments are supported; inline line comments are unavailable.\";\n\t}\n\treturn scopeHint(state.currentScope);\n}\n\nfunction statusLabel(status) {\n\tif (!status) return \"\";\n\treturn status.charAt(0).toUpperCase() + status.slice(1);\n}\n\nfunction statusBadgeClass(status) {\n\tswitch (status) {\n\t\tcase \"added\":\n\t\t\treturn \"gh-status gh-status-added\";\n\t\tcase \"deleted\":\n\t\t\treturn \"gh-status gh-status-deleted\";\n\t\tcase \"renamed\":\n\t\t\treturn \"gh-status gh-status-renamed\";\n\t\tcase \"modified\":\n\t\t\treturn \"gh-status gh-status-modified\";\n\t\tdefault:\n\t\t\treturn \"gh-status gh-status-modified\";\n\t}\n}\n\nfunction statusCode(status) {\n\tif (!status) return \"\";\n\tif (status === \"renamed\") return \"R\";\n\treturn status.charAt(0).toUpperCase();\n}\n\nfunction isFileReviewed(fileId) {\n\treturn state.reviewedFiles[fileId] === true;\n}\n\nfunction annotateCommentWithCommit(comment) {\n\tif (comment.scope !== \"commits\") return comment;\n\tconst info = selectedCommitInfo();\n\tif (!info) return comment;\n\treturn { ...comment, commitSha: info.sha, commitShort: info.shortSha, commitKind: info.kind };\n}\n\nfunction activeFileList() {\n\tif (state.currentScope === \"commits\") {\n\t\tconst sha = state.selectedCommitSha;\n\t\tif (!sha) return [];\n\t\treturn state.commitFilesBySha[sha] ?? [];\n\t}\n\treturn reviewData.files;\n}\n\nfunction getScopedFiles() {\n\tswitch (state.currentScope) {\n\t\tcase \"branch\":\n\t\t\treturn reviewData.files.filter((file) => file.inGitDiff);\n\t\tcase \"commits\":\n\t\t\treturn activeFileList();\n\t\tdefault:\n\t\t\treturn reviewData.files.filter((file) => file.hasWorkingTreeFile);\n\t}\n}\n\nfunction ensureActiveFileForScope() {\n\tconst scopedFiles = getScopedFiles();\n\tif (scopedFiles.length === 0) {\n\t\tstate.activeFileId = null;\n\t\treturn;\n\t}\n\tif (scopedFiles.some((file) => file.id === state.activeFileId)) {\n\t\treturn;\n\t}\n\tstate.activeFileId = scopedFiles[0].id;\n}\n\nfunction activeFile() {\n\tconst list = activeFileList();\n\treturn list.find((file) => file.id === state.activeFileId) ?? null;\n}\n\nfunction getScopeComparison(file, scope = state.currentScope) {\n\tif (!file) return null;\n\tif (scope === \"branch\" || scope === \"commits\") return file.gitDiff;\n\treturn null;\n}\n\nfunction activeComparison() {\n\treturn getScopeComparison(activeFile(), state.currentScope);\n}\n\nfunction isAddedOnlyComparison(comparison) {\n\treturn comparison != null && comparison.status === \"added\";\n}\n\nfunction activeFileIsAddedOnly() {\n\treturn isAddedOnlyComparison(activeComparison());\n}\n\nfunction activeFileShowsDiff() {\n\tconst file = activeFile();\n\tif (file == null || file.kind !== \"text\") return false;\n\tconst comparison = activeComparison();\n\tif (comparison == null) return false;\n\tif (isAddedOnlyComparison(comparison)) return false;\n\treturn true;\n}\n\nfunction activeFileUsesBinaryPreview() {\n\tconst file = activeFile();\n\treturn file != null && file.kind !== \"text\";\n}\n\nfunction fileKindBadgeMarkup(file) {\n\tif (!file || file.kind === \"text\") return \"\";\n\tconst label = file.kind === \"image\" ? \"IMG\" : \"BIN\";\n\treturn `<span class=\"gh-kind-badge\">${label}</span>`;\n}\n\nfunction hideBinaryPreview() {\n\tif (!editorContainerEl || !binaryPreviewEl) return;\n\teditorContainerEl.dataset.previewActive = \"false\";\n\tbinaryPreviewEl.dataset.active = \"false\";\n\tbinaryPreviewEl.innerHTML = \"\";\n}\n\nfunction previewSideLabel(file, side) {\n\tif (state.currentScope === \"commits\") {\n\t\treturn selectedCommitKind() === \"working-tree\"\n\t\t\t? side === \"original\"\n\t\t\t\t? workingTreeOriginalLabel()\n\t\t\t\t: \"Working tree\"\n\t\t\t: side === \"original\"\n\t\t\t\t? \"Parent\"\n\t\t\t\t: \"Commit\";\n\t}\n\tif (state.currentScope === \"branch\") {\n\t\tif (side === \"original\") return reviewData.branchBaseRef ? `Base (${reviewData.branchBaseRef})` : \"Base\";\n\t\treturn file.hasWorkingTreeFile ? \"Working tree\" : \"HEAD\";\n\t}\n\treturn \"Snapshot\";\n}\n\nfunction renderBinaryPreview(file, contents) {\n\tif (!editorContainerEl || !binaryPreviewEl) return;\n\teditorContainerEl.dataset.previewActive = \"true\";\n\tbinaryPreviewEl.dataset.active = \"true\";\n\tconst requestState = getRequestState(file.id, state.currentScope);\n\tif (requestState.error) {\n\t\tbinaryPreviewEl.innerHTML = `<div class=\"binary-preview-note\">Failed to load ${escapeHtml(getScopeDisplayPath(file, state.currentScope))}<br><br>${escapeHtml(requestState.error)}</div>`;\n\t\treturn;\n\t}\n\tif (requestState.requestId != null && requestState.contents == null) {\n\t\tbinaryPreviewEl.innerHTML = `<div class=\"binary-preview-note\">Loading preview for ${escapeHtml(getScopeDisplayPath(file, state.currentScope))}...</div>`;\n\t\treturn;\n\t}\n\n\tconst showComparison = state.currentScope !== \"all\";\n\tconst cards = [];\n\tconst pushCard = (label, exists, previewUrl) => {\n\t\tconst body = exists\n\t\t\t? file.kind === \"image\" && previewUrl\n\t\t\t\t? `<img class=\"binary-preview-image\" src=\"${previewUrl}\" alt=\"${escapeHtml(label)} preview\">`\n\t\t\t\t: `<div class=\"binary-preview-empty\">Binary file present</div>`\n\t\t\t: `<div class=\"binary-preview-empty\">Not present in this side</div>`;\n\t\tcards.push(`\n\t\t\t<div class=\"binary-preview-card\">\n\t\t\t\t<div class=\"binary-preview-card-header\">\n\t\t\t\t\t<span>${escapeHtml(label)}</span>\n\t\t\t\t\t<span>${exists ? \"present\" : \"absent\"}</span>\n\t\t\t\t</div>\n\t\t\t\t<div class=\"binary-preview-card-body\">${body}</div>\n\t\t\t</div>\n\t\t`);\n\t};\n\n\tif (showComparison) {\n\t\tpushCard(previewSideLabel(file, \"original\"), contents.originalExists, contents.originalPreviewUrl);\n\t\tpushCard(previewSideLabel(file, \"modified\"), contents.modifiedExists, contents.modifiedPreviewUrl);\n\t} else {\n\t\tpushCard(previewSideLabel(file, \"modified\"), contents.modifiedExists, contents.modifiedPreviewUrl);\n\t}\n\n\tconst note =\n\t\tfile.kind === \"image\"\n\t\t\t? \"Image files are rendered directly in the review pane.\"\n\t\t\t: \"Binary files do not have a text diff here. The review pane shows whether each side exists.\";\n\tbinaryPreviewEl.innerHTML = `<div class=\"binary-preview-grid\">${cards.join(\"\")}</div><div class=\"binary-preview-note\">${escapeHtml(note)}</div>`;\n}\n\nfunction getScopeFilePath(file) {\n\tconst comparison = getScopeComparison(file, state.currentScope);\n\treturn comparison?.newPath || comparison?.oldPath || file?.path || \"\";\n}\n\nfunction getScopeDisplayPath(file, scope = state.currentScope) {\n\tconst comparison = getScopeComparison(file, scope);\n\treturn comparison?.displayPath || file?.path || \"\";\n}\n\nfunction getFileSearchPath(file) {\n\treturn file?.path || \"\";\n}\n\nfunction getBaseName(path) {\n\tconst parts = path.split(\"/\");\n\treturn parts[parts.length - 1] || path;\n}\n\nfunction getActiveStatus(file) {\n\tconst comparison = getScopeComparison(file, state.currentScope);\n\treturn comparison?.status ?? file?.worktreeStatus ?? null;\n}\n\nfunction normalizeQuery(query) {\n\treturn String(query || \"\")\n\t\t.trim()\n\t\t.toLowerCase()\n\t\t.replace(/\\s+/g, \"\");\n}\n\nfunction scoreSubsequence(query, candidate) {\n\tif (!query) return 0;\n\tlet queryIndex = 0;\n\tlet score = 0;\n\tlet firstMatchIndex = -1;\n\tlet previousMatchIndex = -2;\n\n\tfor (let i = 0; i < candidate.length && queryIndex < query.length; i += 1) {\n\t\tif (candidate[i] !== query[queryIndex]) continue;\n\n\t\tif (firstMatchIndex === -1) firstMatchIndex = i;\n\t\tscore += 10;\n\n\t\tif (i === previousMatchIndex + 1) {\n\t\t\tscore += 8;\n\t\t}\n\n\t\tconst previousChar = i > 0 ? candidate[i - 1] : \"\";\n\t\tif (i === 0 || previousChar === \"/\" || previousChar === \"_\" || previousChar === \"-\" || previousChar === \".\") {\n\t\t\tscore += 12;\n\t\t}\n\n\t\tpreviousMatchIndex = i;\n\t\tqueryIndex += 1;\n\t}\n\n\tif (queryIndex !== query.length) return -1;\n\tif (firstMatchIndex >= 0) score += Math.max(0, 20 - firstMatchIndex);\n\treturn score;\n}\n\nfunction getFileSearchScore(query, file) {\n\tconst normalizedQuery = normalizeQuery(query);\n\tif (!normalizedQuery) return 0;\n\n\tconst path = getFileSearchPath(file).toLowerCase();\n\tconst baseName = getBaseName(path);\n\tconst pathScore = scoreSubsequence(normalizedQuery, path);\n\tconst baseScore = scoreSubsequence(normalizedQuery, baseName);\n\tlet score = Math.max(pathScore, baseScore >= 0 ? baseScore + 40 : -1);\n\n\tif (score < 0) return -1;\n\tif (baseName === normalizedQuery) score += 200;\n\telse if (baseName.startsWith(normalizedQuery)) score += 120;\n\telse if (path.includes(normalizedQuery)) score += 35;\n\n\treturn score;\n}\n\nfunction getFilteredFiles() {\n\tconst scopedFiles = getScopedFiles();\n\tconst query = state.fileFilter.trim();\n\tif (!query) return [...scopedFiles];\n\n\treturn scopedFiles\n\t\t.map((file) => ({ file, score: getFileSearchScore(query, file) }))\n\t\t.filter((entry) => entry.score >= 0)\n\t\t.sort((a, b) => {\n\t\t\tif (b.score !== a.score) return b.score - a.score;\n\t\t\treturn getFileSearchPath(a.file).localeCompare(getFileSearchPath(b.file));\n\t\t})\n\t\t.map((entry) => entry.file);\n}\n\nfunction collapseTreeNode(node, isRoot = false) {\n\tif (node.kind === \"file\") return node;\n\n\tconst collapsedChildren = [...node.children.values()].map((child) => collapseTreeNode(child));\n\tlet collapsed = {\n\t\t...node,\n\t\tchildren: new Map(collapsedChildren.map((child) => [child.name, child])),\n\t};\n\n\tif (isRoot) return collapsed;\n\n\twhile (collapsed.children.size === 1) {\n\t\tconst [onlyChild] = collapsed.children.values();\n\t\tif (!onlyChild || onlyChild.kind !== \"dir\") break;\n\t\tcollapsed = {\n\t\t\tname: `${collapsed.name}/${onlyChild.name}`,\n\t\t\tpath: onlyChild.path,\n\t\t\tkind: \"dir\",\n\t\t\tchildren: onlyChild.children,\n\t\t\tfile: null,\n\t\t};\n\t}\n\n\treturn collapsed;\n}\n\nfunction buildTree(files) {\n\tconst root = { name: \"\", path: \"\", kind: \"dir\", children: new Map(), file: null };\n\tfor (const file of files) {\n\t\tconst path = getFileSearchPath(file);\n\t\tconst parts = path.split(\"/\");\n\t\tlet node = root;\n\t\tlet currentPath = \"\";\n\t\tfor (let i = 0; i < parts.length; i += 1) {\n\t\t\tconst part = parts[i];\n\t\t\tconst isLeaf = i === parts.length - 1;\n\t\t\tcurrentPath = currentPath ? `${currentPath}/${part}` : part;\n\t\t\tif (!node.children.has(part)) {\n\t\t\t\tnode.children.set(part, {\n\t\t\t\t\tname: part,\n\t\t\t\t\tpath: currentPath,\n\t\t\t\t\tkind: isLeaf ? \"file\" : \"dir\",\n\t\t\t\t\tchildren: new Map(),\n\t\t\t\t\tfile: isLeaf ? file : null,\n\t\t\t\t});\n\t\t\t}\n\t\t\tnode = node.children.get(part);\n\t\t\tif (isLeaf) node.file = file;\n\t\t}\n\t}\n\treturn collapseTreeNode(root, true);\n}\n\nfunction cacheKey(scope, fileId, commitSha = null) {\n\tif (scope === \"commits\") {\n\t\treturn `commits:${commitSha ?? state.selectedCommitSha ?? \"\"}:${fileId}`;\n\t}\n\treturn `${scope}:${fileId}`;\n}\n\nfunction scrollKey(scope, fileId, commitSha = null) {\n\tif (scope === \"commits\") {\n\t\treturn `commits:${commitSha ?? state.selectedCommitSha ?? \"\"}:${fileId}`;\n\t}\n\treturn `${scope}:${fileId}`;\n}\n\nfunction saveCurrentScrollPosition() {\n\tif (!diffEditor || !state.activeFileId) return;\n\tconst originalEditor = diffEditor.getOriginalEditor();\n\tconst modifiedEditor = diffEditor.getModifiedEditor();\n\tstate.scrollPositions[scrollKey(state.currentScope, state.activeFileId)] = {\n\t\toriginalTop: originalEditor.getScrollTop(),\n\t\toriginalLeft: originalEditor.getScrollLeft(),\n\t\tmodifiedTop: modifiedEditor.getScrollTop(),\n\t\tmodifiedLeft: modifiedEditor.getScrollLeft(),\n\t};\n}\n\nfunction restoreFileScrollPosition() {\n\tif (!diffEditor || !state.activeFileId) return;\n\tconst scrollState = state.scrollPositions[scrollKey(state.currentScope, state.activeFileId)];\n\tif (!scrollState) return;\n\tconst originalEditor = diffEditor.getOriginalEditor();\n\tconst modifiedEditor = diffEditor.getModifiedEditor();\n\toriginalEditor.setScrollTop(scrollState.originalTop);\n\toriginalEditor.setScrollLeft(scrollState.originalLeft);\n\tmodifiedEditor.setScrollTop(scrollState.modifiedTop);\n\tmodifiedEditor.setScrollLeft(scrollState.modifiedLeft);\n}\n\nfunction captureScrollState() {\n\tif (!diffEditor) return null;\n\tconst originalEditor = diffEditor.getOriginalEditor();\n\tconst modifiedEditor = diffEditor.getModifiedEditor();\n\treturn {\n\t\toriginalTop: originalEditor.getScrollTop(),\n\t\toriginalLeft: originalEditor.getScrollLeft(),\n\t\tmodifiedTop: modifiedEditor.getScrollTop(),\n\t\tmodifiedLeft: modifiedEditor.getScrollLeft(),\n\t};\n}\n\nfunction restoreScrollState(scrollState) {\n\tif (!diffEditor || !scrollState) return;\n\tconst originalEditor = diffEditor.getOriginalEditor();\n\tconst modifiedEditor = diffEditor.getModifiedEditor();\n\toriginalEditor.setScrollTop(scrollState.originalTop);\n\toriginalEditor.setScrollLeft(scrollState.originalLeft);\n\tmodifiedEditor.setScrollTop(scrollState.modifiedTop);\n\tmodifiedEditor.setScrollLeft(scrollState.modifiedLeft);\n}\n\nfunction getRequestState(fileId, scope = state.currentScope, commitSha = null) {\n\tconst key = cacheKey(scope, fileId, commitSha);\n\treturn {\n\t\tcontents: state.fileContents[key],\n\t\terror: state.fileErrors[key],\n\t\trequestId: state.pendingRequestIds[key],\n\t};\n}\n\nfunction ensureFileLoaded(fileId, scope = state.currentScope, commitSha = null, options = {}) {\n\tif (!fileId) return;\n\tconst forceRefresh = options.forceRefresh === true;\n\tconst resolvedCommitSha = scope === \"commits\" ? (commitSha ?? state.selectedCommitSha ?? null) : null;\n\tconst key = cacheKey(scope, fileId, resolvedCommitSha);\n\tif (!forceRefresh) {\n\t\tif (state.fileContents[key] != null) return;\n\t\tif (state.fileErrors[key] != null) return;\n\t\tif (state.pendingRequestIds[key] != null) return;\n\t}\n\n\tconst requestId = `request:${Date.now()}:${++requestSequence}`;\n\tstate.pendingRequestIds[key] = requestId;\n\trenderTree();\n\tif (window.glimpse?.send) {\n\t\tconst payload = { type: \"request-file\", requestId, fileId, scope };\n\t\tif (scope === \"commits\" && resolvedCommitSha) {\n\t\t\tpayload.commitSha = resolvedCommitSha;\n\t\t}\n\t\twindow.glimpse.send(payload);\n\t}\n}\n\nfunction ensureCommitFilesLoaded(sha, options = {}) {\n\tif (!sha) return;\n\tconst forceRefresh = options.forceRefresh === true;\n\tif (!forceRefresh) {\n\t\tif (state.commitFilesBySha[sha] != null) return;\n\t\tif (state.commitErrors[sha] != null) return;\n\t}\n\tif (state.commitRequestIds[sha] != null) return;\n\n\tif (forceRefresh) {\n\t\tdelete state.commitErrors[sha];\n\t}\n\tconst requestId = `commit-request:${Date.now()}:${++requestSequence}`;\n\tstate.commitRequestIds[sha] = requestId;\n\tif (window.glimpse?.send) {\n\t\twindow.glimpse.send({ type: \"request-commit\", requestId, sha });\n\t}\n\trenderCommitList();\n}\n\nfunction formatWorkingTreeLoadLabel(timestamp) {\n\tif (!timestamp) return \"Not loaded yet\";\n\tconst date = new Date(timestamp);\n\tif (Number.isNaN(date.getTime())) return \"Not loaded yet\";\n\treturn date.toLocaleTimeString(undefined, { hour: \"numeric\", minute: \"2-digit\", second: \"2-digit\" });\n}\n\nfunction updateWorkingTreeRefreshButton() {\n\tif (!refreshWorkingTreeButton) return;\n\tif (state.currentScope !== \"commits\") {\n\t\trefreshWorkingTreeButton.style.display = \"none\";\n\t\trefreshWorkingTreeButton.disabled = true;\n\t\treturn;\n\t}\n\tconst sha = state.selectedCommitSha;\n\tconst commitLoading = sha ? state.commitRequestIds[sha] != null : false;\n\tconst reviewDataLoading = state.reviewDataRequestId != null;\n\tconst loading = commitLoading || reviewDataLoading;\n\trefreshWorkingTreeButton.style.display = \"inline-flex\";\n\trefreshWorkingTreeButton.disabled = loading;\n\trefreshWorkingTreeButton.textContent = loading\n\t\t? \"Refreshing…\"\n\t\t: isSelectedWorkingTreeCommit()\n\t\t\t? \"Refresh live diff\"\n\t\t\t: \"Refresh commits view\";\n\trefreshWorkingTreeButton.title = isSelectedWorkingTreeCommit()\n\t\t? `Live working tree. Outside edits will not appear until you refresh. Last loaded ${formatWorkingTreeLoadLabel(state.lastWorkingTreeLoadAt)}.`\n\t\t: \"Refresh the commits list to detect new or cleared uncommitted changes.\";\n}\n\nfunction clearFileRequestStateByPrefixes(prefixes) {\n\tconst matchesPrefix = (key) => prefixes.some((prefix) => key.startsWith(prefix));\n\tfor (const key of Object.keys(state.fileContents)) {\n\t\tif (matchesPrefix(key)) delete state.fileContents[key];\n\t}\n\tfor (const key of Object.keys(state.fileErrors)) {\n\t\tif (matchesPrefix(key)) delete state.fileErrors[key];\n\t}\n\tfor (const key of Object.keys(state.pendingRequestIds)) {\n\t\tif (matchesPrefix(key)) delete state.pendingRequestIds[key];\n\t}\n}\n\nfunction clearCommitScopedState(sha) {\n\tclearFileRequestStateByPrefixes([`commits:${sha}:`]);\n}\n\nfunction clearRefreshableFileState() {\n\tconst prefixes = [\"branch:\", \"all:\"];\n\tfor (const commit of reviewData.commits) {\n\t\tif (commit.kind === \"working-tree\") {\n\t\t\tprefixes.push(`commits:${commit.sha}:`);\n\t\t}\n\t}\n\tclearFileRequestStateByPrefixes(prefixes);\n}\n\nfunction clearWorkingTreeReviewArtifacts(sha) {\n\tstate.comments = state.comments.filter((comment) => !(comment.scope === \"commits\" && comment.commitSha === sha));\n\tconst previousFiles = state.commitFilesBySha[sha] ?? [];\n\tfor (const file of previousFiles) {\n\t\tdelete state.reviewedFiles[file.id];\n\t\tdelete state.scrollPositions[scrollKey(\"commits\", file.id, sha)];\n\t}\n}\n\nfunction clearWorkingTreeCommitState() {\n\tfor (const commit of reviewData.commits) {\n\t\tif (commit.kind !== \"working-tree\") continue;\n\t\tclearWorkingTreeReviewArtifacts(commit.sha);\n\t\tclearCommitScopedState(commit.sha);\n\t\tdelete state.commitFilesBySha[commit.sha];\n\t\tdelete state.commitErrors[commit.sha];\n\t\tdelete state.commitRequestIds[commit.sha];\n\t}\n}\n\nfunction requestLatestReviewData() {\n\tif (!window.glimpse?.send) return;\n\tif (state.reviewDataRequestId != null) return;\n\tconst requestId = `review-data-request:${Date.now()}:${++requestSequence}`;\n\tstate.reviewDataRequestId = requestId;\n\tupdateWorkingTreeRefreshButton();\n\twindow.glimpse.send({ type: \"request-review-data\", requestId });\n}\n\nfunction refreshCommitsView() {\n\tif (state.currentScope !== \"commits\") return;\n\tclearRefreshableFileState();\n\tclearWorkingTreeCommitState();\n\tstate.lastWorkingTreeLoadAt = null;\n\trenderTree();\n\tif (diffEditor && monacoApi) {\n\t\tmountFile({ preserveScroll: true });\n\t} else {\n\t\trenderFileComments();\n\t}\n\trequestLatestReviewData();\n}\n\nfunction openFile(fileId) {\n\tif (state.activeFileId === fileId) {\n\t\tensureFileLoaded(fileId, state.currentScope);\n\t\treturn;\n\t}\n\tsaveCurrentScrollPosition();\n\tstate.activeFileId = fileId;\n\trenderAll({ restoreFileScroll: true });\n\tensureFileLoaded(fileId, state.currentScope);\n}\n\nfunction renderTreeNode(node, depth) {\n\tconst children = [...node.children.values()].sort((a, b) => {\n\t\tif (a.kind !== b.kind) return a.kind === \"dir\" ? -1 : 1;\n\t\treturn a.name.localeCompare(b.name);\n\t});\n\n\tconst indentPx = 12;\n\n\tfor (const child of children) {\n\t\tif (child.kind === \"dir\") {\n\t\t\tconst collapsed = state.collapsedDirs[child.path] === true;\n\t\t\tconst row = document.createElement(\"button\");\n\t\t\trow.type = \"button\";\n\t\t\trow.className = \"gh-tree-row\";\n\t\t\trow.style.paddingLeft = `${depth * indentPx + 8}px`;\n\t\t\trow.innerHTML = `\n        <span class=\"flex h-3 w-3 items-center justify-center text-review-muted\">${collapsed ? OCTICON_CHEVRON_RIGHT : OCTICON_CHEVRON_DOWN}</span>\n        ${OCTICON_FOLDER}\n        <span class=\"gh-row-name\">${escapeHtml(child.name)}</span>\n      `;\n\t\t\trow.addEventListener(\"click\", () => {\n\t\t\t\tstate.collapsedDirs[child.path] = !collapsed;\n\t\t\t\trenderTree();\n\t\t\t});\n\t\t\tfileTreeEl.appendChild(row);\n\t\t\tif (!collapsed) renderTreeNode(child, depth + 1);\n\t\t\tcontinue;\n\t\t}\n\n\t\tconst file = child.file;\n\t\tconst count = state.comments.filter(\n\t\t\t(comment) => comment.fileId === file.id && comment.scope === state.currentScope,\n\t\t).length;\n\t\tconst reviewed = isFileReviewed(file.id);\n\t\tconst requestState = getRequestState(file.id, state.currentScope);\n\t\tconst loading = requestState.requestId != null && requestState.contents == null;\n\t\tconst errored = requestState.error != null;\n\t\tconst status = getActiveStatus(file);\n\t\tconst button = document.createElement(\"button\");\n\t\tbutton.type = \"button\";\n\t\tbutton.className = \"gh-tree-row\";\n\t\tbutton.dataset.selected = file.id === state.activeFileId ? \"true\" : \"false\";\n\t\tif (reviewed) button.style.opacity = \"0.6\";\n\t\tbutton.style.paddingLeft = `${depth * indentPx + 26}px`;\n\t\tconst loadingBadge = loading\n\t\t\t? '<span class=\"text-[10px] text-review-accent\">…</span>'\n\t\t\t: errored\n\t\t\t\t? '<span class=\"text-[10px] text-review-danger\">!</span>'\n\t\t\t\t: \"\";\n\t\tbutton.innerHTML = `\n\t\t\t${OCTICON_FILE}\n\t\t\t<span class=\"gh-row-name\">${escapeHtml(child.name)}</span>\n\t\t\t<span class=\"gh-row-trail\">\n\t\t\t\t${fileKindBadgeMarkup(file)}\n\t\t\t\t${loadingBadge}\n\t\t\t\t${count > 0 ? `<span class=\"gh-comment-count\">${count}</span>` : \"\"}\n\t\t\t\t${status ? `<span class=\"${statusBadgeClass(status)}\">${escapeHtml(statusCode(status))}</span>` : \"\"}\n\t\t\t</span>\n\t\t`;\n\t\tbutton.addEventListener(\"click\", () => openFile(file.id));\n\t\tfileTreeEl.appendChild(button);\n\t}\n}\n\nfunction renderSearchResults(files) {\n\tfiles.forEach((file) => {\n\t\tconst path = getFileSearchPath(file);\n\t\tconst baseName = getBaseName(path);\n\t\tconst parentPath = path.includes(\"/\") ? path.slice(0, path.lastIndexOf(\"/\")) : \"\";\n\t\tconst count = state.comments.filter(\n\t\t\t(comment) => comment.fileId === file.id && comment.scope === state.currentScope,\n\t\t).length;\n\t\tconst reviewed = isFileReviewed(file.id);\n\t\tconst requestState = getRequestState(file.id, state.currentScope);\n\t\tconst loading = requestState.requestId != null && requestState.contents == null;\n\t\tconst errored = requestState.error != null;\n\t\tconst status = getActiveStatus(file);\n\t\tconst button = document.createElement(\"button\");\n\t\tbutton.type = \"button\";\n\t\tbutton.className = \"gh-tree-row\";\n\t\tbutton.dataset.selected = file.id === state.activeFileId ? \"true\" : \"false\";\n\t\tif (reviewed) button.style.opacity = \"0.6\";\n\t\tbutton.style.alignItems = \"flex-start\";\n\t\tbutton.style.padding = \"6px 8px\";\n\t\tconst loadingBadge = loading\n\t\t\t? '<span class=\"text-[10px] text-review-accent\">…</span>'\n\t\t\t: errored\n\t\t\t\t? '<span class=\"text-[10px] text-review-danger\">!</span>'\n\t\t\t\t: \"\";\n\t\tbutton.innerHTML = `\n\t\t\t${OCTICON_FILE}\n\t\t\t<span class=\"min-w-0 flex-1\">\n\t\t\t\t<span class=\"block truncate text-[13px]\">${escapeHtml(baseName)}</span>\n\t\t\t\t<span class=\"block truncate text-[11px] text-review-muted\">${escapeHtml(parentPath || path)}</span>\n\t\t\t</span>\n\t\t\t<span class=\"gh-row-trail\">\n\t\t\t\t${fileKindBadgeMarkup(file)}\n\t\t\t\t${loadingBadge}\n\t\t\t\t${count > 0 ? `<span class=\"gh-comment-count\">${count}</span>` : \"\"}\n\t\t\t\t${status ? `<span class=\"${statusBadgeClass(status)}\">${escapeHtml(statusCode(status))}</span>` : \"\"}\n\t\t\t</span>\n\t\t`;\n\t\tbutton.addEventListener(\"click\", () => openFile(file.id));\n\t\tfileTreeEl.appendChild(button);\n\t});\n}\n\nfunction updateSidebarLayout() {\n\tconst collapsed = state.sidebarCollapsed;\n\tsidebarEl.style.width = collapsed ? \"0px\" : \"280px\";\n\tsidebarEl.style.minWidth = collapsed ? \"0px\" : \"280px\";\n\tsidebarEl.style.flexBasis = collapsed ? \"0px\" : \"280px\";\n\tsidebarEl.style.borderRightWidth = collapsed ? \"0px\" : \"1px\";\n\tsidebarEl.style.pointerEvents = collapsed ? \"none\" : \"auto\";\n\ttoggleSidebarButton.dataset.active = collapsed ? \"false\" : \"true\";\n\ttoggleSidebarButton.title = collapsed ? \"Show sidebar\" : \"Hide sidebar\";\n}\n\nfunction updateScopeButtons() {\n\tconst counts = {\n\t\tbranch: reviewData.files.filter((file) => file.inGitDiff).length,\n\t\tcommits: reviewData.commits.length,\n\t\tall: reviewData.files.filter((file) => file.hasWorkingTreeFile).length,\n\t};\n\n\tconst applyButtonClasses = (button, active, disabled) => {\n\t\tbutton.disabled = disabled;\n\t\tbutton.className = disabled\n\t\t\t? \"cursor-default rounded-md border border-review-border bg-review-bg px-2.5 py-1 text-[11px] font-medium text-review-muted opacity-60\"\n\t\t\t: active\n\t\t\t\t? \"cursor-pointer rounded-md border border-review-success-emphasis/40 bg-review-success-emphasis/15 px-2.5 py-1 text-[11px] font-medium text-review-success hover:bg-review-success-emphasis/25\"\n\t\t\t\t: \"cursor-pointer rounded-md border border-review-border bg-review-panel px-2.5 py-1 text-[11px] font-medium text-review-text hover:bg-[#1f242c]\";\n\t};\n\n\tscopeBranchButton.textContent = `Branch${counts.branch > 0 ? ` (${counts.branch})` : \"\"}`;\n\tscopeCommitsButton.textContent = `Commits${counts.commits > 0 ? ` (${counts.commits})` : \"\"}`;\n\tscopeAllButton.textContent = `All${counts.all > 0 ? ` (${counts.all})` : \"\"}`;\n\n\tapplyButtonClasses(scopeBranchButton, state.currentScope === \"branch\", counts.branch === 0);\n\tapplyButtonClasses(scopeCommitsButton, state.currentScope === \"commits\", counts.commits === 0);\n\tapplyButtonClasses(scopeAllButton, state.currentScope === \"all\", counts.all === 0);\n\n\tif (commitPickerEl) {\n\t\tcommitPickerEl.style.display = state.currentScope === \"commits\" ? \"\" : \"none\";\n\t}\n}\n\nfunction renderCommitList() {\n\tif (!commitListEl) return;\n\tcommitListEl.innerHTML = \"\";\n\tif (reviewData.commits.length === 0) {\n\t\tcommitListEl.innerHTML = '<div class=\"px-3 py-2 text-[11px] text-review-muted\">No commits to review.</div>';\n\t\tupdateWorkingTreeRefreshButton();\n\t\treturn;\n\t}\n\tfor (const commit of reviewData.commits) {\n\t\tconst row = document.createElement(\"button\");\n\t\trow.type = \"button\";\n\t\trow.className = \"commit-row\";\n\t\trow.dataset.selected = commit.sha === state.selectedCommitSha ? \"true\" : \"false\";\n\t\tconst loading = state.commitRequestIds[commit.sha] != null && state.commitFilesBySha[commit.sha] == null;\n\t\tconst errored = state.commitErrors[commit.sha] != null;\n\t\tconst isWorkingTreeCommit = commit.kind === \"working-tree\";\n\t\tconst date = !isWorkingTreeCommit && commit.authorDate ? new Date(commit.authorDate) : null;\n\t\tconst dateLabel =\n\t\t\tdate && !Number.isNaN(date.getTime())\n\t\t\t\t? date.toLocaleDateString(undefined, { month: \"short\", day: \"numeric\" })\n\t\t\t\t: \"\";\n\t\tconst metaLabel = isWorkingTreeCommit\n\t\t\t? `Live · ${workingTreeRangeLabel()}`\n\t\t\t: `${commit.authorName || \"\"}${dateLabel ? ` · ${dateLabel}` : \"\"}`;\n\t\trow.innerHTML = `\n      <span class=\"commit-row-sha\">${escapeHtml(commit.shortSha)}</span>\n      <span class=\"commit-row-body\">\n        <span class=\"commit-row-subject\">${escapeHtml(commit.subject)}</span>\n        <span class=\"commit-row-meta\">${escapeHtml(metaLabel)}</span>\n      </span>\n      <span class=\"commit-row-status\">${loading ? \"…\" : errored ? \"!\" : \"\"}</span>\n    `;\n\t\trow.addEventListener(\"click\", () => selectCommit(commit.sha));\n\t\tcommitListEl.appendChild(row);\n\t}\n\tupdateWorkingTreeRefreshButton();\n}\n\nfunction selectCommit(sha) {\n\tif (!sha) return;\n\tif (state.selectedCommitSha === sha && state.commitFilesBySha[sha] != null) return;\n\tsaveCurrentScrollPosition();\n\tstate.selectedCommitSha = sha;\n\tstate.activeFileId = null;\n\tensureCommitFilesLoaded(sha);\n\trenderAll({ restoreFileScroll: false });\n\tconst file = activeFile();\n\tif (file) ensureFileLoaded(file.id, state.currentScope);\n}\n\nfunction updateToggleButtons() {\n\tconst file = activeFile();\n\tconst reviewed = file ? isFileReviewed(file.id) : false;\n\tconst usesBinaryPreview = activeFileUsesBinaryPreview();\n\ttoggleReviewedButton.dataset.active = reviewed ? \"true\" : \"false\";\n\ttoggleReviewedButton.title = reviewed ? \"Viewed (click to unmark)\" : \"Mark this file as viewed\";\n\ttoggleReviewedButton.disabled = !file;\n\tfileCommentButton.disabled = !file;\n\ttoggleWrapButton.dataset.active = !usesBinaryPreview && state.wrapLines ? \"true\" : \"false\";\n\ttoggleWrapButton.disabled = !file || usesBinaryPreview;\n\ttoggleWrapButton.title = usesBinaryPreview\n\t\t? \"Wrap is unavailable for binary previews\"\n\t\t: `Wrap long lines (${state.wrapLines ? \"on\" : \"off\"})`;\n\ttoggleUnchangedButton.dataset.active = state.hideUnchanged ? \"true\" : \"false\";\n\ttoggleUnchangedButton.title = state.hideUnchanged\n\t\t? \"Showing changed areas only — click to show full file\"\n\t\t: \"Show changed areas only\";\n\ttoggleUnchangedButton.style.display = !usesBinaryPreview && activeFileShowsDiff() ? \"inline-flex\" : \"none\";\n\tupdateScopeButtons();\n\tupdateWorkingTreeRefreshButton();\n\tmodeHintEl.textContent = currentModeHint();\n\tsubmitButton.disabled = false;\n\tupdateFileHeaderMeta(file);\n}\n\nfunction applyEditorOptions() {\n\tif (!diffEditor) return;\n\tconst addedOnly = activeFileIsAddedOnly();\n\tconst showDiff = activeFileShowsDiff();\n\teditorContainerEl.dataset.addedOnly = addedOnly ? \"true\" : \"false\";\n\tdiffEditor.updateOptions({\n\t\trenderSideBySide: showDiff,\n\t\tdiffWordWrap: state.wrapLines ? \"on\" : \"off\",\n\t\thideUnchangedRegions: {\n\t\t\tenabled: showDiff && state.hideUnchanged,\n\t\t\tcontextLineCount: 4,\n\t\t\tminimumLineCount: 2,\n\t\t\trevealLineCount: 12,\n\t\t},\n\t});\n\t// For added-only files, hide the original editor's line numbers so the inline diff\n\t// gutter doesn't paint a redundant two-column layout alongside the modified numbers.\n\tdiffEditor.getOriginalEditor().updateOptions({\n\t\twordWrap: state.wrapLines ? \"on\" : \"off\",\n\t\tlineNumbers: addedOnly ? \"off\" : \"on\",\n\t});\n\tdiffEditor.getModifiedEditor().updateOptions({ wordWrap: state.wrapLines ? \"on\" : \"off\" });\n}\n\nfunction renderTree() {\n\tensureActiveFileForScope();\n\tfileTreeEl.innerHTML = \"\";\n\tconst scopedFiles = getScopedFiles();\n\tconst visibleFiles = getFilteredFiles();\n\n\tif (visibleFiles.length === 0) {\n\t\tconst message = state.fileFilter.trim()\n\t\t\t? `No files match <span class=\"text-review-text\">${escapeHtml(state.fileFilter.trim())}</span>.`\n\t\t\t: `No files in <span class=\"text-review-text\">${escapeHtml(scopeLabel(state.currentScope).toLowerCase())}</span>.`;\n\t\tfileTreeEl.innerHTML = `\n      <div class=\"px-3 py-4 text-sm text-review-muted\">\n        ${message}\n      </div>\n    `;\n\t} else if (state.fileFilter.trim()) {\n\t\trenderSearchResults(visibleFiles);\n\t} else {\n\t\trenderTreeNode(buildTree(visibleFiles), 0);\n\t}\n\n\tsidebarTitleEl.textContent = scopeLabel(state.currentScope);\n\tconst comments = state.comments.length;\n\tconst filteredSuffix = state.fileFilter.trim() ? ` • ${visibleFiles.length} shown` : \"\";\n\tconst liveSuffix = isSelectedWorkingTreeCommit() ? \" • live working tree\" : \"\";\n\tsummaryEl.textContent = `${scopedFiles.length} file(s) • ${comments} comment(s)${state.overallComment ? \" • overall note\" : \"\"}${filteredSuffix}${liveSuffix}`;\n\tupdateToggleButtons();\n\tupdateSidebarLayout();\n}\n\nlet activePopover = null;\n\nfunction closeActivePopover() {\n\tif (!activePopover) return;\n\tactivePopover.dispose();\n\tactivePopover = null;\n}\n\nfunction showTextPopover(trigger, options) {\n\tif (activePopover && activePopover.trigger === trigger) {\n\t\tcloseActivePopover();\n\t\treturn;\n\t}\n\tcloseActivePopover();\n\n\tconst popover = document.createElement(\"div\");\n\tpopover.className = \"review-popover\";\n\tpopover.innerHTML = `\n    <div class=\"mb-1 text-[13px] font-semibold text-review-text\">${escapeHtml(options.title)}</div>\n    <div class=\"mb-2 text-[11px] text-review-muted\">${escapeHtml(options.description)}</div>\n    <textarea id=\"review-popover-text\" class=\"scrollbar-thin w-full resize-y rounded-md border border-review-border bg-[#010409] px-2.5 py-1.5 text-[13px] text-review-text outline-none focus:border-review-accent focus:ring-1 focus:ring-review-accent\" placeholder=\"${escapeHtml(options.placeholder ?? \"\")}\">${escapeHtml(options.initialValue ?? \"\")}</textarea>\n    <div class=\"mt-2 flex items-center justify-between gap-2\">\n      <div class=\"text-[10px] text-review-subtle\">↵ to save · Esc to close</div>\n      <div class=\"flex gap-2\">\n        <button id=\"review-popover-cancel\" class=\"cursor-pointer rounded-md border border-review-border bg-review-panel px-3 py-1 text-[12px] font-medium text-review-text hover:bg-review-panel-hover\">Cancel</button>\n        <button id=\"review-popover-save\" class=\"cursor-pointer rounded-md border border-[rgba(240,246,252,0.1)] bg-review-success-emphasis px-3 py-1 text-[12px] font-medium text-white hover:bg-review-success\">${escapeHtml(options.saveLabel ?? \"Save\")}</button>\n      </div>\n    </div>\n  `;\n\tdocument.body.appendChild(popover);\n\n\t// Position anchored to trigger button, preferring below-right alignment.\n\tconst rect = trigger.getBoundingClientRect();\n\tconst popRect = popover.getBoundingClientRect();\n\tconst viewportW = document.documentElement.clientWidth;\n\tconst margin = 8;\n\tconst gap = 6;\n\tconst top = rect.bottom + gap;\n\tlet left = rect.right - popRect.width;\n\tif (left < margin) left = margin;\n\tif (left + popRect.width > viewportW - margin) left = viewportW - margin - popRect.width;\n\tpopover.style.top = `${top}px`;\n\tpopover.style.left = `${left}px`;\n\tpopover.dataset.arrow = rect.right - left > popRect.width / 2 ? \"right\" : \"left\";\n\n\tconst textarea = popover.querySelector(\"#review-popover-text\");\n\tconst save = () => {\n\t\tconst value = textarea.value.trim();\n\t\toptions.onSave(value);\n\t\tclosePopover();\n\t};\n\tconst closePopover = () => {\n\t\tpopover.remove();\n\t\tdocument.removeEventListener(\"mousedown\", onOutside, true);\n\t\tdocument.removeEventListener(\"keydown\", onKey, true);\n\t\tif (activePopover && activePopover.element === popover) activePopover = null;\n\t};\n\tconst onOutside = (event) => {\n\t\tif (popover.contains(event.target) || trigger.contains(event.target)) return;\n\t\tclosePopover();\n\t};\n\tconst onKey = (event) => {\n\t\tif (event.key === \"Escape\") {\n\t\t\tevent.preventDefault();\n\t\t\tclosePopover();\n\t\t\ttrigger.focus?.();\n\t\t} else if (event.key === \"Enter\" && (event.metaKey || event.ctrlKey)) {\n\t\t\tevent.preventDefault();\n\t\t\tsave();\n\t\t}\n\t};\n\tpopover.querySelector(\"#review-popover-cancel\").addEventListener(\"click\", closePopover);\n\tpopover.querySelector(\"#review-popover-save\").addEventListener(\"click\", save);\n\tdocument.addEventListener(\"mousedown\", onOutside, true);\n\tdocument.addEventListener(\"keydown\", onKey, true);\n\n\tactivePopover = { trigger, element: popover, dispose: closePopover };\n\trequestAnimationFrame(() => textarea.focus());\n}\n\nfunction showOverallCommentPopover() {\n\tshowTextPopover(overallCommentButton, {\n\t\ttitle: \"Overall review note\",\n\t\tdescription: \"Prepended to the generated prompt above inline comments.\",\n\t\tinitialValue: state.overallComment,\n\t\tplaceholder: \"High-level notes for this review...\",\n\t\tsaveLabel: \"Save note\",\n\t\tonSave: (value) => {\n\t\t\tstate.overallComment = value;\n\t\t\trenderTree();\n\t\t},\n\t});\n}\n\nfunction showFileCommentPopover() {\n\tconst file = activeFile();\n\tif (!file) return;\n\tshowTextPopover(fileCommentButton, {\n\t\ttitle: `File comment — ${getScopeDisplayPath(file, state.currentScope)}`,\n\t\tdescription: `Applies to the whole file in ${scopeLabel(state.currentScope).toLowerCase()}.`,\n\t\tinitialValue: \"\",\n\t\tplaceholder: \"Comment on the whole file...\",\n\t\tsaveLabel: \"Add comment\",\n\t\tonSave: (value) => {\n\t\t\tif (!value) return;\n\t\t\tstate.comments.push(\n\t\t\t\tannotateCommentWithCommit({\n\t\t\t\t\tid: `${Date.now()}:${Math.random().toString(16).slice(2)}`,\n\t\t\t\t\tfileId: file.id,\n\t\t\t\t\tscope: state.currentScope,\n\t\t\t\t\tside: \"file\",\n\t\t\t\t\tstartLine: null,\n\t\t\t\t\tendLine: null,\n\t\t\t\t\tbody: value,\n\t\t\t\t}),\n\t\t\t);\n\t\t\tsubmitButton.disabled = false;\n\t\t\tupdateCommentsUI();\n\t\t},\n\t});\n}\n\nfunction layoutEditor() {\n\tif (!diffEditor) return;\n\tconst width = editorContainerEl.clientWidth;\n\tconst height = editorContainerEl.clientHeight;\n\tif (width <= 0 || height <= 0) return;\n\tdiffEditor.layout({ width, height });\n}\n\nfunction clearViewZones() {\n\tif (!diffEditor || activeViewZones.length === 0) return;\n\tconst original = diffEditor.getOriginalEditor();\n\tconst modified = diffEditor.getModifiedEditor();\n\toriginal.changeViewZones((accessor) => {\n\t\tfor (const zone of activeViewZones) if (zone.editor === original) accessor.removeZone(zone.id);\n\t});\n\tmodified.changeViewZones((accessor) => {\n\t\tfor (const zone of activeViewZones) if (zone.editor === modified) accessor.removeZone(zone.id);\n\t});\n\tactiveViewZones = [];\n}\n\nfunction renderCommentDOM(comment, onDelete) {\n\tconst container = document.createElement(\"div\");\n\tcontainer.className = \"view-zone-container\";\n\tconst title =\n\t\tcomment.side === \"file\"\n\t\t\t? `File comment • ${scopeLabel(comment.scope)}`\n\t\t\t: `${comment.side === \"original\" ? \"Original\" : \"Modified\"} line ${comment.startLine} • ${scopeLabel(comment.scope)}`;\n\n\tcontainer.innerHTML = `\n    <div class=\"mb-2 flex items-center justify-between gap-3\">\n      <div class=\"text-xs font-semibold text-review-text\">${escapeHtml(title)}</div>\n      <button data-action=\"delete\" class=\"cursor-pointer rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-review-muted hover:bg-red-500/10 hover:text-red-400\">Delete</button>\n    </div>\n    <textarea data-comment-id=\"${escapeHtml(comment.id)}\" class=\"scrollbar-thin min-h-[76px] w-full resize-y rounded-md border border-review-border bg-[#010409] px-3 py-2 text-sm text-review-text outline-none focus:border-review-accent focus:ring-1 focus:ring-review-accent\" placeholder=\"Leave a comment\"></textarea>\n  `;\n\tconst textarea = container.querySelector(\"textarea\");\n\ttextarea.value = comment.body || \"\";\n\ttextarea.addEventListener(\"input\", () => {\n\t\tcomment.body = textarea.value;\n\t});\n\tcontainer.querySelector(\"[data-action='delete']\").addEventListener(\"click\", onDelete);\n\tif (!comment.body) setTimeout(() => textarea.focus(), 50);\n\treturn container;\n}\n\nfunction canCommentOnSide(file, side) {\n\tif (!file || file.kind !== \"text\") return false;\n\tconst comparison = activeComparison();\n\tif (side === \"original\") {\n\t\treturn comparison?.hasOriginal ?? false;\n\t}\n\treturn comparison != null ? comparison.hasModified : file.hasWorkingTreeFile;\n}\n\nfunction isActiveFileReady() {\n\tconst file = activeFile();\n\tif (!file) return false;\n\tconst requestState = getRequestState(file.id, state.currentScope);\n\treturn requestState.contents != null && requestState.error == null;\n}\n\nfunction syncViewZones() {\n\tclearViewZones();\n\tif (!diffEditor || !isActiveFileReady()) return;\n\tconst file = activeFile();\n\tif (!file) return;\n\n\tconst originalEditor = diffEditor.getOriginalEditor();\n\tconst modifiedEditor = diffEditor.getModifiedEditor();\n\tconst inlineComments = state.comments.filter(\n\t\t(comment) => comment.fileId === file.id && comment.scope === state.currentScope && comment.side !== \"file\",\n\t);\n\n\tinlineComments.forEach((item) => {\n\t\tconst editor = item.side === \"original\" ? originalEditor : modifiedEditor;\n\t\tconst domNode = renderCommentDOM(item, () => {\n\t\t\tstate.comments = state.comments.filter((comment) => comment.id !== item.id);\n\t\t\tupdateCommentsUI();\n\t\t});\n\n\t\teditor.changeViewZones((accessor) => {\n\t\t\tconst lineCount = typeof item.body === \"string\" && item.body.length > 0 ? item.body.split(\"\\n\").length : 1;\n\t\t\tconst id = accessor.addZone({\n\t\t\t\tafterLineNumber: item.startLine,\n\t\t\t\theightInPx: Math.max(150, lineCount * 22 + 86),\n\t\t\t\tdomNode,\n\t\t\t});\n\t\t\tactiveViewZones.push({ id, editor });\n\t\t});\n\t});\n}\n\nfunction updateDecorations() {\n\tif (!diffEditor || !monacoApi) return;\n\tconst file = activeFile();\n\tconst comments = file\n\t\t? state.comments.filter(\n\t\t\t\t(comment) => comment.fileId === file.id && comment.scope === state.currentScope && comment.side !== \"file\",\n\t\t\t)\n\t\t: [];\n\tconst originalRanges = [];\n\tconst modifiedRanges = [];\n\n\tfor (const comment of comments) {\n\t\tconst range = {\n\t\t\trange: new monacoApi.Range(comment.startLine, 1, comment.startLine, 1),\n\t\t\toptions: {\n\t\t\t\tisWholeLine: true,\n\t\t\t\tclassName: comment.side === \"original\" ? \"review-comment-line-original\" : \"review-comment-line-modified\",\n\t\t\t\tglyphMarginClassName:\n\t\t\t\t\tcomment.side === \"original\" ? \"review-comment-glyph-original\" : \"review-comment-glyph-modified\",\n\t\t\t},\n\t\t};\n\t\tif (comment.side === \"original\") originalRanges.push(range);\n\t\telse modifiedRanges.push(range);\n\t}\n\n\toriginalDecorations = diffEditor.getOriginalEditor().deltaDecorations(originalDecorations, originalRanges);\n\tmodifiedDecorations = diffEditor.getModifiedEditor().deltaDecorations(modifiedDecorations, modifiedRanges);\n}\n\nfunction renderFileComments() {\n\tfileCommentsContainer.innerHTML = \"\";\n\tconst file = activeFile();\n\tif (!file) {\n\t\tfileCommentsContainer.className = \"hidden overflow-hidden px-0 py-0\";\n\t\treturn;\n\t}\n\n\tconst fileComments = state.comments.filter(\n\t\t(comment) => comment.fileId === file.id && comment.scope === state.currentScope && comment.side === \"file\",\n\t);\n\n\tif (fileComments.length === 0) {\n\t\tfileCommentsContainer.className = \"hidden overflow-hidden px-0 py-0\";\n\t\treturn;\n\t}\n\n\tfileCommentsContainer.className = \"border-b border-review-border bg-[#0d1117] px-4 py-4 space-y-4\";\n\tfileComments.forEach((comment) => {\n\t\tconst dom = renderCommentDOM(comment, () => {\n\t\t\tstate.comments = state.comments.filter((item) => item.id !== comment.id);\n\t\t\tupdateCommentsUI();\n\t\t});\n\t\tdom.className = \"rounded-lg border border-review-border bg-review-panel p-4\";\n\t\tfileCommentsContainer.appendChild(dom);\n\t});\n}\n\nfunction getPlaceholderContents(file, scope) {\n\tconst path = getScopeDisplayPath(file, scope);\n\tconst requestState = getRequestState(file.id, scope);\n\tif (requestState.error) {\n\t\tconst body = `Failed to load ${path}\\n\\n${requestState.error}`;\n\t\treturn {\n\t\t\toriginalContent: body,\n\t\t\tmodifiedContent: body,\n\t\t\tkind: file.kind,\n\t\t\tmimeType: file.mimeType,\n\t\t\toriginalExists: false,\n\t\t\tmodifiedExists: false,\n\t\t\toriginalPreviewUrl: null,\n\t\t\tmodifiedPreviewUrl: null,\n\t\t};\n\t}\n\tconst body = `Loading ${path}...`;\n\treturn {\n\t\toriginalContent: body,\n\t\tmodifiedContent: body,\n\t\tkind: file.kind,\n\t\tmimeType: file.mimeType,\n\t\toriginalExists: false,\n\t\tmodifiedExists: false,\n\t\toriginalPreviewUrl: null,\n\t\tmodifiedPreviewUrl: null,\n\t};\n}\n\nfunction getMountedContents(file, scope = state.currentScope) {\n\treturn getRequestState(file.id, scope).contents || getPlaceholderContents(file, scope);\n}\n\nfunction renderFilePathLabel(path) {\n\tif (!path) {\n\t\tcurrentFileLabelEl.textContent = \"\";\n\t\treturn;\n\t}\n\tconst idx = path.lastIndexOf(\"/\");\n\tif (idx < 0) {\n\t\tcurrentFileLabelEl.textContent = path;\n\t\treturn;\n\t}\n\tconst dir = path.slice(0, idx + 1);\n\tconst base = path.slice(idx + 1);\n\tcurrentFileLabelEl.innerHTML = `<span class=\"gh-file-path-dir\">${escapeHtml(dir)}</span>${escapeHtml(base)}`;\n}\n\nfunction updateFileHeaderMeta(file) {\n\tif (!file) {\n\t\tfileStatusBadgeEl.style.display = \"none\";\n\t\tfileDiffStatsEl.style.display = \"none\";\n\t\treturn;\n\t}\n\tconst status = getActiveStatus(file);\n\tif (status) {\n\t\tfileStatusBadgeEl.style.display = \"inline-flex\";\n\t\tfileStatusBadgeEl.className = statusBadgeClass(status);\n\t\tfileStatusBadgeEl.textContent = statusCode(status);\n\t\tfileStatusBadgeEl.title = statusLabel(status);\n\t} else {\n\t\tfileStatusBadgeEl.style.display = \"none\";\n\t}\n\tif (file.kind !== \"text\") {\n\t\tfileDiffStatsEl.style.display = \"none\";\n\t\treturn;\n\t}\n\tconst contents = getRequestState(file.id, state.currentScope).contents;\n\tif (!contents || !activeFileShowsDiff()) {\n\t\tfileDiffStatsEl.style.display = \"none\";\n\t\treturn;\n\t}\n\tconst originalLines = contents.originalContent ? contents.originalContent.split(\"\\n\").length : 0;\n\tconst modifiedLines = contents.modifiedContent ? contents.modifiedContent.split(\"\\n\").length : 0;\n\t// Cheap estimate — we don't compute a full diff; the counts are naive line\n\t// deltas, which is enough for the GitHub-style badge.\n\tconst added = Math.max(0, modifiedLines - originalLines);\n\tconst removed = Math.max(0, originalLines - modifiedLines);\n\tif (added === 0 && removed === 0) {\n\t\tfileDiffStatsEl.style.display = \"none\";\n\t\treturn;\n\t}\n\tfileDiffStatsEl.style.display = \"inline-flex\";\n\tfileDiffStatsEl.innerHTML = `${added > 0 ? `<span class=\"gh-diff-stats-plus\">+${added}</span>` : \"\"}${removed > 0 ? `<span class=\"gh-diff-stats-minus\">−${removed}</span>` : \"\"}`;\n}\n\n// Hide the diff editor while Monaco is computing the diff, then reveal once\n// `onDidUpdateDiff` fires AND Monaco has painted the folded layout. Monaco paints\n// models asynchronously relative to diff computation — before the diff is ready\n// `hideUnchangedRegions` has nothing to fold, so the first frame always shows the\n// full file and only collapses on the next tick. That's the layout shift.\nfunction cancelPendingReveal() {\n\tif (!pendingDiffReveal) return;\n\ttry {\n\t\tpendingDiffReveal.dispose?.dispose();\n\t} catch {}\n\tclearTimeout(pendingDiffReveal.timeoutId);\n\tpendingDiffReveal = null;\n}\n\nfunction hideEditorForMount() {\n\t// Paint an opaque cover OVER Monaco (not on the container itself). This keeps\n\t// Monaco fully visible to the browser's layout engine so it renders, computes\n\t// its diff, inserts hide-unchanged view zones and paints the final folded\n\t// geometry at normal speed. Hiding the container via opacity:0 can make WebKit\n\t// skip paints/compositing for Monaco's nested absolute children, which in turn\n\t// makes `onDidUpdateDiff` + RAF reveal land while the fold is still settling.\n\tif (editorCoverEl) editorCoverEl.dataset.active = \"true\";\n}\n\nfunction armDiffRevealListener(onSettled) {\n\t// Attach listener BEFORE setModel to avoid missing a synchronously-fired\n\t// onDidUpdateDiff event (Monaco can compute diffs synchronously for small files).\n\tcancelPendingReveal();\n\tif (!diffEditor || typeof diffEditor.onDidUpdateDiff !== \"function\") {\n\t\tpendingDiffReveal = { dispose: null, timeoutId: setTimeout(onSettled, 0) };\n\t\treturn;\n\t}\n\tlet fired = false;\n\tconst settleOnce = () => {\n\t\tif (fired) return;\n\t\tfired = true;\n\t\tonSettled();\n\t};\n\tconst dispose = diffEditor.onDidUpdateDiff(() => {\n\t\t// onDidUpdateDiff only signals that diff DATA is ready. Monaco still needs\n\t\t// follow-up frames to insert hide-unchanged view zones and repaint the\n\t\t// folded geometry. Wait RAF → force layout → RAF → small setTimeout so the\n\t\t// paint pipeline is guaranteed to have flushed before we drop the cover.\n\t\trequestAnimationFrame(() => {\n\t\t\ttry {\n\t\t\t\tlayoutEditor();\n\t\t\t} catch {}\n\t\t\trequestAnimationFrame(() => {\n\t\t\t\tsetTimeout(settleOnce, 40);\n\t\t\t});\n\t\t});\n\t});\n\t// Safety net: force-reveal after 600ms so the UI never stays hidden on edge\n\t// cases where onDidUpdateDiff doesn't fire (identical models, Monaco quirks).\n\tconst timeoutId = setTimeout(settleOnce, 600);\n\tpendingDiffReveal = { dispose: { dispose: () => dispose.dispose() }, timeoutId };\n}\n\nfunction revealEditorNow() {\n\tif (editorCoverEl) editorCoverEl.dataset.active = \"false\";\n}\n\nfunction mountFile(options = {}) {\n\tif (!diffEditor || !monacoApi) return;\n\tconst file = activeFile();\n\tif (!file) {\n\t\thideBinaryPreview();\n\t\tcurrentFileLabelEl.textContent = \"No file selected\";\n\t\tupdateFileHeaderMeta(null);\n\t\tclearViewZones();\n\t\tif (originalModel) originalModel.dispose();\n\t\tif (modifiedModel) modifiedModel.dispose();\n\t\toriginalModel = monacoApi.editor.createModel(\"\", \"plaintext\");\n\t\tmodifiedModel = monacoApi.editor.createModel(\"\", \"plaintext\");\n\t\t// Apply options BEFORE setModel so Monaco renders the first frame with the\n\t\t// correct hideUnchangedRegions / renderSideBySide / added-only state.\n\t\tapplyEditorOptions();\n\t\thideEditorForMount();\n\t\tarmDiffRevealListener(() => {\n\t\t\tcancelPendingReveal();\n\t\t\trevealEditorNow();\n\t\t});\n\t\tdiffEditor.setModel({ original: originalModel, modified: modifiedModel });\n\t\tupdateDecorations();\n\t\trenderFileComments();\n\t\trequestAnimationFrame(layoutEditor);\n\t\treturn;\n\t}\n\n\tensureFileLoaded(file.id, state.currentScope);\n\n\tconst preserveScroll = options.preserveScroll === true;\n\tconst scrollState = preserveScroll ? captureScrollState() : null;\n\tconst language = inferLanguage(getScopeFilePath(file) || file.path);\n\tconst contents = getMountedContents(file, state.currentScope);\n\n\tclearViewZones();\n\trenderFilePathLabel(getScopeDisplayPath(file, state.currentScope));\n\tupdateFileHeaderMeta(file);\n\n\tif (file.kind !== \"text\") {\n\t\tcancelPendingReveal();\n\t\trevealEditorNow();\n\t\trenderBinaryPreview(file, contents);\n\t\trenderFileComments();\n\t\trequestAnimationFrame(layoutEditor);\n\t\treturn;\n\t}\n\n\thideBinaryPreview();\n\tif (originalModel) originalModel.dispose();\n\tif (modifiedModel) modifiedModel.dispose();\n\n\tconst originalText = activeFileIsAddedOnly() ? contents.modifiedContent : contents.originalContent;\n\toriginalModel = monacoApi.editor.createModel(originalText, language);\n\tmodifiedModel = monacoApi.editor.createModel(contents.modifiedContent, language);\n\n\t// Apply options BEFORE setModel. Otherwise Monaco first renders the new diff\n\t// using the PREVIOUS file's options (e.g. hideUnchangedRegions off because the\n\t// last file was added-only, or a stale renderSideBySide value) and only collapses\n\t// once updateOptions runs a frame later — causing a visible layout shift.\n\tapplyEditorOptions();\n\thideEditorForMount();\n\t// Arm the reveal listener BEFORE setModel so a synchronously-fired\n\t// onDidUpdateDiff (possible for small files) can't be missed.\n\tarmDiffRevealListener(() => {\n\t\tcancelPendingReveal();\n\t\trevealEditorNow();\n\t});\n\tdiffEditor.setModel({ original: originalModel, modified: modifiedModel });\n\tsyncViewZones();\n\tupdateDecorations();\n\trenderFileComments();\n\trequestAnimationFrame(() => {\n\t\tlayoutEditor();\n\t\tif (options.restoreFileScroll) restoreFileScrollPosition();\n\t\tif (options.preserveScroll) restoreScrollState(scrollState);\n\t\tsetTimeout(() => {\n\t\t\tlayoutEditor();\n\t\t\tif (options.restoreFileScroll) restoreFileScrollPosition();\n\t\t\tif (options.preserveScroll) restoreScrollState(scrollState);\n\t\t}, 50);\n\t});\n}\n\nfunction syncCommentBodiesFromDOM() {\n\tconst textareas = document.querySelectorAll(\"textarea[data-comment-id]\");\n\ttextareas.forEach((textarea) => {\n\t\tconst commentId = textarea.getAttribute(\"data-comment-id\");\n\t\tconst comment = state.comments.find((item) => item.id === commentId);\n\t\tif (comment) comment.body = textarea.value;\n\t});\n}\n\nfunction buildSubmitPayload() {\n\tsyncCommentBodiesFromDOM();\n\treturn {\n\t\ttype: \"submit\",\n\t\toverallComment: state.overallComment.trim(),\n\t\tcomments: state.comments\n\t\t\t.map((comment) => ({ ...comment, body: comment.body.trim() }))\n\t\t\t.filter((comment) => comment.body.length > 0),\n\t};\n}\n\nfunction hasSubmitPayloadContent(payload) {\n\treturn payload.overallComment.length > 0 || payload.comments.length > 0;\n}\n\nfunction submitDraftOnClose() {\n\tif (suppressAutoSubmitOnClose) return;\n\tconst payload = buildSubmitPayload();\n\tif (!hasSubmitPayloadContent(payload)) return;\n\tsuppressAutoSubmitOnClose = true;\n\twindow.glimpse?.send?.(payload);\n}\n\nfunction updateCommentsUI() {\n\trenderTree();\n\tsyncViewZones();\n\tupdateDecorations();\n\trenderFileComments();\n}\n\nfunction renderAll(options = {}) {\n\trenderTree();\n\trenderCommitList();\n\tsubmitButton.disabled = false;\n\tif (diffEditor && monacoApi) {\n\t\tmountFile(options);\n\t\trequestAnimationFrame(() => {\n\t\t\tlayoutEditor();\n\t\t\tsetTimeout(layoutEditor, 50);\n\t\t});\n\t} else {\n\t\trenderFileComments();\n\t}\n}\n\nfunction createGlyphHoverActions(editor, side) {\n\tlet hoverDecoration = [];\n\n\tfunction openDraftAtLine(line) {\n\t\tconst file = activeFile();\n\t\tif (!file || !canCommentOnSide(file, side) || !isActiveFileReady()) return;\n\t\tstate.comments.push(\n\t\t\tannotateCommentWithCommit({\n\t\t\t\tid: `${Date.now()}:${Math.random().toString(16).slice(2)}`,\n\t\t\t\tfileId: file.id,\n\t\t\t\tscope: state.currentScope,\n\t\t\t\tside,\n\t\t\t\tstartLine: line,\n\t\t\t\tendLine: line,\n\t\t\t\tbody: \"\",\n\t\t\t}),\n\t\t);\n\t\tupdateCommentsUI();\n\t\teditor.revealLineInCenter(line);\n\t}\n\n\teditor.onMouseMove((event) => {\n\t\tconst file = activeFile();\n\t\tif (!file || !canCommentOnSide(file, side) || !isActiveFileReady()) {\n\t\t\thoverDecoration = editor.deltaDecorations(hoverDecoration, []);\n\t\t\treturn;\n\t\t}\n\n\t\tconst target = event.target;\n\t\tif (\n\t\t\ttarget.type === monacoApi.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||\n\t\t\ttarget.type === monacoApi.editor.MouseTargetType.GUTTER_LINE_NUMBERS\n\t\t) {\n\t\t\tconst line = target.position?.lineNumber;\n\t\t\tif (!line) return;\n\t\t\thoverDecoration = editor.deltaDecorations(hoverDecoration, [\n\t\t\t\t{\n\t\t\t\t\trange: new monacoApi.Range(line, 1, line, 1),\n\t\t\t\t\toptions: { glyphMarginClassName: \"review-glyph-plus\" },\n\t\t\t\t},\n\t\t\t]);\n\t\t} else {\n\t\t\thoverDecoration = editor.deltaDecorations(hoverDecoration, []);\n\t\t}\n\t});\n\n\teditor.onMouseLeave(() => {\n\t\thoverDecoration = editor.deltaDecorations(hoverDecoration, []);\n\t});\n\n\teditor.onMouseDown((event) => {\n\t\tconst file = activeFile();\n\t\tif (!file || !canCommentOnSide(file, side) || !isActiveFileReady()) return;\n\n\t\tconst target = event.target;\n\t\tif (\n\t\t\ttarget.type === monacoApi.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||\n\t\t\ttarget.type === monacoApi.editor.MouseTargetType.GUTTER_LINE_NUMBERS\n\t\t) {\n\t\t\tconst line = target.position?.lineNumber;\n\t\t\tif (!line) return;\n\t\t\topenDraftAtLine(line);\n\t\t}\n\t});\n}\n\nwindow.__reviewReceive = (message) => {\n\tif (!message || typeof message !== \"object\") return;\n\n\tif (message.type === \"review-data\") {\n\t\tif (state.reviewDataRequestId !== message.requestId) return;\n\t\treviewData.files = Array.isArray(message.files) ? message.files : [];\n\t\treviewData.commits = Array.isArray(message.commits) ? message.commits : [];\n\t\treviewData.branchBaseRef = message.branchBaseRef ?? null;\n\t\treviewData.branchMergeBaseSha = message.branchMergeBaseSha ?? null;\n\t\treviewData.repositoryHasHead = message.repositoryHasHead === true;\n\t\tstate.reviewDataRequestId = null;\n\t\tif (!reviewData.commits.some((commit) => commit.sha === state.selectedCommitSha)) {\n\t\t\tstate.selectedCommitSha = reviewData.commits[0]?.sha ?? null;\n\t\t}\n\t\trenderCommitList();\n\t\trenderAll({ restoreFileScroll: false });\n\t\tif (state.currentScope === \"commits\" && state.selectedCommitSha) {\n\t\t\tensureCommitFilesLoaded(state.selectedCommitSha, {\n\t\t\t\tforceRefresh: isWorkingTreeCommit(state.selectedCommitSha),\n\t\t\t});\n\t\t}\n\t\treturn;\n\t}\n\n\tif (message.type === \"commit-data\") {\n\t\tif (state.commitRequestIds[message.sha] !== message.requestId) return;\n\t\tstate.commitFilesBySha[message.sha] = Array.isArray(message.files) ? message.files : [];\n\t\tdelete state.commitErrors[message.sha];\n\t\tdelete state.commitRequestIds[message.sha];\n\t\tif (isWorkingTreeCommit(message.sha)) {\n\t\t\tstate.lastWorkingTreeLoadAt = Date.now();\n\t\t}\n\t\trenderCommitList();\n\t\tif (state.currentScope === \"commits\" && state.selectedCommitSha === message.sha) {\n\t\t\tensureActiveFileForScope();\n\t\t\trenderAll({ restoreFileScroll: false });\n\t\t\tconst file = activeFile();\n\t\t\tif (file) {\n\t\t\t\tensureFileLoaded(file.id, state.currentScope, message.sha, {\n\t\t\t\t\tforceRefresh: isWorkingTreeCommit(message.sha),\n\t\t\t\t});\n\t\t\t}\n\t\t}\n\t\treturn;\n\t}\n\n\tif (message.type === \"commit-error\") {\n\t\tif (state.commitRequestIds[message.sha] !== message.requestId) return;\n\t\tstate.commitErrors[message.sha] = message.message || \"Unknown error\";\n\t\tdelete state.commitRequestIds[message.sha];\n\t\trenderCommitList();\n\t\tupdateWorkingTreeRefreshButton();\n\t\treturn;\n\t}\n\n\tconst key = cacheKey(message.scope, message.fileId, message.commitSha ?? null);\n\n\tif (message.type === \"file-data\") {\n\t\tif (state.pendingRequestIds[key] !== message.requestId) return;\n\t\tstate.fileContents[key] = {\n\t\t\toriginalContent: message.originalContent,\n\t\t\tmodifiedContent: message.modifiedContent,\n\t\t\tkind: message.kind,\n\t\t\tmimeType: message.mimeType,\n\t\t\toriginalExists: message.originalExists,\n\t\t\tmodifiedExists: message.modifiedExists,\n\t\t\toriginalPreviewUrl: message.originalPreviewUrl,\n\t\t\tmodifiedPreviewUrl: message.modifiedPreviewUrl,\n\t\t};\n\t\tdelete state.fileErrors[key];\n\t\tdelete state.pendingRequestIds[key];\n\t\trenderTree();\n\t\tif (state.activeFileId === message.fileId && state.currentScope === message.scope) {\n\t\t\tmountFile({ restoreFileScroll: true });\n\t\t}\n\t\treturn;\n\t}\n\n\tif (message.type === \"file-error\") {\n\t\tif (state.pendingRequestIds[key] !== message.requestId) return;\n\t\tstate.fileErrors[key] = message.message || \"Unknown error\";\n\t\tdelete state.pendingRequestIds[key];\n\t\trenderTree();\n\t\tif (state.activeFileId === message.fileId && state.currentScope === message.scope) {\n\t\t\tmountFile({ preserveScroll: false });\n\t\t}\n\t}\n};\n\nfunction setupMonaco() {\n\twindow.require.config({\n\t\tpaths: {\n\t\t\tvs: \"https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs\",\n\t\t},\n\t});\n\n\twindow.require([\"vs/editor/editor.main\"], () => {\n\t\tmonacoApi = window.monaco;\n\n\t\t// GitHub-style diff colors.\n\t\tmonacoApi.editor.defineTheme(\"review-dark\", {\n\t\t\tbase: \"vs-dark\",\n\t\t\tinherit: true,\n\t\t\trules: [],\n\t\t\tcolors: {\n\t\t\t\t\"editor.background\": \"#0d1117\",\n\t\t\t\t\"editor.foreground\": \"#f0f6fc\",\n\t\t\t\t\"editorLineNumber.foreground\": \"#6e7681\",\n\t\t\t\t\"editorLineNumber.activeForeground\": \"#c9d1d9\",\n\t\t\t\t\"editorGutter.background\": \"#0d1117\",\n\t\t\t\t\"diffEditor.insertedLineBackground\": \"#1c7c3c33\",\n\t\t\t\t\"diffEditor.insertedTextBackground\": \"#2ea04366\",\n\t\t\t\t\"diffEditor.removedLineBackground\": \"#b62a2233\",\n\t\t\t\t\"diffEditor.removedTextBackground\": \"#f8514966\",\n\t\t\t\t\"diffEditor.border\": \"#30363d\",\n\t\t\t\t\"editorOverviewRuler.border\": \"#30363d\",\n\t\t\t},\n\t\t});\n\t\tmonacoApi.editor.setTheme(\"review-dark\");\n\n\t\tdiffEditor = monacoApi.editor.createDiffEditor(editorContainerEl, {\n\t\t\tautomaticLayout: true,\n\t\t\trenderSideBySide: activeFileShowsDiff(),\n\t\t\treadOnly: true,\n\t\t\toriginalEditable: false,\n\t\t\t// GitHub-style review: no minimap and no diff overview ruler on the side.\n\t\t\t// Those were the panels that visibly flashed during remount because Monaco\n\t\t\t// repaints them as hide-unchanged view zones settle.\n\t\t\tminimap: { enabled: false },\n\t\t\trenderOverviewRuler: false,\n\t\t\toverviewRulerLanes: 0,\n\t\t\tdiffWordWrap: \"on\",\n\t\t\tscrollBeyondLastLine: false,\n\t\t\tlineNumbersMinChars: 4,\n\t\t\tglyphMargin: true,\n\t\t\tfolding: true,\n\t\t\tlineDecorationsWidth: 10,\n\t\t\toverviewRulerBorder: false,\n\t\t\twordWrap: \"on\",\n\t\t});\n\n\t\tcreateGlyphHoverActions(diffEditor.getOriginalEditor(), \"original\");\n\t\tcreateGlyphHoverActions(diffEditor.getModifiedEditor(), \"modified\");\n\n\t\tif (typeof ResizeObserver !== \"undefined\") {\n\t\t\teditorResizeObserver = new ResizeObserver(() => {\n\t\t\t\tlayoutEditor();\n\t\t\t});\n\t\t\teditorResizeObserver.observe(editorContainerEl);\n\t\t}\n\n\t\trequestAnimationFrame(() => {\n\t\t\tlayoutEditor();\n\t\t\tsetTimeout(layoutEditor, 50);\n\t\t\tsetTimeout(layoutEditor, 150);\n\t\t});\n\n\t\tmountFile();\n\t});\n}\n\nfunction switchScope(scope) {\n\tconst hasScopeFiles = {\n\t\tbranch: reviewData.files.some((file) => file.inGitDiff),\n\t\tcommits: reviewData.commits.length > 0,\n\t\tall: reviewData.files.some((file) => file.hasWorkingTreeFile),\n\t};\n\tif (!hasScopeFiles[scope] || state.currentScope === scope) return;\n\tsaveCurrentScrollPosition();\n\tstate.currentScope = scope;\n\tstate.activeFileId = null;\n\tif (scope === \"commits\") {\n\t\tif (!state.selectedCommitSha && reviewData.commits[0]) {\n\t\t\tstate.selectedCommitSha = reviewData.commits[0].sha;\n\t\t}\n\t\tif (state.selectedCommitSha) ensureCommitFilesLoaded(state.selectedCommitSha);\n\t}\n\trenderAll({ restoreFileScroll: true });\n\tconst file = activeFile();\n\tif (file) ensureFileLoaded(file.id, state.currentScope);\n}\n\nwindow.addEventListener(\"beforeunload\", submitDraftOnClose);\nwindow.addEventListener(\"pagehide\", submitDraftOnClose);\n\nsubmitButton.addEventListener(\"click\", () => {\n\tconst payload = buildSubmitPayload();\n\tsuppressAutoSubmitOnClose = true;\n\twindow.glimpse.send(payload);\n\twindow.glimpse.close();\n});\n\ncancelButton.addEventListener(\"click\", () => {\n\tsuppressAutoSubmitOnClose = true;\n\twindow.glimpse.send({ type: \"cancel\" });\n\twindow.glimpse.close();\n});\n\noverallCommentButton.addEventListener(\"click\", () => {\n\tshowOverallCommentPopover();\n});\n\nfileCommentButton.addEventListener(\"click\", () => {\n\tshowFileCommentPopover();\n});\n\nif (refreshWorkingTreeButton) {\n\trefreshWorkingTreeButton.addEventListener(\"click\", () => {\n\t\trefreshCommitsView();\n\t});\n}\n\ntoggleUnchangedButton.addEventListener(\"click\", () => {\n\tstate.hideUnchanged = !state.hideUnchanged;\n\tapplyEditorOptions();\n\tupdateToggleButtons();\n\trequestAnimationFrame(layoutEditor);\n});\n\ntoggleWrapButton.addEventListener(\"click\", () => {\n\tstate.wrapLines = !state.wrapLines;\n\tapplyEditorOptions();\n\tupdateToggleButtons();\n\trequestAnimationFrame(() => {\n\t\tlayoutEditor();\n\t\tsetTimeout(layoutEditor, 50);\n\t});\n});\n\ntoggleReviewedButton.addEventListener(\"click\", () => {\n\tconst file = activeFile();\n\tif (!file) return;\n\tstate.reviewedFiles[file.id] = !isFileReviewed(file.id);\n\trenderTree();\n});\n\nscopeBranchButton.addEventListener(\"click\", () => {\n\tswitchScope(\"branch\");\n});\n\nscopeCommitsButton.addEventListener(\"click\", () => {\n\tswitchScope(\"commits\");\n});\n\nscopeAllButton.addEventListener(\"click\", () => {\n\tswitchScope(\"all\");\n});\n\ntoggleSidebarButton.addEventListener(\"click\", () => {\n\tstate.sidebarCollapsed = !state.sidebarCollapsed;\n\tupdateSidebarLayout();\n\trequestAnimationFrame(() => {\n\t\tlayoutEditor();\n\t\tsetTimeout(layoutEditor, 50);\n\t});\n});\n\nconst fileCollapseButton = document.getElementById(\"file-collapse-button\");\nif (fileCollapseButton) {\n\tfileCollapseButton.addEventListener(\"click\", () => {\n\t\tconst collapsed = editorContainerEl.style.display === \"none\";\n\t\teditorContainerEl.style.display = collapsed ? \"\" : \"none\";\n\t\tfileCollapseButton.dataset.active = collapsed ? \"true\" : \"false\";\n\t\tfileCollapseButton.title = collapsed ? \"Collapse file\" : \"Expand file\";\n\t\tconst svg = fileCollapseButton.querySelector(\"svg path\");\n\t\tif (svg) {\n\t\t\tsvg.setAttribute(\n\t\t\t\t\"d\",\n\t\t\t\tcollapsed\n\t\t\t\t\t? \"M12.78 6.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 7.28a.749.749 0 1 1 1.06-1.06L8 9.939l3.72-3.719a.749.749 0 0 1 1.06 0Z\"\n\t\t\t\t\t: \"M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z\",\n\t\t\t);\n\t\t}\n\t\trequestAnimationFrame(() => {\n\t\t\tlayoutEditor();\n\t\t\tsetTimeout(layoutEditor, 50);\n\t\t});\n\t});\n}\n\nsidebarSearchInputEl.addEventListener(\"input\", () => {\n\tstate.fileFilter = sidebarSearchInputEl.value;\n\trenderTree();\n});\n\nsidebarSearchInputEl.addEventListener(\"keydown\", (event) => {\n\tif (event.key === \"Escape\") {\n\t\tsidebarSearchInputEl.value = \"\";\n\t\tstate.fileFilter = \"\";\n\t\trenderTree();\n\t}\n});\n\nif (state.currentScope === \"commits\" && state.selectedCommitSha) {\n\tensureCommitFilesLoaded(state.selectedCommitSha);\n}\nensureActiveFileForScope();\nrenderTree();\nrenderCommitList();\nrenderFileComments();\nupdateSidebarLayout();\nsetupMonaco();\n";
function buildReviewHtml(data) {
  const payload = escapeForInlineScript(JSON.stringify(data));
  return templateHtml.replace('"__INLINE_DATA__"', payload).replace("__INLINE_JS__", appJs);
}

// node_modules/@ryan_nookpi/pi-extension-diff-review/index.ts
function isSubmitPayload(value) {
  return value.type === "submit";
}
function isCancelPayload(value) {
  return value.type === "cancel";
}
function isRequestFilePayload(value) {
  return value.type === "request-file";
}
function isRequestCommitPayload(value) {
  return value.type === "request-commit";
}
function isRequestReviewDataPayload(value) {
  return value.type === "request-review-data";
}
function escapeForInlineScript2(value) {
  return value.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
function hasReviewFeedback(payload) {
  return payload.overallComment.trim().length > 0 || payload.comments.some((comment) => comment.body.trim().length > 0);
}
function appendReviewPrompt(ctx, prompt2) {
  const prefix = ctx.ui.getEditorText().trim().length > 0 ? "\n\n" : "";
  ctx.ui.pasteToEditor(`${prefix}${prompt2}`);
}
function pi_extension_diff_review_default(pi) {
  let activeWindow = null;
  const suppressedWindows = /* @__PURE__ */ new WeakSet();
  function closeActiveWindow(options = {}) {
    if (activeWindow == null) return;
    const windowToClose = activeWindow;
    activeWindow = null;
    if (options.suppressResults) {
      suppressedWindows.add(windowToClose);
    }
    try {
      windowToClose.close();
    } catch {
    }
  }
  async function reviewRepository(ctx) {
    if (activeWindow != null) {
      ctx.ui.notify("A review window is already open.", "warning");
      return;
    }
    try {
      let reviewData = await getReviewWindowData(pi, ctx.cwd);
      const { repoRoot } = reviewData;
      if (reviewData.files.length === 0 && reviewData.commits.length === 0) {
        ctx.ui.notify("No reviewable files found.", "info");
        return;
      }
      const html = buildReviewHtml(reviewData);
      const window = await openQuietGlimpse(html, {
        width: 1680,
        height: 1020,
        title: "pi review"
      });
      activeWindow = window;
      const fileMap = new Map(reviewData.files.map((file) => [file.id, file]));
      const commitFileCache = /* @__PURE__ */ new Map();
      const contentCache = /* @__PURE__ */ new Map();
      const clearRefreshableCaches = () => {
        contentCache.clear();
        for (const sha of commitFileCache.keys()) {
          if (isWorkingTreeCommitSha(sha)) {
            commitFileCache.delete(sha);
          }
        }
      };
      const sendWindowMessage = (message) => {
        if (activeWindow !== window) return;
        const payload = escapeForInlineScript2(JSON.stringify(message));
        window.send(`window.__reviewReceive(${payload});`);
      };
      const loadCommitFiles = (sha) => {
        const cached2 = commitFileCache.get(sha);
        if (cached2 != null) return cached2;
        const pending = getCommitFiles(pi, repoRoot, sha);
        commitFileCache.set(sha, pending);
        pending.then((commitFiles) => {
          for (const cf of commitFiles) fileMap.set(cf.id, cf);
        }).catch(() => {
        });
        return pending;
      };
      const loadContents = (file, scope, commitSha) => {
        const cacheKey = `${scope}:${commitSha ?? ""}:${file.id}`;
        const cached2 = contentCache.get(cacheKey);
        if (cached2 != null) return cached2;
        const pending = loadReviewFileContents(pi, repoRoot, file, scope, commitSha, reviewData.branchMergeBaseSha);
        contentCache.set(cacheKey, pending);
        return pending;
      };
      const terminalMessagePromise = new Promise(
        (resolve2, reject) => {
          let settled = false;
          let closeTimer = null;
          const cleanup = () => {
            if (closeTimer != null) {
              clearTimeout(closeTimer);
              closeTimer = null;
            }
            window.removeListener("message", onMessage);
            window.removeListener("closed", onClosed);
            window.removeListener("error", onError);
            if (activeWindow === window) {
              activeWindow = null;
            }
          };
          const settle = (value) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve2(value);
          };
          const handleRequestFile = async (message) => {
            const file = fileMap.get(message.fileId);
            if (file == null) {
              sendWindowMessage({
                type: "file-error",
                requestId: message.requestId,
                fileId: message.fileId,
                scope: message.scope,
                commitSha: message.commitSha ?? null,
                message: "Unknown file requested."
              });
              return;
            }
            try {
              const contents = await loadContents(file, message.scope, message.commitSha ?? null);
              sendWindowMessage({
                type: "file-data",
                requestId: message.requestId,
                fileId: message.fileId,
                scope: message.scope,
                commitSha: message.commitSha ?? null,
                originalContent: contents.originalContent,
                modifiedContent: contents.modifiedContent,
                kind: contents.kind,
                mimeType: contents.mimeType,
                originalExists: contents.originalExists,
                modifiedExists: contents.modifiedExists,
                originalPreviewUrl: contents.originalPreviewUrl,
                modifiedPreviewUrl: contents.modifiedPreviewUrl
              });
            } catch (error) {
              const messageText = error instanceof Error ? error.message : String(error);
              sendWindowMessage({
                type: "file-error",
                requestId: message.requestId,
                fileId: message.fileId,
                scope: message.scope,
                commitSha: message.commitSha ?? null,
                message: messageText
              });
            }
          };
          const handleRequestCommit = async (message) => {
            try {
              const commitFiles = await loadCommitFiles(message.sha);
              sendWindowMessage({
                type: "commit-data",
                requestId: message.requestId,
                sha: message.sha,
                files: commitFiles
              });
            } catch (error) {
              const messageText = error instanceof Error ? error.message : String(error);
              sendWindowMessage({
                type: "commit-error",
                requestId: message.requestId,
                sha: message.sha,
                message: messageText
              });
            }
          };
          const handleRequestReviewData = async (message) => {
            clearRefreshableCaches();
            reviewData = await getReviewWindowData(pi, repoRoot);
            for (const file of reviewData.files) fileMap.set(file.id, file);
            sendWindowMessage({
              type: "review-data",
              requestId: message.requestId,
              files: reviewData.files,
              commits: reviewData.commits,
              branchBaseRef: reviewData.branchBaseRef,
              branchMergeBaseSha: reviewData.branchMergeBaseSha,
              repositoryHasHead: reviewData.repositoryHasHead
            });
          };
          const onMessage = (data) => {
            const message = data;
            if (isRequestFilePayload(message)) {
              void handleRequestFile(message);
              return;
            }
            if (isRequestCommitPayload(message)) {
              void handleRequestCommit(message);
              return;
            }
            if (isRequestReviewDataPayload(message)) {
              void handleRequestReviewData(message);
              return;
            }
            if (isSubmitPayload(message) || isCancelPayload(message)) {
              settle(message);
            }
          };
          const onClosed = () => {
            if (settled || closeTimer != null) return;
            closeTimer = setTimeout(() => {
              closeTimer = null;
              settle(null);
            }, 250);
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
        }
      );
      void (async () => {
        try {
          const message = await terminalMessagePromise;
          if (suppressedWindows.has(window)) return;
          if (message == null) return;
          if (message.type === "cancel") {
            ctx.ui.notify("Review cancelled.", "info");
            return;
          }
          if (!hasReviewFeedback(message)) return;
          const prompt2 = composeReviewPrompt([...fileMap.values()], message);
          appendReviewPrompt(ctx, prompt2);
          ctx.ui.notify("Appended review feedback to the editor.", "info");
        } catch (error) {
          if (suppressedWindows.has(window)) return;
          const message = error instanceof Error ? error.message : String(error);
          ctx.ui.notify(`Review failed: ${message}`, "error");
        }
      })();
      ctx.ui.notify("Opened native review window.", "info");
    } catch (error) {
      closeActiveWindow({ suppressResults: true });
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Review failed: ${message}`, "error");
    }
  }
  pi.registerCommand("diff-review", {
    description: "Open a native review window with branch, per-commit, and all-files scopes",
    handler: async (_args, ctx) => {
      await reviewRepository(ctx);
    }
  });
  pi.on("session_shutdown", async () => {
    closeActiveWindow({ suppressResults: true });
  });
}
export {
  pi_extension_diff_review_default as default
};
