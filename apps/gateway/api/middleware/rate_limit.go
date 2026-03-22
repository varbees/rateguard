package middleware

import (
	"os"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/varbees/rateguard/internal/ratelimiter"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// GlobalRateLimitMiddleware enforces platform-wide and per-IP rate limits
type GlobalRateLimitMiddleware struct {
	limiter *ratelimiter.RedisRateLimiter
}

// NewGlobalRateLimitMiddleware creates a new global rate limit middleware
func NewGlobalRateLimitMiddleware(limiter *ratelimiter.RedisRateLimiter) *GlobalRateLimitMiddleware {
	return &GlobalRateLimitMiddleware{
		limiter: limiter,
	}
}

// Limit enforces global and per-IP rate limits
func (m *GlobalRateLimitMiddleware) Limit(c *fiber.Ctx) error {
	// Skip for health checks and metrics
	path := c.Path()
	if path == "/health" || path == "/ready" || path == "/metrics" {
		return c.Next()
	}

	// Get limits from env or defaults
	globalLimitStr := os.Getenv("GLOBAL_RATE_LIMIT")
	globalLimit := 10000 // Default 10k req/s
	if globalLimitStr != "" {
		if val, err := strconv.Atoi(globalLimitStr); err == nil {
			globalLimit = val
		}
	}

	ipLimitStr := os.Getenv("IP_RATE_LIMIT")
	ipLimit := 100 // Default 100 req/s per IP
	if ipLimitStr != "" {
		if val, err := strconv.Atoi(ipLimitStr); err == nil {
			ipLimit = val
		}
	}

	// Get client IP
	ip := c.IP()
	// Trust X-Forwarded-For if behind proxy (configured in Fiber app)
	
	// Check limits
	allowed, reason := m.limiter.AllowGlobal(ip, globalLimit, ipLimit)
	if !allowed {
		if reason == "global_limit_exceeded" {
			logger.Warn("Global rate limit exceeded", zap.String("ip", ip))
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
				"error": "Service busy",
				"message": "The platform is currently experiencing high load. Please try again later.",
				"retry_after": 1,
			})
		}
		
		if reason == "ip_limit_exceeded" {
			logger.Warn("IP rate limit exceeded", zap.String("ip", ip))
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error": "Too many requests",
				"message": "You have exceeded the rate limit for your IP address.",
				"retry_after": 1,
			})
		}
	}

	return c.Next()
}
