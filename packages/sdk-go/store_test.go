package rateguard

import (
	"context"
	"testing"
	"time"
)

// Compile-time proof that both in-process limiters satisfy Store.
var (
	_ Store = (*MemoryLimiter)(nil)
	_ Store = (*ShardedLimiter)(nil)
	_ Store = (*RedisGCRALimiter)(nil)
)

func newStoreFixtures(clock *fakeLimiterClock) []struct {
	name string
	l    Store
} {
	return []struct {
		name string
		l    Store
	}{
		{"memory", newMemoryLimiterWithClock(clock, 1000)},
		{"sharded", newShardedLimiterWithClock(clock, 1000)},
	}
}

func TestStoreIncrementOneMatchesAllow(t *testing.T) {
	clock := &fakeLimiterClock{now: time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)}
	policy := PolicyPreset{RequestsPerSecond: 10, Burst: 3}
	ctx := context.Background()

	for _, tc := range newStoreFixtures(clock) {
		t.Run(tc.name, func(t *testing.T) {
			limiter := tc.l.(Limiter)
			allowDecision, err := limiter.Allow(ctx, "k-"+tc.name+"-allow", policy)
			if err != nil {
				t.Fatalf("Allow: %v", err)
			}

			incDecision, err := tc.l.Increment(ctx, "k-"+tc.name+"-inc", policy, 1)
			if err != nil {
				t.Fatalf("Increment(1): %v", err)
			}

			if incDecision.Allowed != allowDecision.Allowed || incDecision.Remaining != allowDecision.Remaining {
				t.Fatalf("Increment(1) = %+v, want to match Allow() = %+v", incDecision, allowDecision)
			}
		})
	}
}

func TestStoreIncrementByN(t *testing.T) {
	clock := &fakeLimiterClock{now: time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)}
	policy := PolicyPreset{RequestsPerSecond: 10, Burst: 5}
	ctx := context.Background()

	for _, tc := range newStoreFixtures(clock) {
		t.Run(tc.name, func(t *testing.T) {
			key := "k-" + tc.name

			// Consuming 3 of 5 tokens in one shot must succeed and leave 2.
			d, err := tc.l.Increment(ctx, key, policy, 3)
			if err != nil {
				t.Fatalf("Increment(3): %v", err)
			}
			if !d.Allowed || d.Remaining != 2 {
				t.Fatalf("Increment(3) = %+v, want allowed with remaining=2", d)
			}

			// A further request for 3 more must be denied — only 2 remain.
			d, err = tc.l.Increment(ctx, key, policy, 3)
			if err != nil {
				t.Fatalf("Increment(3) second call: %v", err)
			}
			if d.Allowed {
				t.Fatalf("Increment(3) with only 2 tokens left should deny, got %+v", d)
			}

			// But a request for exactly the 2 remaining must succeed.
			d, err = tc.l.Increment(ctx, key, policy, 2)
			if err != nil {
				t.Fatalf("Increment(2): %v", err)
			}
			if !d.Allowed || d.Remaining != 0 {
				t.Fatalf("Increment(2) with 2 tokens left = %+v, want allowed with remaining=0", d)
			}
		})
	}
}

func TestStoreGetNeverConsumes(t *testing.T) {
	clock := &fakeLimiterClock{now: time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)}
	policy := PolicyPreset{RequestsPerSecond: 10, Burst: 4}
	ctx := context.Background()

	for _, tc := range newStoreFixtures(clock) {
		t.Run(tc.name, func(t *testing.T) {
			key := "k-" + tc.name

			before, err := tc.l.Get(ctx, key, policy)
			if err != nil {
				t.Fatalf("Get (unseen key): %v", err)
			}
			if before.Tokens != float64(policy.Burst) {
				t.Fatalf("Get on unseen key = %+v, want full bucket (%d)", before, policy.Burst)
			}

			// Repeated Get must not change the bucket.
			for i := 0; i < 5; i++ {
				if _, err := tc.l.Get(ctx, key, policy); err != nil {
					t.Fatalf("Get iteration %d: %v", i, err)
				}
			}

			after, err := tc.l.Get(ctx, key, policy)
			if err != nil {
				t.Fatalf("Get after repeated reads: %v", err)
			}
			if after.Tokens != before.Tokens {
				t.Fatalf("Get must never consume: before=%v after=%v", before.Tokens, after.Tokens)
			}

			// Now actually consume, and confirm Get reflects it.
			if _, err := tc.l.Increment(ctx, key, policy, 1); err != nil {
				t.Fatalf("Increment: %v", err)
			}
			afterConsume, err := tc.l.Get(ctx, key, policy)
			if err != nil {
				t.Fatalf("Get after Increment: %v", err)
			}
			if afterConsume.Tokens >= before.Tokens {
				t.Fatalf("Get after Increment should show fewer tokens: before=%v after=%v", before.Tokens, afterConsume.Tokens)
			}
		})
	}
}

func TestStoreResetRefillsBucket(t *testing.T) {
	clock := &fakeLimiterClock{now: time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)}
	policy := PolicyPreset{RequestsPerSecond: 10, Burst: 2}
	ctx := context.Background()

	for _, tc := range newStoreFixtures(clock) {
		t.Run(tc.name, func(t *testing.T) {
			key := "k-" + tc.name

			// Drain the bucket.
			for i := 0; i < 2; i++ {
				d, err := tc.l.Increment(ctx, key, policy, 1)
				if err != nil || !d.Allowed {
					t.Fatalf("drain call %d: %+v err=%v", i, d, err)
				}
			}
			d, err := tc.l.Increment(ctx, key, policy, 1)
			if err != nil {
				t.Fatalf("Increment after drain: %v", err)
			}
			if d.Allowed {
				t.Fatal("bucket should be empty after draining burst")
			}

			if err := tc.l.Reset(ctx, key); err != nil {
				t.Fatalf("Reset: %v", err)
			}

			d, err = tc.l.Increment(ctx, key, policy, 1)
			if err != nil {
				t.Fatalf("Increment after Reset: %v", err)
			}
			if !d.Allowed || d.Remaining != policy.Burst-1 {
				t.Fatalf("Increment after Reset = %+v, want allowed with remaining=%d", d, policy.Burst-1)
			}
		})
	}
}
