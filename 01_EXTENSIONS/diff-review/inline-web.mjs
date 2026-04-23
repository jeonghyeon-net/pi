import { readFileSync, writeFileSync } from "node:fs";

const distFile = new URL("./dist/index.js", import.meta.url);
const webDir = new URL("./node_modules/@ryan_nookpi/pi-extension-diff-review/web/", import.meta.url);
const templateHtml = JSON.stringify(readFileSync(new URL("index.html", webDir), "utf8"));
const appJs = JSON.stringify(readFileSync(new URL("app.js", webDir), "utf8"));

const replacements = [
	[
		'import { spawn as spawn2 } from "node:child_process";',
		'import { spawn as spawn2, spawnSync as spawnSync2 } from "node:child_process";',
	],
	[
		'import { existsSync as existsSync3 } from "node:fs";',
		'import { chmodSync as chmodSync2, existsSync as existsSync3 } from "node:fs";',
	],
	[
		`async function getNativeHostInfo2() {
  const glimpseModule = await Promise.resolve().then(() => (init_glimpse(), glimpse_exports));
  return glimpseModule.getNativeHostInfo();
}`,
		`async function getNativeHostInfo2() {
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
}`,
	],
	[
		`async function openQuietGlimpse(html, options = {}) {
  const host = await getNativeHostInfo2();
  if (!existsSync3(host.path)) {
    const hint = host.buildHint ? \` \${host.buildHint}\` : "";
    throw new Error(\`Glimpse host not found at '\${host.path}'.\${hint}\`);
  }`,
		`async function openQuietGlimpse(html, options = {}) {
  const host = resolveFallbackHost2(await getNativeHostInfo2());
  if (!existsSync3(host.path) && !host.extraArgs?.length) {
    const hint = host.buildHint ? \` \${host.buildHint}\` : "";
    throw new Error(\`Glimpse host not found at '\${host.path}'.\${hint}\`);
  }`,
	],
	[
		`function buildReviewHtml(data) {
  const templateHtml = readFileSync2(join4(webDir, "index.html"), "utf8");
  const appJs = readFileSync2(join4(webDir, "app.js"), "utf8");
  const payload = escapeForInlineScript(JSON.stringify(data));
  return templateHtml.replace('"__INLINE_DATA__"', payload).replace("__INLINE_JS__", appJs);
}`,
		`var templateHtml = ${templateHtml};
var appJs = ${appJs};
function buildReviewHtml(data) {
  const payload = escapeForInlineScript(JSON.stringify(data));
  return templateHtml.replace('\"__INLINE_DATA__\"', payload).replace("__INLINE_JS__", appJs);
}`,
	],
];

let source = readFileSync(distFile, "utf8");
for (const [before, after] of replacements) {
	if (!source.includes(before)) throw new Error(`bundle patch not found: ${before.slice(0, 40)}`);
	source = source.replace(before, after);
}
writeFileSync(distFile, source);
