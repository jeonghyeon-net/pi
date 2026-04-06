package tests

import (
	"os"
	"path/filepath"
	"testing"
)

var extensionRequiredFiles = []string{
	"package.json",
	"tsconfig.json",
	"biome.json",
	".gitignore",
	"README",
	"vitest.config.ts",
	"src/index.ts",
	"dist/index.js",
	"tests",
}

func TestExtension_RequiredFiles(t *testing.T) {
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
			for _, req := range extensionRequiredFiles {
				path := filepath.Join(dir, e.Name(), req)
				if _, err := os.Stat(path); os.IsNotExist(err) {
					t.Errorf("필수 파일 누락: %s", req)
				}
			}
		})
	}
}
