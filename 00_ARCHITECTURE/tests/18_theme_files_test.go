package tests

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTheme_OnlyJsonFiles(t *testing.T) {
	dir := filepath.Join(root, "04_THEMES")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("04_THEMES 읽기 실패: %v", err)
	}
	for _, e := range entries {
		if e.Name() == "README" {
			continue
		}
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			t.Errorf("허용되지 않은 항목: %s (.json 파일만 허용)", e.Name())
		}
	}
}
