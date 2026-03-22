package rateguard

import (
	"context"
	"math"
	"sync"
	"time"
)

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
	tokens float64
	last   time.Time
}

// MemoryLimiter uses an in-process token bucket per key.
type MemoryLimiter struct {
	mu      sync.Mutex
	buckets map[string]*memoryBucket
}

// NewMemoryLimiter creates a limiter that stores counters locally.
func NewMemoryLimiter() *MemoryLimiter {
	return &MemoryLimiter{
		buckets: make(map[string]*memoryBucket),
	}
}

func (l *MemoryLimiter) Allow(_ context.Context, key string, policy PolicyPreset) (AdmissionDecision, error) {
	if policy.RequestsPerSecond <= 0 || policy.Burst <= 0 {
		return AdmissionDecision{Allowed: true, Applied: false, Remaining: -1, Limit: -1}, nil
	}

	now := time.Now().UTC()

	l.mu.Lock()
	defer l.mu.Unlock()

	bucket := l.buckets[key]
	if bucket == nil {
		bucket = &memoryBucket{
			tokens: float64(policy.Burst),
			last:   now,
		}
		l.buckets[key] = bucket
	}

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
