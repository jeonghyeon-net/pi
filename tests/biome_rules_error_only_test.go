package tests

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestBiomeAllRulesError(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(projectRoot(), "biome.json"))
	if err != nil {
		t.Fatal("biome.json 없음")
	}

	var config map[string]interface{}
	if err := json.Unmarshal(data, &config); err != nil {
		t.Fatalf("biome.json 파싱 실패: %v", err)
	}

	linter, ok := config["linter"].(map[string]interface{})
	if !ok {
		t.Fatal("linter 설정 없음")
	}

	rules, ok := linter["rules"].(map[string]interface{})
	if !ok {
		t.Fatal("rules 설정 없음")
	}

	for category, v := range rules {
		group, ok := v.(map[string]interface{})
		if !ok {
			continue
		}

		for rule, level := range group {
			if rule == "recommended" {
				continue
			}
			str, ok := level.(string)
			if !ok {
				continue
			}
			if str != "error" {
				t.Errorf("biome %s/%s: \"%s\" 불허용, \"error\"만 허용", category, rule, str)
			}
		}
	}
}
