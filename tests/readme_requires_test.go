package tests

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func parseMiseTools(data string) map[string]string {
	tools := make(map[string]string)
	inTools := false

	for _, line := range strings.Split(data, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "[tools]" {
			inTools = true
			continue
		}
		if strings.HasPrefix(trimmed, "[") {
			inTools = false
			continue
		}
		if !inTools || trimmed == "" {
			continue
		}

		parts := strings.SplitN(trimmed, "=", 2)
		if len(parts) != 2 {
			continue
		}
		name := strings.TrimSpace(parts[0])
		version := strings.Trim(strings.TrimSpace(parts[1]), "\"")
		tools[name] = version
	}
	return tools
}

func TestReadmeRequiresMatchesMise(t *testing.T) {
	root := projectRoot()

	miseData, err := os.ReadFile(filepath.Join(root, "mise.toml"))
	if err != nil {
		t.Fatal("mise.toml 없음")
	}
	miseTools := parseMiseTools(string(miseData))

	readmeData, err := os.ReadFile(filepath.Join(root, "README"))
	if err != nil {
		t.Fatal("README 없음")
	}
	requires := readmeSection(string(readmeData), "REQUIRES")

	readmeTools := make(map[string]string)
	for _, line := range requires {
		parts := strings.Fields(line)
		if len(parts) != 2 {
			t.Errorf("README REQUIRES: \"%s\" 형식 오류, \"도구 버전\" 형식 필수", line)
			continue
		}
		readmeTools[parts[0]] = parts[1]
	}

	for name, version := range miseTools {
		rv, ok := readmeTools[name]
		if !ok {
			t.Errorf("README REQUIRES에 %s 없음", name)
			continue
		}
		if rv != version {
			t.Errorf("README REQUIRES %s 버전 불일치: README=%s, mise.toml=%s", name, rv, version)
		}
	}

	for name := range readmeTools {
		if _, ok := miseTools[name]; !ok {
			t.Errorf("README REQUIRES에 %s가 있지만 mise.toml에 없음", name)
		}
	}
}
