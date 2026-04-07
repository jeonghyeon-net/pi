export { matchesAnyGlob, matchesAbsoluteGlobs } from "./core/globs.js";
export { expandImports, expandImportsWithTrace, parseFrontmatter } from "./core/instructions.js";
export { activateConditionalRules, applyUpdatedInput, extractTouchedPaths, toClaudeToolInput } from "./hooks/tools.js";
export { interpolateHeaders, urlAllowed } from "./hooks/run.js";
export { loadState } from "./state/collect.js";
export { collectSettings } from "./state/settings.js";
export { extractFileWatchBasenames, replaceDynamicWatchPaths } from "./runtime/watch-config.js";
export { classifyConfigSource, diffSnapshots } from "./runtime/watch-scan.js";
