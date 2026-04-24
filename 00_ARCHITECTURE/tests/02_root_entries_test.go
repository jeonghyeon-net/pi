package tests

import (
	"os"
	"testing"
)

var rootAllowed = map[string]bool{
	".git":             true,
	".mise.toml":       true,
	"00_ARCHITECTURE":  true,
	"01_EXTENSIONS":    true,
	"02_SKILLS":        true,
	"03_PROMPTS":       true,
	"04_THEMES":        true,
	"docs":             true,
	"lefthook.yml":     true,
	"package.json":     true,
	"README":           true,
}

func TestRoot_AllowedEntriesOnly(t *testing.T) {
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatalf("루트 읽기 실패: %v", err)
	}
	for _, e := range entries {
		if !rootAllowed[e.Name()] {
			t.Errorf("허용되지 않은 항목: %s", e.Name())
		}
	}
}
