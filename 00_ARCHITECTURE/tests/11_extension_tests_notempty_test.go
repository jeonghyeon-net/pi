package tests

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExtension_TestsDir_NotEmpty(t *testing.T) {
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
			testsDir := filepath.Join(dir, e.Name(), "tests")
			files, err := os.ReadDir(testsDir)
			if err != nil {
				t.Fatalf("tests/ 읽기 실패: %v", err)
			}
			found := false
			for _, f := range files {
				if strings.HasSuffix(f.Name(), ".test.ts") {
					found = true
					break
				}
			}
			if !found {
				t.Error("tests/ 안에 .test.ts 파일이 없음")
			}
		})
	}
}
