# MCP Extension Plan 0: Scaffolding

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `01_EXTENSIONS/mcp/` directory with all required files so that architecture tests pass and subsequent plans can compile and test.

**Architecture:** Minimal scaffolding following the exact patterns of existing extensions (subagent, until, todo). Stub `index.ts` with empty function body. All config files copied from established patterns.

**Tech Stack:** TypeScript 5.8+, Vitest 3.1+, @modelcontextprotocol/sdk, @sinclair/typebox, Biome

---

### Task 1: Create directory structure and config files

**Files:**
- Create: `01_EXTENSIONS/mcp/package.json`
- Create: `01_EXTENSIONS/mcp/tsconfig.json`
- Create: `01_EXTENSIONS/mcp/biome.json`
- Create: `01_EXTENSIONS/mcp/vitest.config.ts`
- Create: `01_EXTENSIONS/mcp/.gitignore`
- Create: `01_EXTENSIONS/mcp/README`

- [ ] **Step 1: Create `package.json`**

```json
{
  "pi": {
    "extensions": [
      "dist/index.js"
    ]
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run --coverage"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.25.0",
    "@sinclair/typebox": "^0.34.0"
  },
  "devDependencies": {
    "@mariozechner/pi-coding-agent": "*",
    "@vitest/coverage-v8": "^3.1.0",
    "typescript": "^5.8.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `biome.json`**

```json
{
  "formatter": {
    "indentStyle": "tab"
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  }
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			include: ["src/**"],
			exclude: ["src/index.ts"],
			thresholds: {
				lines: 100,
				branches: 100,
				functions: 100,
				statements: 100,
			},
		},
	},
});
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
coverage/
```

- [ ] **Step 6: Create `README`**

```
mcp … MCP 서버 통합 (proxy tool, lazy connection, metadata caching)
```

---

### Task 2: Create stub source and test files

**Files:**
- Create: `01_EXTENSIONS/mcp/src/index.ts`
- Create: `01_EXTENSIONS/mcp/tests/stub.test.ts`

- [ ] **Step 1: Create stub `src/index.ts`**

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
}
```

This is the minimal entry point that satisfies:
- Architecture test 13 (entry-only pattern: empty body is valid)
- Architecture test 14 (ExtensionAPI only in index.ts)

- [ ] **Step 2: Create placeholder test file**

The architecture test 11 requires `tests/` to contain at least one `.test.ts` file. Create a minimal placeholder that will be replaced by real tests in Plan 1.

```typescript
import { describe, expect, it } from "vitest";

describe("mcp extension", () => {
	it("placeholder for scaffolding", () => {
		expect(true).toBe(true);
	});
});
```

---

### Task 3: Install dependencies and build

**Files:**
- Produces: `01_EXTENSIONS/mcp/dist/index.js`

- [ ] **Step 1: Install npm dependencies**

Run from `01_EXTENSIONS/mcp/`:
```bash
cd 01_EXTENSIONS/mcp && npm install
```

Expected: `node_modules/` created with `@modelcontextprotocol/sdk`, `@sinclair/typebox`, `vitest`, etc.

- [ ] **Step 2: Build TypeScript**

```bash
cd 01_EXTENSIONS/mcp && npm run build
```

Expected: `dist/index.js` and `dist/index.d.ts` created. Required by architecture test 08.

- [ ] **Step 3: Run tests**

```bash
cd 01_EXTENSIONS/mcp && npm test
```

Expected: 1 test passes. Coverage thresholds pass because `src/index.ts` is excluded and there are no other source files yet.

---

### Task 4: Update root README and verify architecture

**Files:**
- Modify: `README` (root)

- [ ] **Step 1: Update root README**

Add `mcp` to the EXTENSIONS section in alphabetical order. The line format follows existing pattern:

```
  EXTENSIONS
    footer … 커스텀 footer: 모델명, 저장소/브랜치, context 사용률 표시
    mcp … MCP 서버 통합 (proxy tool, lazy connection, metadata caching)
    notify … 에이전트 작업 완료 시 터미널 알림
    subagent … 서브에이전트 오케스트레이션 (비동기 실행, 세션 관리)
    todo … LLM용 todo 관리 도구
    until … 조건 충족까지 주기적 작업 반복 실행
```

- [ ] **Step 2: Run Go architecture tests**

```bash
cd /Users/me/Desktop/pi && go test ./00_ARCHITECTURE/tests/ -v -count=1
```

Expected: ALL tests pass, including:
- Test 06 (README sync): `mcp` listed in README
- Test 08 (required files): all files present
- Test 09 (package.json): only allowed keys
- Test 10 (vitest config): 100% thresholds
- Test 11 (tests non-empty): `stub.test.ts` exists
- Test 12 (coverage exclude): `["src/index.ts"]`
- Test 13 (entry-only index): empty body passes
- Test 14 (no ExtensionAPI outside index): no other .ts files yet
- Test 20 (no type assertions): no `as any/unknown/never`

- [ ] **Step 3: Commit**

```bash
git add 01_EXTENSIONS/mcp/ README
git commit -m "mcp extension scaffolding"
```
