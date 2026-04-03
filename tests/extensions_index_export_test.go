package tests

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

var exportDefaultPi = regexp.MustCompile(`export\s+default\s+function\s*\(\s*pi\s*:\s*ExtensionAPI\s*\)`)

func TestExtensionsExportDefaultFunctionPi(t *testing.T) {
	dir := filepath.Join(projectRoot(), "extensions")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Skip("extensions/ 없음")
	}

	for _, e := range entries {
		if !e.IsDir() || e.Name() == ".gitkeep" {
			continue
		}

		index := filepath.Join(dir, e.Name(), "index.ts")
		data, err := os.ReadFile(index)
		if err != nil {
			continue // index.ts 없는 건 다른 테스트에서 잡음
		}

		if !exportDefaultPi.Match(data) {
			t.Errorf("extensions/%s/index.ts: export default function (pi: ExtensionAPI) 필수", e.Name())
		}
	}
}
