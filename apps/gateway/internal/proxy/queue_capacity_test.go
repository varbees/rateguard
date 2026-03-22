package proxy

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/models"
)

func TestQueueStoreReserveSlotEnforcesLimit(t *testing.T) {
	t.Parallel()

	store := &queueStore{
		queueWaiters: make(map[string]*queueWaiterState),
	}

	key := queueCapacityKey(uuid.New(), "demo-api")

	release1, acquired1 := store.reserveQueueSlot(key, 1, time.Minute)
	if !acquired1 {
		t.Fatal("expected first reservation to succeed")
	}
	if release1 == nil {
		t.Fatal("expected release callback")
	}

	if _, acquired2 := store.reserveQueueSlot(key, 1, time.Minute); acquired2 {
		t.Fatal("expected second reservation to be rejected at capacity")
	}

	release1()

	if _, acquired3 := store.reserveQueueSlot(key, 1, time.Minute); !acquired3 {
		t.Fatal("expected reservation to succeed after release")
	}
}

func TestBuildQueueCapacityExceededResponse(t *testing.T) {
	t.Parallel()

	req := &models.ProxyRequest{ID: "req-queue-cap", UserID: uuid.New()}
	resp := buildQueueCapacityExceededResponse(req, time.Unix(1700000200, 0), 3, "demo-api")

	if resp.StatusCode != 429 {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	if got := resp.Headers.Get("X-RateGuard-Limit-Type"); got != "queue" {
		t.Fatalf("limit type = %q", got)
	}
	if got := resp.Headers.Get("X-RateGuard-Queue-Max-Length"); got != "3" {
		t.Fatalf("max queue length = %q", got)
	}
	if len(resp.Body) == 0 {
		t.Fatal("expected response body")
	}
}

func BenchmarkQueueStoreReserveSlot(b *testing.B) {
	store := &queueStore{
		queueWaiters: make(map[string]*queueWaiterState),
	}

	key := queueCapacityKey(uuid.New(), "bench-api")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		release, acquired := store.reserveQueueSlot(key, 1000, time.Minute)
		if !acquired {
			b.Fatal("unexpected capacity rejection in benchmark")
		}
		release()
	}
}
