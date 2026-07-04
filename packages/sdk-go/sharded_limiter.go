package rateguard

import (
	"context"
	"math"
	"sync"
	"sync/atomic"
	"time"
)

// shardCount partitions the key space so bucket lookups on different keys
// never contend on the same lock. Must be a power of two.
const shardCount = 64

// ShardedLimiter is a lock-free, sharded token bucket limiter.
//
// It makes the same decisions as MemoryLimiter (identical token bucket math,
// identical Retry-After rounding) but removes both contention points of the
// mutex design:
//
//   - the global cache mutex becomes 64 shard mutexes, held only for the
//     map lookup — different keys almost never contend;
//   - the per-bucket mutex disappears entirely: bucket state is a single
//     atomic int64 updated with a CAS loop, so admissions on one hot key
//     proceed without any lock (the pattern proven by uber-go/ratelimit's
//     atomicInt64Limiter).
//
// The whole bucket state — (tokens, last refill time) — is encoded losslessly
// as one number: fullAtNanos, the instant the bucket would refill completely.
//
//	tokens(now) = burst − max(0, fullAt − now) × rps / 1e9
//	consume 1   = fullAt' = now + (burst − (tokens−1)) / rps × 1e9
//
// The zero value (fullAt = 0, i.e. the distant past) encodes a full bucket,
// so freshly created buckets need no initialization write. An idle bucket
// refills to full by construction, which subsumes MemoryLimiter's 10-minute
// idle reset.
type ShardedLimiter struct {
	shards [shardCount]limiterShard
	clock  Clock
}

type limiterShard struct {
	mu      sync.Mutex
	buckets *boundedCache[string, *atomicBucket]
}

// atomicBucket holds fullAtNanos. Padding keeps a hot bucket on its own cache
// line so CAS traffic does not false-share with neighboring allocations
// (same layout rationale as uber-go/ratelimit).
type atomicBucket struct {
	_      [64]byte //nolint:unused // cache-line padding
	fullAt atomic.Int64
	_      [56]byte //nolint:unused // cache-line padding
}

// NewShardedLimiter creates the lock-free in-process limiter used by default.
func NewShardedLimiter() *ShardedLimiter {
	return newShardedLimiterWithClock(systemClock{}, defaultMemoryLimiterCacheCapacity)
}

func newShardedLimiterWithClock(clock Clock, capacity int) *ShardedLimiter {
	if clock == nil {
		clock = systemClock{}
	}
	if capacity <= 0 {
		capacity = defaultMemoryLimiterCacheCapacity
	}

	perShard := capacity / shardCount
	if perShard <= 0 {
		perShard = 1
	}

	l := &ShardedLimiter{clock: clock}
	for i := range l.shards {
		l.shards[i].buckets = newBoundedCache[string, *atomicBucket](perShard)
	}
	return l
}

// shardFor hashes the key with FNV-1a (inlined: zero allocations) and masks
// into the shard array.
func (l *ShardedLimiter) shardFor(key string) *limiterShard {
	const (
		offset64 = 14695981039346656037
		prime64  = 1099511628211
	)
	var h uint64 = offset64
	for i := 0; i < len(key); i++ {
		h ^= uint64(key[i])
		h *= prime64
	}
	return &l.shards[h&(shardCount-1)]
}

func (l *ShardedLimiter) bucketFor(key string, create bool) *atomicBucket {
	shard := l.shardFor(key)
	shard.mu.Lock()
	defer shard.mu.Unlock()

	if !create {
		bucket, _ := shard.buckets.get(key)
		return bucket
	}
	return shard.buckets.getOrCreate(key, func() *atomicBucket {
		return &atomicBucket{} // zero value = full bucket
	})
}

// tokensAt reports the current token count encoded by fullAt at time now.
func tokensAt(fullAtNanos, nowNanos int64, policy PolicyPreset) float64 {
	deficit := fullAtNanos - nowNanos
	if deficit <= 0 {
		return float64(policy.Burst)
	}
	tokens := float64(policy.Burst) - float64(deficit)/1e9*float64(policy.RequestsPerSecond)
	if tokens < 0 {
		return 0
	}
	return tokens
}

// denyDecision mirrors MemoryLimiter's Retry-After rounding exactly:
// whole seconds, ceil((1 − tokens) / rps).
func denyDecision(tokens float64, policy PolicyPreset) AdmissionDecision {
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
	}
}

func (l *ShardedLimiter) Allow(_ context.Context, key string, policy PolicyPreset) (AdmissionDecision, error) {
	if policy.RequestsPerSecond <= 0 || policy.Burst <= 0 {
		return AdmissionDecision{Allowed: true, Applied: false, Remaining: -1, Limit: -1}, nil
	}

	clock := l.clock
	if clock == nil {
		clock = systemClock{}
	}
	now := clock.Now().UTC().UnixNano()

	bucket := l.bucketFor(key, true)

	for {
		fullAt := bucket.fullAt.Load()
		tokens := tokensAt(fullAt, now, policy)

		if tokens < 1 {
			// Denials do not consume and need no state write: the deficit
			// encoded in fullAt already represents the refilled state.
			return denyDecision(tokens, policy), nil
		}

		newTokens := tokens - 1
		newFullAt := now + int64((float64(policy.Burst)-newTokens)/float64(policy.RequestsPerSecond)*1e9)

		if bucket.fullAt.CompareAndSwap(fullAt, newFullAt) {
			remaining := int(math.Floor(newTokens))
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
		// Lost the race to a concurrent admission — reload and retry.
	}
}

// Peek reports what Allow would decide right now without consuming a token.
// It never creates bucket state for unseen keys.
func (l *ShardedLimiter) Peek(_ context.Context, key string, policy PolicyPreset) (AdmissionDecision, error) {
	if policy.RequestsPerSecond <= 0 || policy.Burst <= 0 {
		return AdmissionDecision{Allowed: true, Applied: false, Remaining: -1, Limit: -1}, nil
	}

	clock := l.clock
	if clock == nil {
		clock = systemClock{}
	}
	now := clock.Now().UTC().UnixNano()

	bucket := l.bucketFor(key, false)
	if bucket == nil {
		return AdmissionDecision{
			Allowed:   true,
			Applied:   true,
			Remaining: policy.Burst,
			Limit:     policy.RequestsPerSecond,
		}, nil
	}

	tokens := tokensAt(bucket.fullAt.Load(), now, policy)
	if tokens < 1 {
		return denyDecision(tokens, policy), nil
	}

	return AdmissionDecision{
		Allowed:   true,
		Applied:   true,
		Remaining: int(math.Floor(tokens)),
		Limit:     policy.RequestsPerSecond,
	}, nil
}
