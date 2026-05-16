package rateguard

import (
	"context"
	"testing"
	"time"
)

func TestMemoryLimiterEvictsLeastRecentlyUsedKeys(t *testing.T) {
	t.Parallel()

	limiter := newMemoryLimiterWithCapacity(2)
	policy := PolicyPreset{
		RequestsPerSecond: 10,
		Burst:             1,
	}

	for _, key := range []string{"tenant-a", "tenant-b", "tenant-c"} {
		decision, err := limiter.Allow(context.Background(), key, policy)
		if err != nil {
			t.Fatalf("allow %s returned error: %v", key, err)
		}
		if !decision.Allowed {
			t.Fatalf("allow %s denied unexpectedly: %+v", key, decision)
		}
	}

	if got := limiter.buckets.len(); got != 2 {
		t.Fatalf("bucket cache size = %d, want 2", got)
	}
	if _, ok := limiter.buckets.get("tenant-a"); ok {
		t.Fatal("expected least-recently-used bucket to be evicted")
	}

	decision, err := limiter.Allow(context.Background(), "tenant-a", policy)
	if err != nil {
		t.Fatalf("allow after eviction returned error: %v", err)
	}
	if !decision.Allowed {
		t.Fatalf("allow after eviction denied unexpectedly: %+v", decision)
	}
}

func TestMemoryLimiterUsesInjectedClock(t *testing.T) {
	t.Parallel()

	clock := &fakeBudgetClock{now: time.Date(2026, 3, 20, 10, 0, 0, 0, time.UTC)}
	limiter := newMemoryLimiterWithClock(clock, 2)
	policy := PolicyPreset{
		RequestsPerSecond: 1,
		Burst:             1,
	}

	first, err := limiter.Allow(context.Background(), "tenant-a", policy)
	if err != nil {
		t.Fatalf("first allow returned error: %v", err)
	}
	second, err := limiter.Allow(context.Background(), "tenant-a", policy)
	if err != nil {
		t.Fatalf("second allow returned error: %v", err)
	}
	if !first.Allowed || second.Allowed {
		t.Fatalf("initial decisions = %+v / %+v, want allow then deny", first, second)
	}

	clock.Advance(time.Second)
	third, err := limiter.Allow(context.Background(), "tenant-a", policy)
	if err != nil {
		t.Fatalf("third allow returned error: %v", err)
	}
	if !third.Allowed {
		t.Fatalf("third decision after clock advance = %+v, want allowed", third)
	}
}

func TestTokenBudgetManagerEvictsLeastRecentlyUsedKeys(t *testing.T) {
	t.Parallel()

	clock := &fakeBudgetClock{now: time.Date(2026, 3, 20, 10, 0, 0, 0, time.UTC)}
	manager := newTokenBudgetManagerWithCapacity(clock, 2)
	policy := PolicyPreset{
		TokenBudgetPerHour: 10,
		TokenBudgetMode:    TokenBudgetModeHardStop,
	}

	for _, key := range []string{"tenant-a", "tenant-b", "tenant-c"} {
		manager.record(key, 4)
	}

	if got := manager.states.len(); got != 2 {
		t.Fatalf("token state cache size = %d, want 2", got)
	}
	if _, ok := manager.states.get("tenant-a"); ok {
		t.Fatal("expected least-recently-used token state to be evicted")
	}

	decision := manager.check("tenant-a", policy)
	if !decision.Allowed {
		t.Fatalf("evicted key should behave like a fresh budget state: %+v", decision)
	}
	if decision.Remaining != 10 {
		t.Fatalf("remaining tokens = %d, want 10", decision.Remaining)
	}
}
