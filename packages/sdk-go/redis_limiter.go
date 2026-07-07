package rateguard

import (
	"context"
	"fmt"
	"time"
)

const luaRedisGCRARateLimitScript = `
local tatRaw = redis.call('GET', KEYS[1])
local nowUs = tonumber(ARGV[3])
local intervalUs = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])
local ttlMs = tonumber(ARGV[4])

if intervalUs == nil or burst == nil or nowUs == nil or ttlMs == nil or intervalUs <= 0 or burst <= 0 then
    return {1, 0, 0, 0}
end

local tat = nowUs
if tatRaw ~= false and tatRaw ~= nil then
    tat = tonumber(tatRaw) or nowUs
end

local tolerance = (burst - 1) * intervalUs
local allowAt = tat - tolerance

if nowUs < allowAt then
    -- Rounds to the nearest WHOLE SECOND (not millisecond) to match the
    -- in-memory limiter's retry_after semantics (AGENTS.md rule 13) — a
    -- deployment switching from in-process to Redis must not see deny
    -- behavior silently change.
    local retryAfterMs = math.ceil((allowAt - nowUs) / 1000000) * 1000
    return {0, 0, retryAfterMs, 1}
end

local newTat = math.max(tat, nowUs) + intervalUs
redis.call('SET', KEYS[1], tostring(newTat), 'PX', ttlMs)

local remaining = math.max(math.floor(((burst * intervalUs) - (newTat - nowUs)) / intervalUs), 0)
return {1, remaining, 0, 0}
`

// Read-only variant: reports what the GCRA would decide without advancing
// the theoretical arrival time. Used by Peek (pre-flight queries).
const luaRedisGCRAPeekScript = `
local tatRaw = redis.call('GET', KEYS[1])
local nowUs = tonumber(ARGV[3])
local intervalUs = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])

if intervalUs == nil or burst == nil or nowUs == nil or intervalUs <= 0 or burst <= 0 then
    return {1, 0, 0, 0}
end

local tat = nowUs
if tatRaw ~= false and tatRaw ~= nil then
    tat = tonumber(tatRaw) or nowUs
end

local tolerance = (burst - 1) * intervalUs
local allowAt = tat - tolerance

if nowUs < allowAt then
    -- Rounds to the nearest WHOLE SECOND (not millisecond) to match the
    -- in-memory limiter's retry_after semantics (AGENTS.md rule 13) — a
    -- deployment switching from in-process to Redis must not see deny
    -- behavior silently change.
    local retryAfterMs = math.ceil((allowAt - nowUs) / 1000000) * 1000
    return {0, 0, retryAfterMs, 1}
end

local wouldTat = math.max(tat, nowUs) + intervalUs
local remaining = math.max(math.floor(((burst * intervalUs) - (wouldTat - nowUs)) / intervalUs), 0)
return {1, remaining, 0, 0}
`

// Generalized GCRA: consumes n cells atomically instead of exactly one.
// n=1 reduces to luaRedisGCRARateLimitScript exactly (tolerance = (burst-1)*interval,
// newTat = tat + interval); see redis_limiter_test.go for the equivalence check.
const luaRedisGCRAIncrementScript = `
local tatRaw = redis.call('GET', KEYS[1])
local nowUs = tonumber(ARGV[3])
local intervalUs = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])
local ttlMs = tonumber(ARGV[4])
local n = tonumber(ARGV[5])

if intervalUs == nil or burst == nil or nowUs == nil or ttlMs == nil or n == nil or intervalUs <= 0 or burst <= 0 or n < 0 then
    return {1, 0, 0, 0}
end

local tat = nowUs
if tatRaw ~= false and tatRaw ~= nil then
    tat = tonumber(tatRaw) or nowUs
end

local tolerance = (burst - n) * intervalUs
local allowAt = tat - tolerance

if nowUs < allowAt then
    -- Rounds to the nearest WHOLE SECOND (not millisecond) to match the
    -- in-memory limiter's retry_after semantics (AGENTS.md rule 13) — a
    -- deployment switching from in-process to Redis must not see deny
    -- behavior silently change.
    local retryAfterMs = math.ceil((allowAt - nowUs) / 1000000) * 1000
    return {0, 0, retryAfterMs, 1}
end

local newTat = math.max(tat, nowUs) + n * intervalUs
redis.call('SET', KEYS[1], tostring(newTat), 'PX', ttlMs)

local remaining = math.max(math.floor(((burst * intervalUs) - (newTat - nowUs)) / intervalUs), 0)
return {1, remaining, 0, 0}
`

const luaRedisGCRAResetScript = `
redis.call('DEL', KEYS[1])
return 1
`

type RedisGCRALimiter struct {
	client RedisLimiterClient
	clock  Clock
}

func newRedisGCRALimiterWithClock(client RedisLimiterClient, clock Clock) Limiter {
	if clock == nil {
		clock = systemClock{}
	}
	return &RedisGCRALimiter{client: client, clock: clock}
}

// NewRedisGCRALimiter builds a Redis-backed distributed rate limiter
// directly — the same atomic Lua GCRA that Config.RedisClient wires in
// implicitly, exported standalone so Go callers can reach it the same way
// Node's RedisGCRALimiter class and Python's RedisGCRALimiter class already
// are (this was previously the one language where a user couldn't obtain
// the Redis-backed Store without going through New(Config{RedisClient: ...})).
// Returns the concrete type (matching NewMemoryLimiter/NewShardedLimiter's
// pattern) so callers get Get/Increment/Reset (Store) in addition to
// Allow/Peek (Limiter) without a type assertion — see limiter.go.
func NewRedisGCRALimiter(client RedisLimiterClient) *RedisGCRALimiter {
	return &RedisGCRALimiter{client: client, clock: systemClock{}}
}

func (l *RedisGCRALimiter) Allow(ctx context.Context, key string, policy PolicyPreset) (AdmissionDecision, error) {
	return l.eval(ctx, key, policy, luaRedisGCRARateLimitScript)
}

// Peek reports what Allow would decide without advancing GCRA state.
func (l *RedisGCRALimiter) Peek(ctx context.Context, key string, policy PolicyPreset) (AdmissionDecision, error) {
	return l.eval(ctx, key, policy, luaRedisGCRAPeekScript)
}

// Get returns the current bucket state for key without consuming anything.
func (l *RedisGCRALimiter) Get(ctx context.Context, key string, policy PolicyPreset) (BucketState, error) {
	decision, err := l.Peek(ctx, key, policy)
	if err != nil {
		return BucketState{}, err
	}
	tokens := float64(decision.Remaining)
	if !decision.Allowed {
		tokens = 0
	}
	return BucketState{Tokens: tokens, Capacity: policy.Burst, Limit: policy.RequestsPerSecond}, nil
}

// Increment consumes n cells atomically via the generalized GCRA script.
// Increment(ctx, key, policy, 1) behaves identically to Allow.
func (l *RedisGCRALimiter) Increment(ctx context.Context, key string, policy PolicyPreset, n float64) (AdmissionDecision, error) {
	if l == nil || l.client == nil {
		return AdmissionDecision{Allowed: true, Applied: false, Remaining: -1, Limit: -1}, nil
	}
	if policy.RequestsPerSecond <= 0 || policy.Burst <= 0 {
		return AdmissionDecision{Allowed: true, Applied: false, Remaining: -1, Limit: -1}, nil
	}

	intervalUs, burst, ttlMs := buildRedisGCRATier(policy.RequestsPerSecond, policy.Burst)
	if intervalUs <= 0 || burst <= 0 || ttlMs <= 0 {
		return AdmissionDecision{Allowed: true, Applied: false, Remaining: -1, Limit: -1}, nil
	}

	nowUs := l.clock.Now().UTC().UnixNano() / 1000
	result, err := l.client.Eval(ctx, luaRedisGCRAIncrementScript, []string{key}, intervalUs, burst, nowUs, ttlMs, n).Result()
	if err != nil {
		return AdmissionDecision{Allowed: true, Applied: false, Remaining: -1, Limit: -1}, fmt.Errorf("execute redis gcra increment: %w", err)
	}

	values, ok := result.([]interface{})
	if !ok || len(values) != 4 {
		return AdmissionDecision{Allowed: true, Applied: false, Remaining: -1, Limit: -1}, fmt.Errorf("unexpected redis gcra result: %T", result)
	}

	allowed := asInt64(values[0]) == 1
	remaining := asInt64(values[1])
	retryAfterMs := asInt64(values[2])

	decision := AdmissionDecision{
		Allowed:   allowed,
		Applied:   true,
		Remaining: int(remaining),
		Limit:     policy.RequestsPerSecond,
	}
	if retryAfterMs > 0 {
		decision.RetryAfter = time.Duration(retryAfterMs) * time.Millisecond
	}
	if !allowed {
		decision.Remaining = 0
	}
	return decision, nil
}

// Reset clears key's bucket; the next access starts from a full bucket.
func (l *RedisGCRALimiter) Reset(ctx context.Context, key string) error {
	if l == nil || l.client == nil {
		return nil
	}
	_, err := l.client.Eval(ctx, luaRedisGCRAResetScript, []string{key}).Result()
	if err != nil {
		return fmt.Errorf("execute redis gcra reset: %w", err)
	}
	return nil
}

func (l *RedisGCRALimiter) eval(ctx context.Context, key string, policy PolicyPreset, script string) (AdmissionDecision, error) {
	if l == nil || l.client == nil {
		return AdmissionDecision{Allowed: true, Applied: false, Remaining: -1, Limit: -1}, nil
	}

	if policy.RequestsPerSecond <= 0 || policy.Burst <= 0 {
		return AdmissionDecision{Allowed: true, Applied: false, Remaining: -1, Limit: -1}, nil
	}

	intervalUs, burst, ttlMs := buildRedisGCRATier(policy.RequestsPerSecond, policy.Burst)
	if intervalUs <= 0 || burst <= 0 || ttlMs <= 0 {
		return AdmissionDecision{Allowed: true, Applied: false, Remaining: -1, Limit: -1}, nil
	}

	nowUs := l.clock.Now().UTC().UnixNano() / 1000
	result, err := l.client.Eval(ctx, script, []string{key}, intervalUs, burst, nowUs, ttlMs).Result()
	if err != nil {
		return AdmissionDecision{Allowed: true, Applied: false, Remaining: -1, Limit: -1}, fmt.Errorf("execute redis gcra limiter: %w", err)
	}

	values, ok := result.([]interface{})
	if !ok || len(values) != 4 {
		return AdmissionDecision{Allowed: true, Applied: false, Remaining: -1, Limit: -1}, fmt.Errorf("unexpected redis gcra result: %T", result)
	}

	allowed := asInt64(values[0]) == 1
	remaining := asInt64(values[1])
	retryAfterMs := asInt64(values[2])

	decision := AdmissionDecision{
		Allowed:   allowed,
		Applied:   true,
		Remaining: int(remaining),
		Limit:     policy.RequestsPerSecond,
	}
	if retryAfterMs > 0 {
		decision.RetryAfter = time.Duration(retryAfterMs) * time.Millisecond
	}

	if !allowed {
		decision.Remaining = 0
	}

	return decision, nil
}

func buildRedisGCRATier(rps, burst int) (intervalUs int64, burst64 int64, ttlMs int64) {
	if rps <= 0 || burst <= 0 {
		return 0, 0, 0
	}

	windowUs := int64(time.Second / time.Microsecond)
	intervalUs = windowUs / int64(rps)
	if windowUs%int64(rps) != 0 {
		intervalUs++
	}
	if intervalUs < 1 {
		intervalUs = 1
	}

	burst64 = int64(burst)
	ttlMs = (intervalUs * burst64) / 1000
	if (intervalUs*burst64)%1000 != 0 {
		ttlMs++
	}
	if ttlMs < 1 {
		ttlMs = 1
	}

	return intervalUs, burst64, ttlMs
}

func asInt64(v interface{}) int64 {
	switch n := v.(type) {
	case int64:
		return n
	case int:
		return int64(n)
	case float64:
		return int64(n)
	case uint64:
		return int64(n)
	default:
		return 0
	}
}
