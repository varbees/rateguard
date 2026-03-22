package integration

import (
	"os"
	"testing"

	"github.com/varbees/rateguard/pkg/logger"
)

// TestMain controls the execution of all integration tests
func TestMain(m *testing.M) {
	// Initialize logger for tests
	logger.Initialize(logger.Config{
		Level:       "info",
		Format:      "console",
		Development: true,
	})

	if os.Getenv("RATEGUARD_INTEGRATION_BASE_URL") == "" {
		logger.Info("Skipping integration tests: RATEGUARD_INTEGRATION_BASE_URL not set")
		os.Exit(0)
	}

	// Run tests
	code := m.Run()

	os.Exit(code)
}
