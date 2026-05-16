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
    local retryAfterMs = math.ceil((allowAt - nowUs) / 1000)
    return {0, 0, retryAfterMs, 1}
end

local newTat = math.max(tat, nowUs) + intervalUs
redis.call('SET', KEYS[1], tostring(newTat), 'PX', ttlMs)

local remaining = math.max(math.floor(((burst * intervalUs) - (newTat - nowUs)) / intervalUs), 0)
return {1, remaining, 0, 0}
`

type redisGCRALimiter struct {
	client RedisLimiterClient
	clock  Clock
}

func newRedisGCRALimiterWithClock(client RedisLimiterClient, clock Clock) Limiter {
	if clock == nil {
		clock = systemClock{}
	}
	return &redisGCRALimiter{client: client, clock: clock}
}

func (l *redisGCRALimiter) Allow(ctx context.Context, key string, policy PolicyPreset) (AdmissionDecision, error) {
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
	result, err := l.client.Eval(ctx, luaRedisGCRARateLimitScript, []string{key}, intervalUs, burst, nowUs, ttlMs).Result()
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
