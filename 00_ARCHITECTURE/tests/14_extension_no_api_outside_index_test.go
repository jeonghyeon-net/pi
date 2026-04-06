package tests

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

var extensionAPIRe = regexp.MustCompile(`\bExtensionAPI\b`)

func TestExtension_NoExtensionAPIOutsideIndex(t *testing.T) {
	dir := filepath.Join(root, "01_EXTENSIONS")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("01_EXTENSIONS 읽기 실패: %v", err)
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		t.Run(e.Name(), func(t *testing.T) {
			srcDir := filepath.Join(dir, e.Name(), "src")
			filepath.Walk(srcDir, func(path string, info os.FileInfo, err error) error {
				if err != nil || info.IsDir() {
					return err
				}
				if !strings.HasSuffix(info.Name(), ".ts") || info.Name() == "index.ts" {
					return nil
				}
				data, err := os.ReadFile(path)
				if err != nil {
					return nil
				}
				for i, line := range strings.Split(string(data), "\n") {
					if extensionAPIRe.MatchString(line) {
						rel, _ := filepath.Rel(dir, path)
						t.Errorf("%s:%d ExtensionAPI 사용 금지 (index.ts에서만 허용)", rel, i+1)
					}
				}
				return nil
			})
		})
	}
}
