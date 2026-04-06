package tests

import (
	"os"
	"path/filepath"
	"testing"
)

func TestTopdir_ReadmeOnly(t *testing.T) {
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatalf("루트 읽기 실패: %v", err)
	}
	for _, e := range entries {
		if !e.IsDir() || e.Name() == "00_ARCHITECTURE" || e.Name()[0] == '.' {
			continue
		}
		t.Run(e.Name(), func(t *testing.T) {
			children, err := os.ReadDir(filepath.Join(root, e.Name()))
			if err != nil {
				t.Fatalf("디렉터리 읽기 실패: %v", err)
			}
			for _, c := range children {
				if !c.IsDir() && c.Name() != "README" {
					t.Errorf("허용되지 않은 파일: %s/%s", e.Name(), c.Name())
				}
			}
		})
	}
}
