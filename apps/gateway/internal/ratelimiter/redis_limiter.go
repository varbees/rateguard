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
// Uses GCRA with Redis for distributed rate limiting
func (r *RedisRateLimiter) AllowForUser(userID uuid.UUID, apiName string, rps int, burst int) (bool, time.Duration) {
	if !r.enabled {
		return true, 0
	}

	key := fmt.Sprintf("ratelimit:user:%s:api:%s:gcra:per-second", userID.String(), apiName)
	decision, err := r.checkGCRALimits(context.Background(), buildGCRATier(key, time.Second, rps, burst))
	if err != nil {
		logger.Error("Failed to execute GCRA user rate limit",
			zap.String("user_id", userID.String()),
			zap.String("api_name", apiName),
			zap.Error(err),
		)
		return true, 0
	}

	if !decision.allowed {
		logger.Warn("Rate limit exceeded (GCRA)",
			zap.String("user_id", userID.String()),
			zap.String("api_name", apiName),
			zap.Duration("retry_after", decision.retryAfter),
		)
	}

	return decision.allowed, decision.retryAfter
}

// AllowWithMultiTier checks all rate limit tiers (second, burst, hour, day, month).
// It uses a single Lua script so the full decision stays atomic.
func (r *RedisRateLimiter) AllowWithMultiTier(userID uuid.UUID, apiName string, limits *MultiTierLimits) (bool, string, time.Duration, error) {
	if !r.enabled {
		return true, "", 0, nil
	}

	now := time.Now()
	tiers := buildMultiTierGCRALimits(userID, apiName, now, limits)
	decision, err := r.checkGCRALimits(context.Background(), tiers...)
	if err != nil {
		logger.Error("Failed to execute multi-tier GCRA script",
			zap.String("user_id", userID.String()),
			zap.String("api_name", apiName),
			zap.Error(err),
		)
		return false, "", 0, err
	}

	if !decision.allowed {
		limitType := multiTierLimitType(decision.failedTier)
		logger.Warn("Rate limit exceeded (GCRA multi-tier)",
			zap.String("user_id", userID.String()),
			zap.String("api_name", apiName),
			zap.String("limit_type", limitType),
			zap.Duration("retry_after", decision.retryAfter),
		)
		return false, limitType, decision.retryAfter, nil
	}

	return true, "", 0, nil
}

// AllowGlobal checks global platform limits and per-IP limits
// Returns allowed (bool) and reason (string) if blocked
func (r *RedisRateLimiter) AllowGlobal(ip string, globalLimit int, ipLimit int) (bool, string, time.Duration) {
	if !r.enabled {
		return true, "", 0
	}

	tiers := buildGlobalGCRATiers(ip, globalLimit, ipLimit)
	decision, err := r.checkGCRALimits(context.Background(), tiers...)
	if err != nil {
		logger.Error("Failed to execute GCRA global rate limit", zap.Error(err))
		return true, "", 0
	}

	if !decision.allowed {
		limitType := globalOrIPLimitType(decision.failedTier)
		logger.Warn("Rate limit exceeded (global GCRA)",
			zap.String("ip", ip),
			zap.String("limit_type", limitType),
			zap.Duration("retry_after", decision.retryAfter),
		)
		return false, limitType, decision.retryAfter
	}

	return true, "", 0
}

// WaitForUser waits for rate limit permission (blocking)
func (r *RedisRateLimiter) WaitForUser(ctx context.Context, userID uuid.UUID, apiName string, rps int, burst int) error {
	if !r.enabled {
		return nil
	}

	for {
		allowed, retryAfter := r.AllowForUser(userID, apiName, rps, burst)
		if allowed {
			return nil
		}

		wait := retryAfter
		if wait <= 0 {
			wait = 100 * time.Millisecond
		}

		timer := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
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

// TryAcquire attempts to acquire a rate limit token atomically using GCRA.
// Returns true if allowed, false if limit exceeded
func (r *RedisRateLimiter) TryAcquire(key string, limit int, window time.Duration) (bool, time.Duration, error) {
	if !r.enabled {
		return true, 0, nil
	}

	decision, err := r.checkGCRALimits(context.Background(), buildGCRATier(key, window, limit, limit))
	if err != nil {
		logger.Error("Failed to execute GCRA acquire script",
			zap.String("key", key),
			zap.Error(err),
		)
		return true, 0, err
	}

	if !decision.allowed {
		logger.Debug("Rate limit exceeded via TryAcquire",
			zap.String("key", key),
			zap.Int("limit", limit),
			zap.Duration("window", window),
			zap.Duration("retry_after", decision.retryAfter),
		)
	}

	return decision.allowed, decision.retryAfter, nil
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
