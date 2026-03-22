package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/varbees/rateguard/internal/openapi"
)

func main() {
	repoRoot := flag.String("repo-root", "../..", "repository root directory")
	flag.Parse()

	root, err := filepath.Abs(*repoRoot)
	if err != nil {
		fmt.Fprintf(os.Stderr, "resolve repo root: %v\n", err)
		os.Exit(1)
	}

	if err := openapi.WriteArtifacts(root); err != nil {
		fmt.Fprintf(os.Stderr, "generate openapi artifacts: %v\n", err)
		os.Exit(1)
	}
}
