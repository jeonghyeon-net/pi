package tests

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

var themeRequiredColors = []string{
	"accent", "border", "borderAccent", "borderMuted",
	"success", "error", "warning",
	"muted", "dim", "text", "thinkingText",

	"selectedBg",
	"userMessageBg", "userMessageText",
	"customMessageBg", "customMessageText", "customMessageLabel",
	"toolPendingBg", "toolSuccessBg", "toolErrorBg",
	"toolTitle", "toolOutput",

	"mdHeading", "mdLink", "mdLinkUrl",
	"mdCode", "mdCodeBlock", "mdCodeBlockBorder",
	"mdQuote", "mdQuoteBorder", "mdHr", "mdListBullet",

	"toolDiffAdded", "toolDiffRemoved", "toolDiffContext",

	"syntaxComment", "syntaxKeyword", "syntaxFunction",
	"syntaxVariable", "syntaxString", "syntaxNumber",
	"syntaxType", "syntaxOperator", "syntaxPunctuation",

	"thinkingOff", "thinkingMinimal", "thinkingLow",
	"thinkingMedium", "thinkingHigh", "thinkingXhigh",

	"bashMode",
}

func TestTheme_Schema(t *testing.T) {
	dir := filepath.Join(root, "04_THEMES")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("04_THEMES 읽기 실패: %v", err)
	}
	for _, e := range entries {
		if e.IsDir() || e.Name() == "README" {
			continue
		}
		t.Run(e.Name(), func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join(dir, e.Name()))
			if err != nil {
				t.Fatalf("읽기 실패: %v", err)
			}
			var theme map[string]json.RawMessage
			if err := json.Unmarshal(data, &theme); err != nil {
				t.Fatalf("JSON 파싱 실패: %v", err)
			}
			if _, ok := theme["name"]; !ok {
				t.Error("name 필드 누락")
			}
			colorsRaw, ok := theme["colors"]
			if !ok {
				t.Fatal("colors 필드 누락")
			}
			var colors map[string]json.RawMessage
			if err := json.Unmarshal(colorsRaw, &colors); err != nil {
				t.Fatalf("colors 파싱 실패: %v", err)
			}
			for _, key := range themeRequiredColors {
				if _, ok := colors[key]; !ok {
					t.Errorf("colors 토큰 누락: %s", key)
				}
			}
		})
	}
}
