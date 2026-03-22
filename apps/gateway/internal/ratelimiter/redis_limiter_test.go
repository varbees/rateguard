package ratelimiter

import (
	"context"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/varbees/rateguard/internal/cache"
	"github.com/varbees/rateguard/pkg/logger"
)

// setupTestRedis creates a miniredis instance and a RedisClient connected to it
func setupTestRateLimiter(t testing.TB) (*miniredis.Miniredis, *RedisRateLimiter) {
	// Initialize logger for tests
	_ = logger.Initialize(logger.Config{
		Level:       "debug",
		Format:      "console",
		Development: true,
	})

	mr, err := miniredis.Run()
	if err != nil {
		if strings.Contains(err.Error(), "operation not permitted") {
			t.Skip("skipping miniredis-dependent test: local sockets are unavailable in this environment")
		}
		t.Fatalf("failed to start miniredis: %v", err)
	}

	client := redis.NewClient(&redis.Options{
		Addr: mr.Addr(),
	})
	_ = client // Keep client alive if needed, or just ignore since we use mr.Addr()

	// Create a RedisClient using the constructor if possible, or manually if fields are exported
	// Since RedisClient fields are unexported in cache package, we need a way to create it.
	// We can use cache.NewRedisClient with a config, but that takes host/port.
	// Or we can use a helper if available.
	// For now, let's assume we can use NewRedisClient with the miniredis address.

	// Let's parse the port from mr.Addr()
	addr := mr.Addr()
	// addr is "127.0.0.1:12345"

	redisConfig := &cache.RedisConfig{
		Host: mr.Host(),
		Port: func() int {
			// Extract port from Addr
			for i := len(addr) - 1; i >= 0; i-- {
				if addr[i] == ':' {
					p, _ := strconv.Atoi(addr[i+1:])
					return p
				}
			}
			return 6379
		}(),
		PoolSize: 1,
	}

	redisClient, err := cache.NewRedisClient(redisConfig)
	if err != nil {
		t.Fatalf("failed to create redis client: %v", err)
	}

	// Create limiter with enabled=true
	limiter := NewRedisRateLimiter(redisClient, true)

	return mr, limiter
}

func TestAllowForUser(t *testing.T) {
	mr, limiter := setupTestRateLimiter(t)
	defer mr.Close()

	userID := uuid.New()
	apiName := "test-api"

	allowed, retryAfter := limiter.AllowForUser(userID, apiName, 10, 1)
	assert.True(t, allowed)
	assert.Zero(t, retryAfter)

	allowed, retryAfter = limiter.AllowForUser(userID, apiName, 10, 1)
	assert.False(t, allowed)
	assert.Greater(t, retryAfter, time.Duration(0))
}

func TestWaitForUser(t *testing.T) {
	mr, limiter := setupTestRateLimiter(t)
	defer mr.Close()

	userID := uuid.New()
	apiName := "test-api"

	allowed, _ := limiter.AllowForUser(userID, apiName, 20, 1)
	assert.True(t, allowed)

	start := time.Now()
	err := limiter.WaitForUser(context.Background(), userID, apiName, 20, 1)
	assert.NoError(t, err)
	assert.GreaterOrEqual(t, time.Since(start), 40*time.Millisecond)
}

func TestAllowGlobal(t *testing.T) {
	mr, limiter := setupTestRateLimiter(t)
	defer mr.Close()

	allowed, reason, retryAfter := limiter.AllowGlobal("127.0.0.1", 1, 1)
	assert.True(t, allowed)
	assert.Empty(t, reason)
	assert.Zero(t, retryAfter)

	allowed, reason, retryAfter = limiter.AllowGlobal("127.0.0.1", 1, 1)
	assert.False(t, allowed)
	assert.Equal(t, "global_limit_exceeded", reason)
	assert.Greater(t, retryAfter, time.Duration(0))
}

func TestAllowWithMultiTier(t *testing.T) {
	mr, limiter := setupTestRateLimiter(t)
	defer mr.Close()

	userID := uuid.New()
	apiName := "test-api"
	limits := &MultiTierLimits{
		RateLimitPerSecond: 1000,
		BurstSize:          2,
		RateLimitPerHour:   1000,
		RateLimitPerDay:    10000,
		RateLimitPerMonth:  100000,
	}

	allowed, limitType, retryAfter, err := limiter.AllowWithMultiTier(userID, apiName, limits)
	assert.NoError(t, err)
	assert.True(t, allowed)
	assert.Empty(t, limitType)
	assert.Zero(t, retryAfter)

	allowed, limitType, retryAfter, err = limiter.AllowWithMultiTier(userID, apiName, limits)
	assert.NoError(t, err)
	assert.True(t, allowed)
	assert.Empty(t, limitType)
	assert.Zero(t, retryAfter)

	allowed, limitType, retryAfter, err = limiter.AllowWithMultiTier(userID, apiName, limits)
	assert.NoError(t, err)
	assert.False(t, allowed)
	assert.Equal(t, "burst", limitType)
	assert.Greater(t, retryAfter, time.Duration(0))
}

func BenchmarkAllowWithMultiTier(b *testing.B) {
	mr, limiter := setupTestRateLimiter(b)
	defer mr.Close()

	userID := uuid.New()
	apiName := "bench-api"
	limits := &MultiTierLimits{
		RateLimitPerSecond: 100000,
		BurstSize:          100000,
		RateLimitPerHour:   1000000,
		RateLimitPerDay:    10000000,
		RateLimitPerMonth:  100000000,
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _, _, _ = limiter.AllowWithMultiTier(userID, apiName, limits)
	}
}

func TestAllowWithMultiTier_HourLimitExceeded(t *testing.T) {
	mr, limiter := setupTestRateLimiter(t)
	defer mr.Close()

	userID := uuid.New()
	apiName := "test-api"
	limits := &MultiTierLimits{
		RateLimitPerSecond: 1000,
		BurstSize:          100,
		RateLimitPerHour:   1,
		RateLimitPerDay:    100,
		RateLimitPerMonth:  1000,
	}

	allowed, _, _, err := limiter.AllowWithMultiTier(userID, apiName, limits)
	assert.NoError(t, err)
	assert.True(t, allowed)

	allowed, limitType, retryAfter, err := limiter.AllowWithMultiTier(userID, apiName, limits)
	assert.NoError(t, err)
	assert.False(t, allowed)
	assert.Equal(t, "per-hour", limitType)
	assert.Greater(t, retryAfter, time.Duration(0))
}
