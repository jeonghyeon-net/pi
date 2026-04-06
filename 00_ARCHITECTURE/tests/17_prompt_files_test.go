package tests

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPrompt_OnlyMdFiles(t *testing.T) {
	dir := filepath.Join(root, "03_PROMPTS")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("03_PROMPTS 읽기 실패: %v", err)
	}
	for _, e := range entries {
		if e.Name() == "README" {
			continue
		}
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			t.Errorf("허용되지 않은 항목: %s (.md 파일만 허용)", e.Name())
		}
	}
}
