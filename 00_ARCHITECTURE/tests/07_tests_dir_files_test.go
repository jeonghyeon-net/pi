package tests

import (
	"os"
	"regexp"
	"testing"
)

var testsFilePattern = regexp.MustCompile(`^\d{2}_.+_test\.go$`)

func TestTestsDir_OnlyPrefixedTestFiles(t *testing.T) {
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("tests 디렉터리 읽기 실패: %v", err)
	}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() {
			t.Errorf("허용되지 않은 디렉터리: %s", name)
			continue
		}
		if name == "go.mod" {
			continue
		}
		if !testsFilePattern.MatchString(name) {
			t.Errorf("허용되지 않은 파일: %s (NN_*_test.go 패턴 필요)", name)
		}
	}
}
