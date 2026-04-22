package tests

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

var (
	indexImportRe = regexp.MustCompile(`^import\s+`)
	indexReExpRe = regexp.MustCompile(`^export\s+\{\s*default\s*\}\s+from\s+["'][^"']+["'];?$`)
	indexFuncRe = regexp.MustCompile(`^export\s+default\s+function\s*\(_pi:\s*ExtensionAPI\)\s*\{$`)
	indexCloseRe = regexp.MustCompile(`^[\s}\);,]*$`)
	indexCallRe = regexp.MustCompile(`^\s*(?:return\s+)?(?:await\s+)?(\w+)\s*\(`)
	indexNamesRe = regexp.MustCompile(`import\s+(?:type\s+)?(?:\{([^}]+)\}|(\w+))`)
	indexPiArgRe = regexp.MustCompile(`\b_pi\b`)
)

func TestExtension_IndexTs_EntryOnly(t *testing.T) {
	dir := filepath.Join(root, "01_EXTENSIONS")
	entries, err := os.ReadDir(dir)
	if err != nil { t.Fatalf("01_EXTENSIONS 읽기 실패: %v", err) }
	for _, e := range entries {
		if !e.IsDir() { continue }
		t.Run(e.Name(), func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join(dir, e.Name(), "src/index.ts"))
			if err != nil { t.Fatalf("src/index.ts 읽기 실패: %v", err) }
			imports, mode, depth, reexports := map[string]bool{}, "", 0, 0
			for _, line := range strings.Split(string(data), "\n") {
				s := strings.TrimSpace(line)
				if s == "" || strings.HasPrefix(s, "//") { continue }
				switch mode {
				case "":
					if indexImportRe.MatchString(s) { collectIndexImports(s, imports); continue }
					if indexReExpRe.MatchString(s) { mode, reexports = "reexport", 1; continue }
					if indexFuncRe.MatchString(s) { mode, depth = "function", 1; continue }
					t.Errorf("index.ts는 direct re-export 또는 export default function (_pi: ExtensionAPI) { 만 허용: %s", s)
				case "reexport":
					if indexReExpRe.MatchString(s) { reexports++; continue }
					t.Errorf("re-export 모드에서는 단일 direct re-export 외 금지: %s", s)
				case "function":
					depth += strings.Count(s, "{") - strings.Count(s, "}")
					if depth <= 0 { mode = "done"; continue }
					if indexCloseRe.MatchString(s) || strings.HasPrefix(s, "_pi.") { continue }
					if m := indexCallRe.FindStringSubmatch(s); m != nil && imports[m[1]] {
						if indexPiArgRe.MatchString(s) { t.Errorf("_pi를 다른 함수에 전달 금지: %s", s) }
						continue
					}
					t.Errorf("function 모드에서 허용되지 않은 구문: %s", s)
				case "done":
					t.Errorf("function 뒤 top-level 구문 금지: %s", s)
				}
			}
			if mode == "" { t.Error("export default function 또는 direct re-export가 없음") }
			if mode == "reexport" && (len(imports) > 0 || reexports != 1) { t.Error("re-export는 import 없이 단일 한 줄만 허용") }
		})
	}
}

func collectIndexImports(line string, imports map[string]bool) {
	m := indexNamesRe.FindStringSubmatch(line)
	if m == nil { return }
	if m[1] != "" {
		for _, name := range strings.Split(m[1], ",") { imports[strings.TrimSpace(name)] = true }
	}
	if m[2] != "" { imports[m[2]] = true }
}
