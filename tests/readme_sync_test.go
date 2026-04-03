package tests

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func readmeSection(readme string, section string) []string {
	lines := strings.Split(readme, "\n")
	var items []string
	inSection := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		// 섹션 헤더 감지 (들여쓰기 2칸, 대문자)
		if len(line) >= 2 && line[:2] == "  " && trimmed == strings.ToUpper(trimmed) && trimmed != "" {
			if trimmed == section {
				inSection = true
			} else if inSection {
				break
			}
			continue
		}

		if inSection && trimmed != "" && trimmed != "(none)" {
			items = append(items, trimmed)
		}
	}

	return items
}

func dirEntries(root string, dir string) []string {
	path := filepath.Join(root, dir)
	entries, err := os.ReadDir(path)
	if err != nil {
		return nil
	}

	var names []string
	for _, e := range entries {
		if e.Name() == ".gitkeep" {
			continue
		}
		if e.IsDir() {
			names = append(names, e.Name())
		} else {
			name := e.Name()
			ext := filepath.Ext(name)
			if ext != "" {
				name = name[:len(name)-len(ext)]
			}
			names = append(names, name)
		}
	}
	return names
}

func testSection(t *testing.T, readme string, root string, section string, dir string) {
	listed := readmeSection(readme, section)
	actual := dirEntries(root, dir)

	listedSet := make(map[string]bool)
	for _, name := range listed {
		// README에서 이름만 추출 (설명이 붙어있을 수 있음)
		parts := strings.Fields(name)
		if len(parts) > 0 {
			listedSet[parts[0]] = true
		}
	}

	actualSet := make(map[string]bool)
	for _, name := range actual {
		actualSet[name] = true
	}

	for name := range actualSet {
		if !listedSet[name] {
			t.Errorf("README %s 섹션에 %s 없음", section, name)
		}
	}

	for name := range listedSet {
		if !actualSet[name] {
			t.Errorf("README %s 섹션에 %s가 있지만 %s/에 없음", section, name, dir)
		}
	}

	if len(actual) == 0 && len(listed) > 0 {
		t.Errorf("README %s 섹션에 항목이 있지만 %s/가 비어있음", section, dir)
	}

	if len(actual) > 0 && len(listed) == 0 {
		t.Errorf("README %s 섹션이 (none)이지만 %s/에 항목 있음", section, dir)
	}
}

func TestReadmeSyncExtensions(t *testing.T) {
	root := projectRoot()
	data, err := os.ReadFile(filepath.Join(root, "README"))
	if err != nil {
		t.Fatal("README 없음")
	}
	testSection(t, string(data), root, "EXTENSIONS", "extensions")
}

func TestReadmeSyncSkills(t *testing.T) {
	root := projectRoot()
	data, err := os.ReadFile(filepath.Join(root, "README"))
	if err != nil {
		t.Fatal("README 없음")
	}
	testSection(t, string(data), root, "SKILLS", "skills")
}

func TestReadmeSyncPrompts(t *testing.T) {
	root := projectRoot()
	data, err := os.ReadFile(filepath.Join(root, "README"))
	if err != nil {
		t.Fatal("README 없음")
	}
	testSection(t, string(data), root, "PROMPTS", "prompts")
}

