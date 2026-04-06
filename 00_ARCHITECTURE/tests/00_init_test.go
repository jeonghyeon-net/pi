package tests

import (
	"os"
	"path/filepath"
	"testing"
)

var root string

func TestMain(m *testing.M) {
	wd, err := os.Getwd()
	if err != nil {
		panic(err)
	}
	root = filepath.Dir(filepath.Dir(wd))
	os.Exit(m.Run())
}
