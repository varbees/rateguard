package ratelimiter

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

const luaGCRARateLimitScript = `
local tierCount = #KEYS
local newTats = {}
local remainders = {}

for i = 1, tierCount do
    local base = (i - 1) * 4
    local intervalUs = tonumber(ARGV[base + 1])
    local burst = tonumber(ARGV[base + 2])
    local nowUs = tonumber(ARGV[base + 3])

    if intervalUs == nil or burst == nil or nowUs == nil or intervalUs <= 0 or burst <= 0 then
        remainders[i] = nil
    else
        local tatRaw = redis.call('GET', KEYS[i])
        local tat = nowUs

        if tatRaw ~= false and tatRaw ~= nil then
            tat = tonumber(tatRaw) or nowUs
        end

        local tolerance = (burst - 1) * intervalUs
        local allowAt = tat - tolerance

        if nowUs < allowAt then
            local retryAfterMs = math.ceil((allowAt - nowUs) / 1000)
            return {0, 0, retryAfterMs, i}
        end

        local newTat = math.max(tat, nowUs) + intervalUs
        newTats[i] = newTat
        remainders[i] = math.max(math.floor(((burst * intervalUs) - (newTat - nowUs)) / intervalUs), 0)
    end
end

for i = 1, tierCount do
    local base = (i - 1) * 4
    local intervalUs = tonumber(ARGV[base + 1])
    local burst = tonumber(ARGV[base + 2])
    local ttlMs = tonumber(ARGV[base + 4])

    if intervalUs ~= nil and burst ~= nil and ttlMs ~= nil and intervalUs > 0 and burst > 0 then
        redis.call('SET', KEYS[i], tostring(newTats[i]), 'PX', ttlMs)
    end
end

local minRemaining = nil
for i = 1, tierCount do
    local remaining = remainders[i]
    if remaining ~= nil and remaining >= 0 then
        if minRemaining == nil or remaining < minRemaining then
            minRemaining = remaining
        end
    end
end

if minRemaining == nil then
    minRemaining = 0
end

return {1, minRemaining, 0, 0}
`

type gcraTier struct {
	key        string
	intervalUs int64
	burst      int64
	ttlMs      int64
}

type gcraDecision struct {
	allowed    bool
	remaining  int64
	retryAfter time.Duration
	failedTier int
}

func buildGCRATier(key string, window time.Duration, limit int, burst int) gcraTier {
	if limit <= 0 || window <= 0 {
		return gcraTier{key: key}
	}

	if burst <= 0 {
		burst = limit
	}

	windowUs := window.Nanoseconds() / 1000
	if windowUs < 1 {
		windowUs = 1
	}

	limit64 := int64(limit)
	intervalUs := windowUs / limit64
	if windowUs%limit64 != 0 {
		intervalUs++
	}
	if intervalUs < 1 {
		intervalUs = 1
	}

	burst64 := int64(burst)
	ttlMs := (intervalUs * burst64) / 1000
	if (intervalUs*burst64)%1000 != 0 {
		ttlMs++
	}
	if ttlMs < 1 {
		ttlMs = 1
	}

	return gcraTier{
		key:        key,
		intervalUs: intervalUs,
		burst:      burst64,
		ttlMs:      ttlMs,
	}
}

func (r *RedisRateLimiter) checkGCRALimits(ctx context.Context, tiers ...gcraTier) (gcraDecision, error) {
	if !r.enabled {
		return gcraDecision{allowed: true}, nil
	}

	keys := make([]string, 0, len(tiers))
	args := make([]interface{}, 0, len(tiers)*4)
	nowUs := time.Now().UnixNano() / 1000
	for _, tier := range tiers {
		keys = append(keys, tier.key)
		args = append(args,
			tier.intervalUs,
			tier.burst,
			nowUs,
			tier.ttlMs,
		)
	}

	result, err := r.redis.EvalScript(ctx, luaGCRARateLimitScript, keys, args...)
	if err != nil {
		return gcraDecision{}, fmt.Errorf("failed to execute GCRA rate limit script: %w", err)
	}

	values, ok := result.([]interface{})
	if !ok || len(values) != 4 {
		return gcraDecision{}, fmt.Errorf("invalid GCRA script result: %T", result)
	}

	allowed, _ := values[0].(int64)
	remaining, _ := values[1].(int64)
	retryAfterMs, _ := values[2].(int64)
	failedTier, _ := values[3].(int64)

	return gcraDecision{
		allowed:    allowed == 1,
		remaining:  remaining,
		retryAfter: time.Duration(retryAfterMs) * time.Millisecond,
		failedTier: int(failedTier),
	}, nil
}

func buildUserGCRATier(userID uuid.UUID, apiName, suffix string, window time.Duration, limit int, burst int) gcraTier {
	key := fmt.Sprintf("ratelimit:user:%s:api:%s:gcra:%s", userID.String(), apiName, suffix)
	return buildGCRATier(key, window, limit, burst)
}

func buildGlobalGCRATiers(ip string, globalLimit, ipLimit int) []gcraTier {
	return []gcraTier{
		buildGCRATier("ratelimit:global:gcra", time.Second, globalLimit, globalLimit),
		buildGCRATier(fmt.Sprintf("ratelimit:ip:%s:gcra", ip), time.Second, ipLimit, ipLimit),
	}
}

func buildMultiTierGCRALimits(userID uuid.UUID, apiName string, now time.Time, limits *MultiTierLimits) []gcraTier {
	if limits == nil {
		return nil
	}

	monthWindow := time.Duration(0)
	if !now.IsZero() {
		currentMonthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		nextMonthStart := currentMonthStart.AddDate(0, 1, 0)
		monthWindow = nextMonthStart.Sub(currentMonthStart)
	}

	return []gcraTier{
		buildUserGCRATier(userID, apiName, "per-second", time.Second, limits.RateLimitPerSecond, limits.BurstSize),
		buildUserGCRATier(userID, apiName, "burst", 10*time.Second, limits.BurstSize, limits.BurstSize),
		buildUserGCRATier(userID, apiName, "per-hour", time.Hour, limits.RateLimitPerHour, limits.RateLimitPerHour),
		buildUserGCRATier(userID, apiName, "per-day", 24*time.Hour, limits.RateLimitPerDay, limits.RateLimitPerDay),
		buildUserGCRATier(userID, apiName, "per-month", monthWindow, limits.RateLimitPerMonth, limits.RateLimitPerMonth),
	}
}

func multiTierLimitType(index int) string {
	switch index {
	case 1:
		return "per-second"
	case 2:
		return "burst"
	case 3:
		return "per-hour"
	case 4:
		return "per-day"
	case 5:
		return "per-month"
	default:
		return "unknown"
	}
}

func globalOrIPLimitType(index int) string {
	switch index {
	case 1:
		return "global_limit_exceeded"
	case 2:
		return "ip_limit_exceeded"
	default:
		return "unknown"
	}
}
