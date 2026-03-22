package proxy

import (
	"os"
	"testing"
	"time"

	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

func TestMain(m *testing.M) {
	logger.Log = zap.NewNop()
	os.Exit(m.Run())
}

func TestCircuitBreakerManagerCleanupRemovesInactiveClosedBreakers(t *testing.T) {
	mgr := NewCircuitBreakerManager(DefaultCircuitBreakerConfig(), nil)

	breaker := mgr.GetOrCreate("api-1", "API One", "user-1")
	breaker.lastStateTime.Store(time.Now().Add(-2 * time.Hour))

	removed := mgr.Cleanup(1 * time.Hour)
	if removed != 1 {
		t.Fatalf("expected 1 breaker to be removed, got %d", removed)
	}

	if got := mgr.Get("api-1"); got != nil {
		t.Fatalf("expected breaker to be removed, got %#v", got)
	}
}

func TestCircuitBreakerManagerCleanupKeepsRecentlyActiveBreakers(t *testing.T) {
	mgr := NewCircuitBreakerManager(DefaultCircuitBreakerConfig(), nil)

	breaker := mgr.GetOrCreate("api-2", "API Two", "user-2")
	breaker.lastStateTime.Store(time.Now().Add(-5 * time.Minute))

	removed := mgr.Cleanup(1 * time.Hour)
	if removed != 0 {
		t.Fatalf("expected no breakers to be removed, got %d", removed)
	}

	if got := mgr.Get("api-2"); got == nil {
		t.Fatal("expected breaker to remain registered")
	}
}
