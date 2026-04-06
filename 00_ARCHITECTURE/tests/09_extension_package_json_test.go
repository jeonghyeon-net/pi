package tests

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

var extensionPackageJSONAllowedKeys = map[string]bool{
	"pi":              true,
	"scripts":         true,
	"devDependencies": true,
	"dependencies":    true,
}

func TestExtension_PackageJSON_AllowedKeysOnly(t *testing.T) {
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
			data, err := os.ReadFile(filepath.Join(dir, e.Name(), "package.json"))
			if err != nil {
				t.Fatalf("package.json 읽기 실패: %v", err)
			}
			var pkg map[string]json.RawMessage
			if err := json.Unmarshal(data, &pkg); err != nil {
				t.Fatalf("package.json 파싱 실패: %v", err)
			}
			for key := range pkg {
				if !extensionPackageJSONAllowedKeys[key] {
					t.Errorf("허용되지 않은 키: %s", key)
				}
			}
		})
	}
}

func TestExtension_PackageJSON_PiExtensions(t *testing.T) {
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
			data, err := os.ReadFile(filepath.Join(dir, e.Name(), "package.json"))
			if err != nil {
				t.Fatalf("package.json 읽기 실패: %v", err)
			}
			var pkg struct {
				Pi struct {
					Extensions []string `json:"extensions"`
				} `json:"pi"`
				Scripts map[string]string `json:"scripts"`
			}
			if err := json.Unmarshal(data, &pkg); err != nil {
				t.Fatalf("package.json 파싱 실패: %v", err)
			}
			if len(pkg.Pi.Extensions) != 1 || pkg.Pi.Extensions[0] != "dist/index.js" {
				t.Errorf("pi.extensions는 [\"dist/index.js\"]여야 함, 실제: %v", pkg.Pi.Extensions)
			}
			if _, ok := pkg.Scripts["test"]; !ok {
				t.Errorf("scripts.test 필드 누락")
			}
		})
	}
}
