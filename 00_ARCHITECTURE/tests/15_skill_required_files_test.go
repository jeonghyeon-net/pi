package tests

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSkill_RequiredFiles(t *testing.T) {
	dir := filepath.Join(root, "02_SKILLS")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("02_SKILLS 읽기 실패: %v", err)
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		t.Run(e.Name(), func(t *testing.T) {
			path := filepath.Join(dir, e.Name(), "SKILL.md")
			if _, err := os.Stat(path); os.IsNotExist(err) {
				t.Errorf("필수 파일 누락: SKILL.md")
			}
		})
	}
}
