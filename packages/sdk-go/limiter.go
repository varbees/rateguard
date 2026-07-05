package rateguard

import (
	"context"
	"math"
	"sync"
	"time"
)

const defaultMemoryLimiterCacheCapacity = 50000

// AdmissionDecision captures a single request admission outcome.
type AdmissionDecision struct {
	Allowed    bool
	Applied    bool
	Remaining  int
	RetryAfter time.Duration
	Limit      int
}

// Limiter decides whether a request can proceed.
type Limiter interface {
	Allow(ctx context.Context, key string, policy PolicyPreset) (AdmissionDecision, error)
	// Peek reports the decision Allow would make without consuming a token.
	// Pre-flight queries (MCP tools, dashboards) must use Peek, never Allow.
	Peek(ctx context.Context, key string, policy PolicyPreset) (AdmissionDecision, error)
}

// BucketState is the raw, read-only state of a bucket for one key — the
// facts a Limiter's decision is computed from, without the allow/deny framing.
type BucketState struct {
	Tokens   float64
	Capacity int
	Limit    int
}

// Store is the composable primitive underneath a Limiter. Allow is exactly
// Increment(ctx, key, policy, 1); Store exposes the building blocks directly
// for callers who need something Allow/Peek can't express: consuming a
// variable cost in one atomic step (an LLM call billed by estimated token
// count rather than by call count), or clearing a key outright.
//
// A Limiter implementation may optionally implement Store; callers use a
// type assertion (`store, ok := limiter.(rateguard.Store)`) to reach it.
// This keeps Store fully additive — nothing about the Limiter interface or
// existing callers changes.
type Store interface {
	// Get returns the current bucket state for key without consuming anything.
	Get(ctx context.Context, key string, policy PolicyPreset) (BucketState, error)
	// Increment consumes n units atomically (n may be fractional or > 1) and
	// reports the resulting decision. Increment(ctx, key, policy, 1) behaves
	// identically to Allow.
	Increment(ctx context.Context, key string, policy PolicyPreset, n float64) (AdmissionDecision, error)
	// Reset clears key's bucket; the next access starts from a full bucket.
	Reset(ctx context.Context, key string) error
}

// NoopLimiter never rejects and reports that no limiting was applied.
type NoopLimiter struct{}

func (NoopLimiter) Allow(context.Context, string, PolicyPreset) (AdmissionDecision, error) {
	return AdmissionDecision{Allowed: true, Applied: false, Remaining: -1, Limit: -1}, nil
}

func (NoopLimiter) Peek(context.Context, string, PolicyPreset) (AdmissionDecision, error) {
	return AdmissionDecision{Allowed: true, Applied: false, Remaining: -1, Limit: -1}, nil
}

type memoryBucket struct {
	mu     sync.Mutex
	tokens float64
	last   time.Time
}

// MemoryLimiter uses an in-process token bucket per key.
//
// Algorithm: Token Bucket (RFC standards track, used by Kong, Envoy, AWS API Gateway)
//
//	max_tokens = burst (bucket capacity)
//	refill_rate = requests_per_second (tokens added per second)
//	refill: tokens = min(burst, tokens + elapsed × rps)
//	allow:  tokens >= 1.0 → consume 1 token
//	deny:   retry_after = ceil((1.0 - tokens) / rps) seconds
//
// Source: https://en.wikipedia.org/wiki/Token_bucket
type MemoryLimiter struct {
	mu      sync.Mutex
	buckets *boundedCache[string, *memoryBucket]
	clock   Clock
}

// NewMemoryLimiter creates a limiter that stores counters locally.
func NewMemoryLimiter() *MemoryLimiter {
	return newMemoryLimiterWithClock(systemClock{}, defaultMemoryLimiterCacheCapacity)
}

func newMemoryLimiterWithCapacity(capacity int) *MemoryLimiter {
	return newMemoryLimiterWithClock(systemClock{}, capacity)
}

func newMemoryLimiterWithClock(clock Clock, capacity int) *MemoryLimiter {
	if clock == nil {
		clock = systemClock{}
	}

	return &MemoryLimiter{
		buckets: newBoundedCache[string, *memoryBucket](capacity),
		clock:   clock,
	}
}

func (l *MemoryLimiter) Allow(ctx context.Context, key string, policy PolicyPreset) (AdmissionDecision, error) {
	return l.Increment(ctx, key, policy, 1)
}

// Increment consumes n tokens atomically. Allow is Increment(ctx, key, policy, 1).
func (l *MemoryLimiter) Increment(_ context.Context, key string, policy PolicyPreset, n float64) (AdmissionDecision, error) {
	if policy.RequestsPerSecond <= 0 || policy.Burst <= 0 {
		return AdmissionDecision{Allowed: true, Applied: false, Remaining: -1, Limit: -1}, nil
	}

	clock := l.clock
	if clock == nil {
		clock = systemClock{}
	}
	now := clock.Now().UTC()

	l.mu.Lock()
	if l.buckets == nil {
		l.buckets = newBoundedCache[string, *memoryBucket](defaultMemoryLimiterCacheCapacity)
	}

	bucket := l.buckets.getOrCreate(key, func() *memoryBucket {
		return &memoryBucket{
			tokens: float64(policy.Burst),
			last:   now,
		}
	})
	l.mu.Unlock()

	bucket.mu.Lock()
	defer bucket.mu.Unlock()

	if now.Sub(bucket.last) > 10*time.Minute {
		bucket.tokens = float64(policy.Burst)
		bucket.last = now
	}

	elapsed := now.Sub(bucket.last).Seconds()
	if elapsed > 0 {
		refill := elapsed * float64(policy.RequestsPerSecond)
		bucket.tokens = math.Min(float64(policy.Burst), bucket.tokens+refill)
		bucket.last = now
	}

	if bucket.tokens < n {
		retry := time.Duration(math.Ceil((n-bucket.tokens)/float64(policy.RequestsPerSecond)) * float64(time.Second))
		if retry < 0 {
			retry = time.Second
		}
		return AdmissionDecision{
			Allowed:    false,
			Applied:    true,
			Remaining:  0,
			RetryAfter: retry,
			Limit:      policy.RequestsPerSecond,
		}, nil
	}

	bucket.tokens -= n
	remaining := int(math.Floor(bucket.tokens))
	if remaining < 0 {
		remaining = 0
	}

	return AdmissionDecision{
		Allowed:   true,
		Applied:   true,
		Remaining: remaining,
		Limit:     policy.RequestsPerSecond,
	}, nil
}

// Get returns the current bucket state for key without consuming anything.
// It never creates bucket state for unseen keys.
func (l *MemoryLimiter) Get(_ context.Context, key string, policy PolicyPreset) (BucketState, error) {
	clock := l.clock
	if clock == nil {
		clock = systemClock{}
	}
	now := clock.Now().UTC()

	l.mu.Lock()
	var bucket *memoryBucket
	if l.buckets != nil {
		bucket, _ = l.buckets.get(key)
	}
	l.mu.Unlock()

	if bucket == nil {
		return BucketState{Tokens: float64(policy.Burst), Capacity: policy.Burst, Limit: policy.RequestsPerSecond}, nil
	}

	bucket.mu.Lock()
	tokens := bucket.tokens
	last := bucket.last
	bucket.mu.Unlock()

	if now.Sub(last) > 10*time.Minute {
		tokens = float64(policy.Burst)
	} else if elapsed := now.Sub(last).Seconds(); elapsed > 0 {
		tokens = math.Min(float64(policy.Burst), tokens+elapsed*float64(policy.RequestsPerSecond))
	}

	return BucketState{Tokens: tokens, Capacity: policy.Burst, Limit: policy.RequestsPerSecond}, nil
}

// Reset clears key's bucket; the next access starts from a full bucket.
func (l *MemoryLimiter) Reset(_ context.Context, key string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.buckets != nil {
		l.buckets.delete(key)
	}
	return nil
}

// Peek reports what Allow would decide right now without consuming a token.
// It never creates bucket state for unseen keys.
func (l *MemoryLimiter) Peek(_ context.Context, key string, policy PolicyPreset) (AdmissionDecision, error) {
	if policy.RequestsPerSecond <= 0 || policy.Burst <= 0 {
		return AdmissionDecision{Allowed: true, Applied: false, Remaining: -1, Limit: -1}, nil
	}

	clock := l.clock
	if clock == nil {
		clock = systemClock{}
	}
	now := clock.Now().UTC()

	l.mu.Lock()
	var bucket *memoryBucket
	if l.buckets != nil {
		bucket, _ = l.buckets.get(key)
	}
	l.mu.Unlock()

	if bucket == nil {
		return AdmissionDecision{
			Allowed:   true,
			Applied:   true,
			Remaining: policy.Burst,
			Limit:     policy.RequestsPerSecond,
		}, nil
	}

	bucket.mu.Lock()
	tokens := bucket.tokens
	last := bucket.last
	bucket.mu.Unlock()

	if now.Sub(last) > 10*time.Minute {
		tokens = float64(policy.Burst)
	} else if elapsed := now.Sub(last).Seconds(); elapsed > 0 {
		tokens = math.Min(float64(policy.Burst), tokens+elapsed*float64(policy.RequestsPerSecond))
	}

	if tokens < 1 {
		retry := time.Duration(math.Ceil((1.0-tokens)/float64(policy.RequestsPerSecond)) * float64(time.Second))
		if retry < 0 {
			retry = time.Second
		}
		return AdmissionDecision{
			Allowed:    false,
			Applied:    true,
			Remaining:  0,
			RetryAfter: retry,
			Limit:      policy.RequestsPerSecond,
		}, nil
	}

	return AdmissionDecision{
		Allowed:   true,
		Applied:   true,
		Remaining: int(math.Floor(tokens)),
		Limit:     policy.RequestsPerSecond,
	}, nil
}
