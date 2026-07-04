package rateguard

import (
	"context"
	"fmt"
	"math/rand"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type fakeLimiterClock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *fakeLimiterClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *fakeLimiterClock) advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
}

func TestShardedLimiterBasicAdmission(t *testing.T) {
	clock := &fakeLimiterClock{now: time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)}
	l := newShardedLimiterWithClock(clock, 1000)
	policy := PolicyPreset{RequestsPerSecond: 10, Burst: 3}
	ctx := context.Background()

	// Fresh key: full burst, consume down to deny.
	for i := 0; i < 3; i++ {
		d, err := l.Allow(ctx, "k", policy)
		if err != nil || !d.Allowed {
			t.Fatalf("call %d: expected allow, got %+v err=%v", i, d, err)
		}
		if want := 2 - i; d.Remaining != want {
			t.Fatalf("call %d: remaining = %d, want %d", i, d.Remaining, want)
		}
	}

	d, _ := l.Allow(ctx, "k", policy)
	if d.Allowed {
		t.Fatalf("expected deny after burst exhausted, got %+v", d)
	}
	if d.RetryAfter <= 0 {
		t.Fatalf("deny must carry positive RetryAfter, got %v", d.RetryAfter)
	}

	// Refill: 100ms at 10 rps = 1 token.
	clock.advance(100 * time.Millisecond)
	d, _ = l.Allow(ctx, "k", policy)
	if !d.Allowed {
		t.Fatalf("expected allow after refill, got %+v", d)
	}
}

func TestShardedLimiterUnlimitedPolicy(t *testing.T) {
	l := NewShardedLimiter()
	d, err := l.Allow(context.Background(), "k", PolicyPreset{})
	if err != nil || !d.Allowed || d.Applied {
		t.Fatalf("zero policy must be allowed+unapplied, got %+v err=%v", d, err)
	}
}

func TestShardedLimiterPeekNeverCreatesState(t *testing.T) {
	clock := &fakeLimiterClock{now: time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)}
	l := newShardedLimiterWithClock(clock, 1000)
	policy := PolicyPreset{RequestsPerSecond: 5, Burst: 2}
	ctx := context.Background()

	d, err := l.Peek(ctx, "ghost", policy)
	if err != nil || !d.Allowed || d.Remaining != policy.Burst {
		t.Fatalf("peek on unseen key: got %+v err=%v", d, err)
	}
	if bucket := l.bucketFor("ghost", false); bucket != nil {
		t.Fatal("Peek must not create bucket state")
	}

	// Peek must not consume.
	if _, err := l.Allow(ctx, "ghost", policy); err != nil {
		t.Fatal(err)
	}
	before, _ := l.Peek(ctx, "ghost", policy)
	again, _ := l.Peek(ctx, "ghost", policy)
	if before.Remaining != again.Remaining {
		t.Fatalf("peek consumed state: %d vs %d", before.Remaining, again.Remaining)
	}
}

// TestShardedLimiterParityWithMemoryLimiter drives both limiters through the
// same randomized schedule of admissions and clock jumps and requires
// decision-for-decision agreement — the sharded limiter is a drop-in
// replacement, not a different algorithm.
func TestShardedLimiterParityWithMemoryLimiter(t *testing.T) {
	rng := rand.New(rand.NewSource(42))
	ctx := context.Background()

	policies := []PolicyPreset{
		{RequestsPerSecond: 1, Burst: 1},
		{RequestsPerSecond: 10, Burst: 3},
		{RequestsPerSecond: 100, Burst: 200},
		{RequestsPerSecond: 7, Burst: 13}, // non-divisible refill interval
	}

	for pi, policy := range policies {
		clockA := &fakeLimiterClock{now: time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)}
		clockB := &fakeLimiterClock{now: clockA.now}
		memory := newMemoryLimiterWithClock(clockA, 1000)
		sharded := newShardedLimiterWithClock(clockB, 1000)

		for step := 0; step < 2000; step++ {
			if rng.Intn(4) == 0 {
				jump := time.Duration(rng.Intn(2500)) * time.Millisecond
				clockA.advance(jump)
				clockB.advance(jump)
			}
			key := fmt.Sprintf("key-%d", rng.Intn(3))

			var a, b AdmissionDecision
			if rng.Intn(5) == 0 {
				a, _ = memory.Peek(ctx, key, policy)
				b, _ = sharded.Peek(ctx, key, policy)
			} else {
				a, _ = memory.Allow(ctx, key, policy)
				b, _ = sharded.Allow(ctx, key, policy)
			}

			if a.Allowed != b.Allowed || a.Remaining != b.Remaining || a.RetryAfter != b.RetryAfter {
				t.Fatalf("policy %d step %d key %s: memory=%+v sharded=%+v", pi, step, key, a, b)
			}
		}
	}
}

// TestShardedLimiterNoOverAdmission hammers one key from many goroutines and
// checks the core safety property: admissions never exceed burst + refill.
func TestShardedLimiterNoOverAdmission(t *testing.T) {
	l := NewShardedLimiter() // real clock — the race is the point
	policy := PolicyPreset{RequestsPerSecond: 50, Burst: 100}
	ctx := context.Background()

	const goroutines = 32
	const perGoroutine = 200

	var allowed atomic.Int64
	start := time.Now()
	var wg sync.WaitGroup
	for g := 0; g < goroutines; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < perGoroutine; i++ {
				d, err := l.Allow(ctx, "hot", policy)
				if err != nil {
					t.Error(err)
					return
				}
				if d.Allowed {
					allowed.Add(1)
				}
			}
		}()
	}
	wg.Wait()
	elapsed := time.Since(start)

	// Upper bound: initial burst + refill during the run (+1 tolerance for
	// the boundary token in flight when timing was captured).
	maxAllowed := int64(policy.Burst) + int64(elapsed.Seconds()*float64(policy.RequestsPerSecond)) + 1
	if got := allowed.Load(); got > maxAllowed {
		t.Fatalf("over-admission under contention: allowed %d > bound %d (elapsed %v)", got, maxAllowed, elapsed)
	}
	if allowed.Load() < int64(policy.Burst) {
		t.Fatalf("under-admission: burst tokens not granted, got %d", allowed.Load())
	}
}

func TestShardedLimiterBoundedMemory(t *testing.T) {
	clock := &fakeLimiterClock{now: time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)}
	capacity := 640 // 10 per shard
	l := newShardedLimiterWithClock(clock, capacity)
	policy := PolicyPreset{RequestsPerSecond: 100, Burst: 100}
	ctx := context.Background()

	for i := 0; i < capacity*10; i++ {
		if _, err := l.Allow(ctx, fmt.Sprintf("key-%d", i), policy); err != nil {
			t.Fatal(err)
		}
	}

	total := 0
	for i := range l.shards {
		l.shards[i].mu.Lock()
		total += l.shards[i].buckets.len()
		l.shards[i].mu.Unlock()
	}
	if total > capacity {
		t.Fatalf("bucket count %d exceeds capacity %d — eviction broken", total, capacity)
	}
}

func TestShardedLimiterIdleRefillsToFull(t *testing.T) {
	clock := &fakeLimiterClock{now: time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)}
	l := newShardedLimiterWithClock(clock, 1000)
	policy := PolicyPreset{RequestsPerSecond: 1, Burst: 5}
	ctx := context.Background()

	for i := 0; i < 5; i++ {
		l.Allow(ctx, "k", policy)
	}
	if d, _ := l.Allow(ctx, "k", policy); d.Allowed {
		t.Fatal("bucket should be empty")
	}

	clock.advance(11 * time.Minute) // long idle
	d, _ := l.Allow(ctx, "k", policy)
	if !d.Allowed || d.Remaining != policy.Burst-1 {
		t.Fatalf("idle bucket must refill to full burst, got %+v", d)
	}
}

// --- Benchmarks: the reason this limiter exists -------------------------

func benchmarkLimiter(b *testing.B, l Limiter, keys int) {
	policy := PolicyPreset{RequestsPerSecond: 1_000_000, Burst: 1_000_000}
	ctx := context.Background()
	keyset := make([]string, keys)
	for i := range keyset {
		keyset[i] = fmt.Sprintf("tenant-%d", i)
	}

	b.ReportAllocs()
	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		i := 0
		for pb.Next() {
			_, _ = l.Allow(ctx, keyset[i%keys], policy)
			i++
		}
	})
}

func BenchmarkMemoryLimiterHotKey(b *testing.B)    { benchmarkLimiter(b, NewMemoryLimiter(), 1) }
func BenchmarkShardedLimiterHotKey(b *testing.B)   { benchmarkLimiter(b, NewShardedLimiter(), 1) }
func BenchmarkMemoryLimiterManyKeys(b *testing.B)  { benchmarkLimiter(b, NewMemoryLimiter(), 1024) }
func BenchmarkShardedLimiterManyKeys(b *testing.B) { benchmarkLimiter(b, NewShardedLimiter(), 1024) }
