# MCP Extension Plan 9: Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire everything together in `src/index.ts` -- replace the stub with the real entry point that registers the proxy tool, command, flag, and lifecycle handlers. Run comprehensive verification to confirm the entire extension is complete and correct.

**Architecture:** `index.ts` is entry-only: every line in the function body starts with `pi.` (matches Go architecture test 13's `apiRe`). All logic lives in imported modules from Plans 1-8. The `pi` parameter appears inside `pi.method()` arguments, which is allowed because `apiRe` matches the line first and short-circuits further checks.

**Tech Stack:** TypeScript, Vitest, Go (architecture tests)

**Prerequisites:** Plans 0-8 ALL completed. All 53 non-index source files and their tests exist.

---

### Task 1: Write the final index.ts

**Files:**
- Modify: `01_EXTENSIONS/mcp/src/index.ts`

- [ ] **Step 1: Replace the stub index.ts with the real entry point**

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createProxyTool } from "./proxy-router.js";
import { createMcpCommand } from "./cmd-router.js";
import { onSessionStart } from "./lifecycle-init.js";
import { onSessionShutdown } from "./lifecycle-shutdown.js";
import { MCP_CONFIG_FLAG } from "./constants.js";

export default function (pi: ExtensionAPI) {
  pi.registerTool(createProxyTool(pi));
  pi.registerCommand("mcp", createMcpCommand(pi));
  pi.registerFlag("mcp-config", MCP_CONFIG_FLAG);
  pi.on("session_start", onSessionStart(pi));
  pi.on("session_shutdown", onSessionShutdown(pi));
}
```

This file is exactly 15 lines. It satisfies the entry-only pattern:

- Lines 1-6: imports (matched by `importLineRe`)
- Line 8: `export default function` (matched by `exportFuncRe`, captures `pi` as `paramName`)
- Lines 9-13: every line starts with `pi.` (matched by `apiRe` = `^\s*pi\.\w+\(`)
  - `pi` appearing inside argument lists (e.g., `createProxyTool(pi)`) is unchecked because `apiRe` matches the line first
- Line 14: closing `}` (matched by `closingLineRe`)

No variables, no loops, no standalone function calls, no type assertions.

- [ ] **Step 2: Verify line count**

```bash
wc -l 01_EXTENSIONS/mcp/src/index.ts
```

Expected: 15 lines (well under 99-line limit).

- [ ] **Step 3: Verify entry-only pattern manually**

Confirm each body line starts with `pi.`:

```bash
cd 01_EXTENSIONS/mcp && sed -n '9,13p' src/index.ts
```

Expected output (each line starts with `pi.`):
```
  pi.registerTool(createProxyTool(pi));
  pi.registerCommand("mcp", createMcpCommand(pi));
  pi.registerFlag("mcp-config", MCP_CONFIG_FLAG);
  pi.on("session_start", onSessionStart(pi));
  pi.on("session_shutdown", onSessionShutdown(pi));
```

---

### Task 2: Build verification

- [ ] **Step 1: Build TypeScript**

```bash
cd 01_EXTENSIONS/mcp && npm run build
```

Expected: `tsc` completes with zero errors. `dist/index.js` is updated.

This confirms:
- All imports in `index.ts` resolve to real modules
- `createProxyTool` returns a type compatible with `pi.registerTool()`
- `createMcpCommand` returns a type compatible with `pi.registerCommand()`
- `MCP_CONFIG_FLAG` is a valid flag definition for `pi.registerFlag()`
- `onSessionStart`/`onSessionShutdown` return handlers compatible with `pi.on()`
- No type errors across the full 54-file source tree

- [ ] **Step 2: Verify dist output exists**

```bash
ls -la 01_EXTENSIONS/mcp/dist/index.js 01_EXTENSIONS/mcp/dist/index.d.ts
```

Expected: both files present with recent timestamps.

---

### Task 3: Full test suite with coverage

- [ ] **Step 1: Run the complete test suite**

```bash
cd 01_EXTENSIONS/mcp && npm test
```

Expected:
- ALL tests pass (approximately 59 test files, hundreds of individual tests)
- Coverage thresholds met: 100% lines, branches, functions, statements
- `src/index.ts` excluded from coverage (per `vitest.config.ts`)

- [ ] **Step 2: Verify coverage report**

Check that no source file is missing coverage:

```bash
cd 01_EXTENSIONS/mcp && npx vitest run --coverage 2>&1 | tail -20
```

Expected: Coverage summary shows 100% across all metrics. Zero uncovered lines.

---

### Task 4: Go architecture tests

- [ ] **Step 1: Run all Go architecture tests**

```bash
cd /Users/me/Desktop/pi && go test ./00_ARCHITECTURE/tests/ -v -count=1
```

Expected: ALL tests pass. The relevant tests for this plan:

| Test | What it checks |
|------|----------------|
| Test 06 | `mcp` listed in root `README` |
| Test 08 | All required files present (`package.json`, `tsconfig.json`, `biome.json`, `.gitignore`, `README`, `vitest.config.ts`, `src/index.ts`, `dist/index.js`, `tests/`) |
| Test 09 | `package.json` has only allowed keys (`pi`, `scripts`, `devDependencies`, `dependencies`) |
| Test 10 | `vitest.config.ts` has 100% thresholds |
| Test 11 | `tests/` contains `.test.ts` files |
| Test 12 | Coverage excludes `src/index.ts` |
| Test 13 | `index.ts` follows entry-only pattern (the critical test for this plan) |
| Test 14 | `ExtensionAPI` string does not appear outside `src/index.ts` |
| Test 15 | Every `.ts` file is <= 99 lines |
| Test 20 | No `as any/unknown/never` type assertions anywhere |

- [ ] **Step 2: If any test fails, diagnose and fix**

If test 13 fails:
- Check the exact error message (will show the offending line)
- Ensure no variable declarations, loops, or standalone calls in the function body
- Ensure every body line starts with `pi.`
- Rebuild after any fix

If test 14 fails:
- Search for `ExtensionAPI` outside index.ts: `grep -r "ExtensionAPI" 01_EXTENSIONS/mcp/src/ --include="*.ts" | grep -v index.ts`
- Replace with narrow interface pattern (see design spec)

If test 15 fails:
- Identify the offending file: `find 01_EXTENSIONS/mcp/src 01_EXTENSIONS/mcp/tests -name "*.ts" -exec sh -c 'lines=$(wc -l < "$1"); [ "$lines" -gt 99 ] && echo "$1: $lines lines"' _ {} \;`
- Split into smaller files

If test 20 fails:
- Search for assertions: `grep -rn "as any\|as unknown\|as never" 01_EXTENSIONS/mcp/ --include="*.ts"`
- Replace with type-safe alternatives (narrow interfaces, DI)

---

### Task 5: Cross-cutting verification

- [ ] **Step 1: Verify no `ExtensionAPI` outside index.ts**

```bash
grep -r "ExtensionAPI" 01_EXTENSIONS/mcp/src/ --include="*.ts" | grep -v "index.ts"
```

Expected: zero matches. All modules use narrow interfaces.

- [ ] **Step 2: Verify no `as any/unknown/never` type assertions**

```bash
grep -rn "as any\|as unknown\|as never" 01_EXTENSIONS/mcp/src/ 01_EXTENSIONS/mcp/tests/ --include="*.ts"
```

Expected: zero matches. All mocks use type-safe DI.

- [ ] **Step 3: Verify every .ts file is <= 99 lines**

```bash
find 01_EXTENSIONS/mcp/src 01_EXTENSIONS/mcp/tests -name "*.ts" | while read f; do
  lines=$(wc -l < "$f")
  if [ "$lines" -gt 99 ]; then
    echo "FAIL: $f has $lines lines"
  fi
done
echo "Line count check complete"
```

Expected: no FAIL lines. Only "Line count check complete" at the end.

- [ ] **Step 4: Verify root README lists mcp extension**

```bash
grep "mcp" /Users/me/Desktop/pi/README
```

Expected: line containing `mcp` in the EXTENSIONS section (added in Plan 0).

---

### Task 6: Module completeness audit

- [ ] **Step 1: Verify all 54 source files exist**

Check every file from the design spec's module map:

```bash
cd 01_EXTENSIONS/mcp && for f in \
  src/index.ts \
  src/types-config.ts src/types-server.ts src/types-tool.ts src/types-proxy.ts \
  src/constants.ts \
  src/config-load.ts src/config-merge.ts src/config-imports.ts src/config-write.ts src/config-hash.ts \
  src/server-pool.ts src/server-connect.ts src/server-close.ts \
  src/transport-stdio.ts src/transport-http.ts src/transport-http-streamable.ts src/transport-http-sse.ts \
  src/lifecycle-init.ts src/lifecycle-shutdown.ts src/lifecycle-idle.ts src/lifecycle-keepalive.ts \
  src/proxy-router.ts src/proxy-call.ts src/proxy-query.ts src/proxy-search.ts src/proxy-description.ts \
  src/tool-metadata.ts src/tool-direct.ts src/tool-direct-register.ts src/tool-resource.ts src/tool-collision.ts \
  src/cache-metadata.ts src/cache-npx.ts \
  src/auth.ts src/consent.ts \
  src/cmd-router.ts src/cmd-info.ts src/cmd-server.ts src/cmd-auth.ts src/cmd-search.ts \
  src/npx-resolver.ts src/content-transform.ts src/schema-format.ts src/search.ts \
  src/env.ts src/errors.ts src/logger.ts src/logger-format.ts \
  src/state.ts src/failure-tracker.ts src/pagination.ts src/parallel.ts src/truncate.ts; do
  if [ ! -f "$f" ]; then echo "MISSING: $f"; fi
done
echo "Source file audit complete"
```

Expected: no MISSING lines. All 54 source files present.

- [ ] **Step 2: Verify all test files exist**

```bash
cd 01_EXTENSIONS/mcp && ls tests/*.test.ts | wc -l
```

Expected: approximately 59 test files (per design spec).

- [ ] **Step 3: Verify no leftover scaffold files**

```bash
ls 01_EXTENSIONS/mcp/tests/stub.test.ts 2>/dev/null && echo "FAIL: stub.test.ts still exists" || echo "OK: stub removed"
```

Expected: "OK: stub removed" (deleted in Plan 1).

---

### Task 7: Integration smoke test

- [ ] **Step 1: Verify the built module can be loaded**

```bash
cd 01_EXTENSIONS/mcp && node -e "const m = require('./dist/index.js'); console.log(typeof m.default)"
```

Expected: `function` (the default export is the extension entry point).

- [ ] **Step 2: Verify imports resolve correctly in the built output**

```bash
cd 01_EXTENSIONS/mcp && node -e "
  const m = require('./dist/index.js');
  console.log('default export:', typeof m.default);
" 2>&1
```

Expected: no "Cannot find module" errors. All six imports (`proxy-router`, `cmd-router`, `lifecycle-init`, `lifecycle-shutdown`, `constants`) resolve from the built `dist/` directory.

---

### Task 8: Final commit

- [ ] **Step 1: Stage and commit the final index.ts**

```bash
cd 01_EXTENSIONS/mcp && git add src/index.ts
git commit -m "mcp: final index.ts entry point (Plan 9 Integration)"
```

- [ ] **Step 2: Verify clean git state for mcp extension**

```bash
cd 01_EXTENSIONS/mcp && git status
```

Expected: no untracked or modified files under `01_EXTENSIONS/mcp/`.

---

### Verification Summary

All eight checks must pass before this plan is complete:

| # | Check | Command |
|---|-------|---------|
| 1 | Build succeeds | `cd 01_EXTENSIONS/mcp && npm run build` |
| 2 | All tests pass with 100% coverage | `cd 01_EXTENSIONS/mcp && npm test` |
| 3 | All Go architecture tests pass | `cd /Users/me/Desktop/pi && go test ./00_ARCHITECTURE/tests/ -v -count=1` |
| 4 | Every .ts file <= 99 lines | `find 01_EXTENSIONS/mcp -name "*.ts" -path "*/src/*" -o -name "*.ts" -path "*/tests/*" \| ...` |
| 5 | No `as any/unknown/never` in any file | `grep -rn "as any\|as unknown\|as never" ... --include="*.ts"` |
| 6 | No `ExtensionAPI` outside src/index.ts | `grep -r "ExtensionAPI" ... \| grep -v index.ts` |
| 7 | index.ts follows entry-only pattern | Go test 13 passes |
| 8 | Root README lists mcp extension | `grep "mcp" README` |
