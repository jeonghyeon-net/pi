package tests

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const maxLines = 99

func TestAllFiles_MaxLines(t *testing.T) {
	filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(root, path)
		dir := filepath.Base(rel)
		if info.IsDir() {
			if rel == ".git" || rel == "docs" || dir == "node_modules" || dir == "coverage" || dir == "dist" {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.HasSuffix(info.Name(), ".md") {
			return nil
		}
		if info.Name() == "package-lock.json" {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			t.Errorf("읽기 실패: %s", rel)
			return nil
		}
		lines := bytes.Count(data, []byte("\n"))
		if len(data) > 0 && data[len(data)-1] != '\n' {
			lines++
		}
		if lines > maxLines {
			t.Errorf("%s: %d줄 (최대 %d줄)", rel, lines, maxLines)
		}
		return nil
	})
}
