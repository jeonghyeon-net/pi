package tests

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

var skillNamePattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

func TestSkill_Frontmatter(t *testing.T) {
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
			data, err := os.ReadFile(filepath.Join(dir, e.Name(), "SKILL.md"))
			if err != nil {
				t.Fatalf("SKILL.md 읽기 실패: %v", err)
			}
			fm := parseFrontmatter(string(data))
			if fm == nil {
				t.Fatal("frontmatter가 없음")
			}
			name, ok := fm["name"]
			if !ok || name == "" {
				t.Error("name 필드 누락")
			} else {
				if !skillNamePattern.MatchString(name) {
					t.Errorf("name이 규칙에 맞지 않음 (소문자/숫자/하이픈): %s", name)
				}
				if name != e.Name() {
					t.Errorf("name이 디렉터리명과 불일치: name=%s, dir=%s", name, e.Name())
				}
			}
			if desc, ok := fm["description"]; !ok || desc == "" {
				t.Error("description 필드 누락")
			}
		})
	}
}

func parseFrontmatter(s string) map[string]string {
	lines := strings.Split(s, "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) != "---" {
		return nil
	}
	fm := map[string]string{}
	for _, line := range lines[1:] {
		if strings.TrimSpace(line) == "---" {
			return fm
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) == 2 {
			fm[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
		}
	}
	return nil
}
