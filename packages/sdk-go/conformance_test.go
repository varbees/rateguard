package rateguard

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"
)

type conformanceVectors struct {
	Policy struct {
		RequestsPerSecond int `json:"requests_per_second"`
		Burst             int `json:"burst"`
	} `json:"policy"`
	Steps []struct {
		Note         string  `json:"note"`
		AdvanceMs    int64   `json:"advance_ms"`
		N            float64 `json:"n"`
		Allowed      bool    `json:"allowed"`
		Remaining    int     `json:"remaining"`
		RetryAfterMs int64   `json:"retry_after_ms"`
	} `json:"steps"`
}

func loadConformanceVectors(t *testing.T) conformanceVectors {
	t.Helper()
	data, err := os.ReadFile("../../conformance/token_bucket_vectors.json")
	if err != nil {
		t.Fatalf("read shared conformance vectors: %v", err)
	}
	var v conformanceVectors
	if err := json.Unmarshal(data, &v); err != nil {
		t.Fatalf("parse shared conformance vectors: %v", err)
	}
	return v
}

// TestConformanceTokenBucket replays the same admission sequence used by the
// Node and Python SDKs against the shared oracle in
// conformance/token_bucket_vectors.json, for every in-process Store
// implementation. A failure here means Go has drifted from the documented
// cross-language behavior — not just from its own past test suite.
func TestConformanceTokenBucket(t *testing.T) {
	vectors := loadConformanceVectors(t)
	policy := PolicyPreset{
		RequestsPerSecond: vectors.Policy.RequestsPerSecond,
		Burst:             vectors.Policy.Burst,
	}
	ctx := context.Background()

	type fixture struct {
		name  string
		clock *fakeLimiterClock
		l     Store
	}
	newClock := func() *fakeLimiterClock {
		return &fakeLimiterClock{now: time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)}
	}
	memClock, shardClock := newClock(), newClock()
	stores := []fixture{
		{"memory", memClock, newMemoryLimiterWithClock(memClock, 1000)},
		{"sharded", shardClock, newShardedLimiterWithClock(shardClock, 1000)},
	}

	for _, tc := range stores {
		t.Run(tc.name, func(t *testing.T) {
			for i, step := range vectors.Steps {
				tc.clock.advance(time.Duration(step.AdvanceMs) * time.Millisecond)
				d, err := tc.l.Increment(ctx, "conformance-key", policy, step.N)
				if err != nil {
					t.Fatalf("step %d (%s): %v", i, step.Note, err)
				}
				if d.Allowed != step.Allowed {
					t.Fatalf("step %d (%s): allowed = %v, want %v", i, step.Note, d.Allowed, step.Allowed)
				}
				if d.Allowed && d.Remaining != step.Remaining {
					t.Fatalf("step %d (%s): remaining = %d, want %d", i, step.Note, d.Remaining, step.Remaining)
				}
				if !d.Allowed && d.RetryAfter.Milliseconds() != step.RetryAfterMs {
					t.Fatalf("step %d (%s): retry_after_ms = %d, want %d", i, step.Note, d.RetryAfter.Milliseconds(), step.RetryAfterMs)
				}
			}
		})
	}
}
