package tests

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAllFiles_NoMdExtension(t *testing.T) {
	filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(root, path)
		if info.IsDir() {
			if rel == ".git" {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(info.Name(), ".md") {
			return nil
		}
		// SKILL.md는 스킬 디렉터리에서 허용
		if info.Name() == "SKILL.md" && strings.HasPrefix(rel, "02_SKILLS/") {
			return nil
		}
		// 프롬프트는 .md 허용
		if strings.HasPrefix(rel, "03_PROMPTS/") {
			return nil
		}
		t.Errorf("허용되지 않은 .md 파일: %s", rel)
		return nil
	})
}
