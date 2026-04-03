package tests

import (
	"os"
	"path/filepath"
	"testing"
)

func projectRoot() string {
	wd, _ := os.Getwd()
	return filepath.Dir(wd)
}

func TestExtensionsMustBeDirectories(t *testing.T) {
	dir := filepath.Join(projectRoot(), "extensions")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Skip("extensions/ 없음")
	}

	for _, e := range entries {
		if e.Name() == ".gitkeep" {
			continue
		}
		if !e.IsDir() {
			t.Errorf("extensions/%s: 파일 불허용, 폴더만 허용", e.Name())
		}
	}
}

func TestExtensionsNoPackageJson(t *testing.T) {
	dir := filepath.Join(projectRoot(), "extensions")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Skip("extensions/ 없음")
	}

	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		pkg := filepath.Join(dir, e.Name(), "package.json")
		if _, err := os.Stat(pkg); err == nil {
			t.Errorf("extensions/%s/: package.json은 루트에만 허용", e.Name())
		}
	}
}

func TestExtensionsHaveIndexTs(t *testing.T) {
	dir := filepath.Join(projectRoot(), "extensions")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Skip("extensions/ 없음")
	}

	for _, e := range entries {
		if e.Name() == ".gitkeep" || !e.IsDir() {
			continue
		}
		index := filepath.Join(dir, e.Name(), "index.ts")
		if _, err := os.Stat(index); err != nil {
			t.Errorf("extensions/%s/: index.ts 없음", e.Name())
		}
	}
}
