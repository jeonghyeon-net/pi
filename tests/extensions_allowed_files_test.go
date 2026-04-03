package tests

import (
	"os"
	"path/filepath"
	"testing"
)

var allowedExtensionFiles = map[string]bool{
	"index.ts": true,
	"README":   true,
}

func TestExtensionsOnlyAllowedFiles(t *testing.T) {
	dir := filepath.Join(projectRoot(), "extensions")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Skip("extensions/ 없음")
	}

	for _, e := range entries {
		if !e.IsDir() {
			continue
		}

		path := filepath.Join(dir, e.Name())
		files, err := os.ReadDir(path)
		if err != nil {
			continue
		}

		for _, f := range files {
			if f.IsDir() {
				continue
			}
			if !allowedExtensionFiles[f.Name()] {
				t.Errorf("extensions/%s/%s: 허용되지 않은 파일, index.ts와 README만 허용", e.Name(), f.Name())
			}
		}
	}
}
