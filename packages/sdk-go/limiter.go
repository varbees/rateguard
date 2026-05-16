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
}

// NoopLimiter never rejects and reports that no limiting was applied.
type NoopLimiter struct{}

func (NoopLimiter) Allow(context.Context, string, PolicyPreset) (AdmissionDecision, error) {
	return AdmissionDecision{Allowed: true, Applied: false, Remaining: -1, Limit: -1}, nil
}

type memoryBucket struct {
	mu     sync.Mutex
	tokens float64
	last   time.Time
}

// MemoryLimiter uses an in-process token bucket per key.
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

func (l *MemoryLimiter) Allow(_ context.Context, key string, policy PolicyPreset) (AdmissionDecision, error) {
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

	if bucket.tokens < 1 {
		retry := time.Duration(math.Ceil((1.0-bucket.tokens)/float64(policy.RequestsPerSecond)) * float64(time.Second))
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

	bucket.tokens--
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
