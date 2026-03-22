package ratelimiter

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/varbees/rateguard/internal/cache"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// Lua script for atomic rate limit check and increment
// Returns 1 if allowed, 0 if limit exceeded
const luaRateLimitScript = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

local current = redis.call('INCR', key)

if current == 1 then
    redis.call('EXPIRE', key, window)
end

if current > limit then
    return 0
end

return 1
`

// Lua script for multi-tier rate limiting (second, burst, hour, day, month)
// KEYS: [secondKey, burstKey, hourKey, dayKey, monthKey]
// ARGV: [secondLimit, secondTTL, burstLimit, burstTTL, hourLimit, hourTTL, dayLimit, dayTTL, monthLimit, monthTTL]
// Returns: {allowed: 1|0, limit_type: ""|"per-second"|"burst"|"per-hour"|"per-day"|"per-month"}
const luaMultiTierRateLimitScript = `
-- Helper function to check and increment a rate limit
local function checkLimit(key, limit, ttl)
    -- 0 means unlimited
    if limit == 0 then
        return true
    end
    
    local current = redis.call('INCR', key)
    if current == 1 then
        redis.call('EXPIRE', key, ttl)
    end
    
    return current <= limit
end

-- Check all 5 tiers in order (short-circuit on first failure)

-- 1. Per-second limit
if not checkLimit(KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2])) then
    return {0, "per-second"}
end

-- 2. Burst limit
if not checkLimit(KEYS[2], tonumber(ARGV[3]), tonumber(ARGV[4])) then
    return {0, "burst"}
end

-- 3. Per-hour limit
if not checkLimit(KEYS[3], tonumber(ARGV[5]), tonumber(ARGV[6])) then
    return {0, "per-hour"}
end

-- 4. Per-day limit
if not checkLimit(KEYS[4], tonumber(ARGV[7]), tonumber(ARGV[8])) then
    return {0, "per-day"}
end

-- 5. Per-month limit
if not checkLimit(KEYS[5], tonumber(ARGV[9]), tonumber(ARGV[10])) then
    return {0, "per-month"}
end

-- All limits passed
return {1, ""}
`


// RedisRateLimiter implements distributed rate limiting using Redis
type RedisRateLimiter struct {
	redis   *cache.RedisClient
	enabled bool
}

// NewRedisRateLimiter creates a new Redis-based rate limiter
func NewRedisRateLimiter(redis *cache.RedisClient, enabled bool) *RedisRateLimiter {
	logger.Info("Redis rate limiter initialized",
		zap.Bool("enabled", enabled),
	)
	
	return &RedisRateLimiter{
		redis:   redis,
		enabled: enabled,
	}
}

// AllowForUser checks if a request is allowed based on rate limits
// Uses sliding window algorithm with Redis for distributed rate limiting
func (r *RedisRateLimiter) AllowForUser(userID uuid.UUID, apiName string, rps int, burst int) bool {
	if !r.enabled {
		return true
	}

	// Key format: ratelimit:user:{userID}:api:{apiName}:window:{timestamp}
	now := time.Now()
	currentSecond := now.Unix()
	
	// Check per-second limit (sliding window)
	secondKey := fmt.Sprintf("ratelimit:user:%s:api:%s:second:%d", userID.String(), apiName, currentSecond)
	
	// Atomic increment with expiry
	count, err := r.redis.IncrWithExpire(secondKey, 2*time.Second)
	if err != nil {
		logger.Error("Failed to increment rate limit counter",
			zap.String("user_id", userID.String()),
			zap.String("api_name", apiName),
			zap.Error(err),
		)
		// Fail open - allow request if Redis is down
		return true
	}

	// Check against rate limit
	if count > int64(rps) {
		logger.Warn("Rate limit exceeded (per-second)",
			zap.String("user_id", userID.String()),
			zap.String("api_name", apiName),
			zap.Int64("count", count),
			zap.Int("limit", rps),
		)
		return false
	}

	// Check burst limit (over 10 seconds)
	currentDecaSecond := currentSecond / 10
	burstKey := fmt.Sprintf("ratelimit:user:%s:api:%s:burst:%d", userID.String(), apiName, currentDecaSecond)
	
	burstCount, err := r.redis.IncrWithExpire(burstKey, 20*time.Second)
	if err != nil {
		logger.Error("Failed to increment burst counter",
			zap.String("user_id", userID.String()),
			zap.String("api_name", apiName),
			zap.Error(err),
		)
		return true
	}

	if burstCount > int64(burst) {
		logger.Warn("Burst limit exceeded",
			zap.String("user_id", userID.String()),
			zap.String("api_name", apiName),
			zap.Int64("count", burstCount),
			zap.Int("limit", burst),
		)
		return false
	}

	return true
}

// AllowWithMultiTier checks all rate limit tiers (second, hour, day, month)
// Returns true if allowed, false if any limit is exceeded
// OPTIMIZED: Uses single Lua script instead of 5 sequential Redis calls
func (r *RedisRateLimiter) AllowWithMultiTier(userID uuid.UUID, apiName string, limits *MultiTierLimits) (bool, string, error) {
	if !r.enabled {
		return true, "", nil
	}

	now := time.Now()
	currentSecond := now.Unix()
	currentHour := now.Truncate(time.Hour).Unix()
	currentDay := now.Truncate(24 * time.Hour).Unix()
	currentMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).Unix()

	// Build Redis keys for all 5 tiers
	secondKey := fmt.Sprintf("ratelimit:user:%s:api:%s:second:%d", userID.String(), apiName, currentSecond)
	currentDecaSecond := currentSecond / 10
	burstKey := fmt.Sprintf("ratelimit:user:%s:api:%s:burst:%d", userID.String(), apiName, currentDecaSecond)
	hourKey := fmt.Sprintf("ratelimit:user:%s:api:%s:hour:%d", userID.String(), apiName, currentHour)
	dayKey := fmt.Sprintf("ratelimit:user:%s:api:%s:day:%d", userID.String(), apiName, currentDay)
	monthKey := fmt.Sprintf("ratelimit:user:%s:api:%s:month:%d", userID.String(), apiName, currentMonth)

	// Build arguments for Lua script
	keys := []string{secondKey, burstKey, hourKey, dayKey, monthKey}
	args := []interface{}{
		limits.RateLimitPerSecond, 2,           // per-second: limit, ttl (seconds)
		limits.BurstSize, 20,                    // burst: limit, ttl (seconds)
		limits.RateLimitPerHour, 2 * 3600,      // per-hour: limit, ttl (seconds)
		limits.RateLimitPerDay, 48 * 3600,      // per-day: limit, ttl (seconds)
		limits.RateLimitPerMonth, 60 * 24 * 3600, // per-month: limit, ttl (seconds)
	}

	// Execute batched Lua script (single Redis roundtrip)
	ctx := context.Background()
	result, err := r.redis.EvalScript(ctx, luaMultiTierRateLimitScript, keys, args...)
	
	if err != nil {
		logger.Error("Failed to execute multi-tier rate limit Lua script",
			zap.String("user_id", userID.String()),
			zap.String("api_name", apiName),
			zap.Error(err),
		)
		// Return error to trigger fallback
		return false, "", err
	}

	// Parse result: {allowed: 0|1, limit_type: string}
	resultArray, ok := result.([]interface{})
	if !ok || len(resultArray) != 2 {
		logger.Error("Invalid Lua script result format",
			zap.String("user_id", userID.String()),
			zap.String("api_name", apiName),
			zap.Any("result", result),
		)
		// Return error to trigger fallback
		return false, "", fmt.Errorf("invalid lua script result")
	}

	allowed := resultArray[0].(int64) == 1
	limitType := resultArray[1].(string)

	if !allowed {
		logger.Warn("Rate limit exceeded (batched check)",
			zap.String("user_id", userID.String()),
			zap.String("api_name", apiName),
			zap.String("limit_type", limitType),
		)
	}

	return allowed, limitType, nil
}

// AllowGlobal checks global platform limits and per-IP limits
// Returns allowed (bool) and reason (string) if blocked
func (r *RedisRateLimiter) AllowGlobal(ip string, globalLimit int, ipLimit int) (bool, string) {
	if !r.enabled {
		return true, ""
	}

	now := time.Now()
	currentSecond := now.Unix()

	// 1. Check Global Platform Limit
	globalKey := fmt.Sprintf("ratelimit:global:second:%d", currentSecond)
	globalCount, err := r.redis.IncrWithExpire(globalKey, 2*time.Second)
	if err != nil {
		logger.Error("Failed to increment global rate limit", zap.Error(err))
		// Fail open
		return true, ""
	}

	if globalCount > int64(globalLimit) {
		logger.Warn("Global rate limit exceeded", 
			zap.Int64("count", globalCount),
			zap.Int("limit", globalLimit),
		)
		return false, "global_limit_exceeded"
	}

	// 2. Check Per-IP Limit
	ipKey := fmt.Sprintf("ratelimit:ip:%s:second:%d", ip, currentSecond)
	ipCount, err := r.redis.IncrWithExpire(ipKey, 2*time.Second)
	if err != nil {
		logger.Error("Failed to increment IP rate limit", zap.Error(err))
		return true, ""
	}

	if ipCount > int64(ipLimit) {
		logger.Warn("IP rate limit exceeded", 
			zap.String("ip", ip),
			zap.Int64("count", ipCount),
			zap.Int("limit", ipLimit),
		)
		return false, "ip_limit_exceeded"
	}

	return true, ""
}


// WaitForUser waits for rate limit permission (blocking)
func (r *RedisRateLimiter) WaitForUser(ctx context.Context, userID uuid.UUID, apiName string, rps int, burst int) error {
	if !r.enabled {
		return nil
	}

	// Poll every 100ms until allowed or context cancelled
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if r.AllowForUser(userID, apiName, rps, burst) {
				return nil
			}
		}
	}
}

// GetRateLimitInfo returns current rate limit status for a user+API
func (r *RedisRateLimiter) GetRateLimitInfo(userID uuid.UUID, apiName string) (*RateLimitInfo, error) {
	now := time.Now()
	currentSecond := now.Unix()
	currentMinute := currentSecond / 60

	// Get per-second count
	secondKey := fmt.Sprintf("ratelimit:user:%s:api:%s:second:%d", userID.String(), apiName, currentSecond)
	secondCount, err := r.redis.Get(secondKey)
	if err != nil && err.Error() != "redis: nil" {
		return nil, err
	}

	// Get per-minute count
	minuteKey := fmt.Sprintf("ratelimit:user:%s:api:%s:minute:%d", userID.String(), apiName, currentMinute)
	minuteCount, err := r.redis.Get(minuteKey)
	if err != nil && err.Error() != "redis: nil" {
		return nil, err
	}

	var secCount, minCount int64
	if secondCount != "" {
		fmt.Sscanf(secondCount, "%d", &secCount)
	}
	if minuteCount != "" {
		fmt.Sscanf(minuteCount, "%d", &minCount)
	}

	return &RateLimitInfo{
		RequestsThisSecond: secCount,
		RequestsThisMinute: minCount,
		Timestamp:          now,
	}, nil
}

// ResetUserLimits clears all rate limit counters for a user+API
func (r *RedisRateLimiter) ResetUserLimits(userID uuid.UUID, apiName string) error {
	pattern := fmt.Sprintf("ratelimit:user:%s:api:%s:*", userID.String(), apiName)
	keys, err := r.redis.Scan(pattern)
	if err != nil {
		return err
	}

	if len(keys) > 0 {
		if err := r.redis.Delete(keys...); err != nil {
			return err
		}
		logger.Info("Reset rate limits",
			zap.String("user_id", userID.String()),
			zap.String("api_name", apiName),
			zap.Int("keys_deleted", len(keys)),
		)
	}

	return nil
}

// Cleanup performs periodic cleanup of expired rate limit keys
func (r *RedisRateLimiter) Cleanup(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Info("Rate limiter cleanup stopped")
			return
		case <-ticker.C:
			// Redis automatically expires keys with TTL
			// This is just a placeholder for any additional cleanup logic
			logger.Debug("Rate limiter cleanup tick")
		}
	}
}

// RateLimitInfo contains rate limit statistics
type RateLimitInfo struct {
	RequestsThisSecond int64
	RequestsThisMinute int64
	Timestamp          time.Time
}

// MultiTierLimits defines rate limits across multiple time windows
type MultiTierLimits struct {
	RateLimitPerSecond int
	BurstSize          int
	RateLimitPerHour   int // 0 = unlimited
	RateLimitPerDay    int // 0 = unlimited
	RateLimitPerMonth  int // 0 = unlimited
}

// ===========================================================================
// ENHANCED DISTRIBUTED RATE LIMITING METHODS
// ===========================================================================

// TryAcquire attempts to acquire a rate limit token atomically
// Uses Lua script for atomic INCR + EXPIRE operation
// Returns true if allowed, false if limit exceeded
func (r *RedisRateLimiter) TryAcquire(key string, limit int, window time.Duration) (bool, error) {
	if !r.enabled {
		return true, nil
	}

	ctx := context.Background()
	windowSeconds := int(window.Seconds())

	// Execute Lua script atomically
	result, err := r.redis.EvalScript(ctx, luaRateLimitScript, []string{key}, limit, windowSeconds)
	if err != nil {
		logger.Error("Failed to execute rate limit Lua script",
			zap.String("key", key),
			zap.Error(err),
		)
		// Fail open - allow request if Redis script fails
		return true, err
	}

	allowed := result.(int64) == 1
	
	if !allowed {
		logger.Debug("Rate limit exceeded via TryAcquire",
			zap.String("key", key),
			zap.Int("limit", limit),
			zap.Duration("window", window),
		)
	}

	return allowed, nil
}

// GetUsage returns the current usage count for a rate limit window
func (r *RedisRateLimiter) GetUsage(key string) (int, error) {
	if !r.enabled {
		return 0, nil
	}

	val, err := r.redis.Get(key)
	
	if err != nil {
		if err == redis.Nil {
			// Key doesn't exist, usage is 0
			return 0, nil
		}
		return 0, fmt.Errorf("failed to get usage: %w", err)
	}

	var usage int
	if _, err := fmt.Sscanf(val, "%d", &usage); err != nil {
		return 0, fmt.Errorf("failed to parse usage count: %w", err)
	}

	return usage, nil
}

// Reset manually resets a rate limit counter (admin feature)
func (r *RedisRateLimiter) Reset(key string) error {
	if !r.enabled {
		return nil
	}

	err := r.redis.Delete(key)
	
	if err != nil {
		return fmt.Errorf("failed to reset rate limit: %w", err)
	}

	logger.Info("Rate limit counter reset",
		zap.String("key", key),
	)

	return nil
}

// GetUsageForUserAPI returns usage across all time windows for a user+API
func (r *RedisRateLimiter) GetUsageForUserAPI(userID uuid.UUID, apiName string) (*UsageStats, error) {
	if !r.enabled {
		return &UsageStats{}, nil
	}

	now := time.Now()
	currentSecond := now.Unix()
	currentHour := now.Truncate(time.Hour).Unix()
	currentDay := now.Truncate(24 * time.Hour).Unix()
	currentMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).Unix()

	secondKey := fmt.Sprintf("ratelimit:user:%s:api:%s:second:%d", userID.String(), apiName, currentSecond)
	hourKey := fmt.Sprintf("ratelimit:user:%s:api:%s:hour:%d", userID.String(), apiName, currentHour)
	dayKey := fmt.Sprintf("ratelimit:user:%s:api:%s:day:%d", userID.String(), apiName, currentDay)
	monthKey := fmt.Sprintf("ratelimit:user:%s:api:%s:month:%d", userID.String(), apiName, currentMonth)

	perSecond, _ := r.GetUsage(secondKey)
	perHour, _ := r.GetUsage(hourKey)
	perDay, _ := r.GetUsage(dayKey)
	perMonth, _ := r.GetUsage(monthKey)

	return &UsageStats{
		PerSecond: perSecond,
		PerHour:   perHour,
		PerDay:    perDay,
		PerMonth:  perMonth,
		Timestamp: now,
	}, nil
}

// ResetUserAPILimits resets all rate limits for a user+API combination
func (r *RedisRateLimiter) ResetUserAPILimits(userID uuid.UUID, apiName string) error {
	return r.ResetUserLimits(userID, apiName)
}

// UsageStats contains usage statistics across time windows
type UsageStats struct {
	PerSecond int
	PerHour   int
	PerDay    int
	PerMonth  int
	Timestamp time.Time
}
