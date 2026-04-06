package tests

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

var sectionToDir = map[string]string{
	"EXTENSIONS": "01_EXTENSIONS",
	"SKILLS":     "02_SKILLS",
	"PROMPTS":    "03_PROMPTS",
	"THEMES":     "04_THEMES",
}

var itemLineRe = regexp.MustCompile(`^\s{4}(\S+)`)
var sectionRe = regexp.MustCompile(`^\s{2}([A-Z]+)\s*$`)
var noneRe = regexp.MustCompile(`^\s{4}\(none\)\s*$`)

func TestReadme_SectionsMatchDisk(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(root, "README"))
	if err != nil {
		t.Fatalf("README 읽기 실패: %v", err)
	}
	lines := strings.Split(string(data), "\n")
	for section, dir := range sectionToDir {
		t.Run(section, func(t *testing.T) {
			readme := parseSection(lines, section)
			disk := listDiskItems(t, dir)
			for n := range readme {
				if !disk[n] {
					t.Errorf("README에 있지만 디스크에 없음: %s", n)
				}
			}
			for n := range disk {
				if !readme[n] {
					t.Errorf("디스크에 있지만 README에 없음: %s", n)
				}
			}
		})
	}
}

func parseSection(lines []string, section string) map[string]bool {
	items := map[string]bool{}
	in := false
	for _, line := range lines {
		if m := sectionRe.FindStringSubmatch(line); m != nil {
			if m[1] == section {
				in = true
				continue
			}
			if in {
				break
			}
		}
		if in {
			if noneRe.MatchString(line) {
				break
			}
			if m := itemLineRe.FindStringSubmatch(line); m != nil {
				items[m[1]] = true
			}
		}
	}
	return items
}

func listDiskItems(t *testing.T, dir string) map[string]bool {
	t.Helper()
	items := map[string]bool{}
	entries, err := os.ReadDir(filepath.Join(root, dir))
	if err != nil {
		t.Fatalf("%s 읽기 실패: %v", dir, err)
	}
	for _, e := range entries {
		if e.Name() == "README" {
			continue
		}
		if e.IsDir() {
			items[e.Name()] = true
		} else {
			items[strings.TrimSuffix(e.Name(), filepath.Ext(e.Name()))] = true
		}
	}
	return items
}
