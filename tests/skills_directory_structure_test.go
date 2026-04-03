package tests

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSkillsMustBeDirectories(t *testing.T) {
	dir := filepath.Join(projectRoot(), "skills")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Skip("skills/ 없음")
	}

	for _, e := range entries {
		if e.Name() == ".gitkeep" {
			continue
		}
		if !e.IsDir() {
			t.Errorf("skills/%s: 파일 불허용, 폴더만 허용", e.Name())
		}
	}
}

func TestSkillsHaveSkillMd(t *testing.T) {
	dir := filepath.Join(projectRoot(), "skills")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Skip("skills/ 없음")
	}

	for _, e := range entries {
		if e.Name() == ".gitkeep" || !e.IsDir() {
			continue
		}
		skillMd := filepath.Join(dir, e.Name(), "SKILL.md")
		if _, err := os.Stat(skillMd); err != nil {
			t.Errorf("skills/%s/: SKILL.md 없음", e.Name())
		}
	}
}
