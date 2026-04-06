package tests

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

var (
	importLineRe   = regexp.MustCompile(`^import\s+`)
	exportFuncRe   = regexp.MustCompile(`^export\s+default\s+function\s*\((\w+)`)
	closingLineRe  = regexp.MustCompile(`^[\s}\);,]*$`)
	importedCallRe = regexp.MustCompile(`^\s*(?:await\s+)?(\w+)\s*\(`)
	importNamesRe  = regexp.MustCompile(`import\s+(?:type\s+)?(?:\{([^}]+)\}|(\w+))`)
)

func TestExtension_IndexTs_EntryOnly(t *testing.T) {
	dir := filepath.Join(root, "01_EXTENSIONS")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("01_EXTENSIONS 읽기 실패: %v", err)
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		t.Run(e.Name(), func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join(dir, e.Name(), "src/index.ts"))
			if err != nil {
				t.Fatalf("src/index.ts 읽기 실패: %v", err)
			}
			lines := strings.Split(string(data), "\n")
			imports := map[string]bool{}
			inBody, braceDepth, paramName := false, 0, ""
			for _, line := range lines {
				trimmed := strings.TrimSpace(line)
				if trimmed == "" || strings.HasPrefix(trimmed, "//") {
					continue
				}
				if !inBody {
					if importLineRe.MatchString(trimmed) {
						collectImports(trimmed, imports)
						continue
					}
					if m := exportFuncRe.FindStringSubmatch(trimmed); m != nil {
						paramName = m[1]
						inBody = true
						braceDepth = strings.Count(trimmed, "{") - strings.Count(trimmed, "}")
						continue
					}
					t.Errorf("import 또는 export default function 외 구문: %s", trimmed)
					continue
				}
				braceDepth += strings.Count(trimmed, "{") - strings.Count(trimmed, "}")
				if braceDepth <= 0 {
					inBody = false
					continue
				}
				if closingLineRe.MatchString(trimmed) {
					continue
				}
				apiRe := regexp.MustCompile(fmt.Sprintf(`^\s*%s\.\w+\(`, regexp.QuoteMeta(paramName)))
				if apiRe.MatchString(line) {
					continue
				}
				if m := importedCallRe.FindStringSubmatch(trimmed); m != nil && imports[m[1]] {
					paramRe := regexp.MustCompile(fmt.Sprintf(`\b%s\b`, regexp.QuoteMeta(paramName)))
					if paramRe.MatchString(trimmed) {
						t.Errorf("파라미터를 다른 함수에 전달 금지: %s", trimmed)
					}
					continue
				}
				t.Errorf("허용되지 않은 구문: %s", trimmed)
			}
			if paramName == "" {
				t.Error("export default function이 없음")
			}
		})
	}
}

func collectImports(line string, imports map[string]bool) {
	m := importNamesRe.FindStringSubmatch(line)
	if m == nil {
		return
	}
	if m[1] != "" {
		for _, name := range strings.Split(m[1], ",") {
			imports[strings.TrimSpace(name)] = true
		}
	}
	if m[2] != "" {
		imports[m[2]] = true
	}
}
