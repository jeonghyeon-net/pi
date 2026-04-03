package tests

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPromptsOnlyMdFiles(t *testing.T) {
	dir := filepath.Join(projectRoot(), "prompts")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Skip("prompts/ 없음")
	}

	for _, e := range entries {
		if e.Name() == ".gitkeep" {
			continue
		}
		if e.IsDir() {
			t.Errorf("prompts/%s: 디렉토리 불허용", e.Name())
			continue
		}
		if filepath.Ext(e.Name()) != ".md" {
			t.Errorf("prompts/%s: .md 파일만 허용", e.Name())
		}
	}
}
