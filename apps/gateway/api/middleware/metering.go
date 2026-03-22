package middleware

import (
	"context"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	domainpolicy "github.com/varbees/rateguard/internal/domain/policy"
	"github.com/varbees/rateguard/internal/storage"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// MeteringMiddleware tracks usage and enforces preset-based request limits.
type MeteringMiddleware struct {
	tracker *storage.UsageTracker
}

// NewMeteringMiddleware creates a new metering middleware
func NewMeteringMiddleware(tracker *storage.UsageTracker) *MeteringMiddleware {
	return &MeteringMiddleware{
		tracker: tracker,
	}
}

// TrackUsage records API usage for observability and enforcement.
func (m *MeteringMiddleware) TrackUsage(c *fiber.Ctx) error {
	start := time.Now()

	// Process request
	err := c.Next()

	// Get user from context
	user, userErr := GetUserFromContext(c)
	if userErr != nil {
		// Skip tracking if user not authenticated
		return err
	}

	// Record response time and status
	duration := time.Since(start)
	statusCode := c.Response().StatusCode()
	userID := user.ID // Capture user ID before goroutine

	// Get target API name from context (set by proxy handler)
	targetAPI := GetTargetAPIFromContext(c)
	if targetAPI == "" {
		// Fallback to path if target API not set (for non-proxy endpoints)
		targetAPI = c.Path()
	}

	// Record metrics asynchronously to not block the response
	// Use background context since Fiber context is recycled after request completes
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if recordErr := m.tracker.RecordResponse(ctx, userID, targetAPI, statusCode, duration); recordErr != nil {
			logger.Error("Failed to record usage metrics",
				zap.String("user_id", userID.String()),
				zap.String("target_api", targetAPI),
				zap.Error(recordErr),
			)
		}
	}()

	return err
}

// CheckPresetLimits enforces monthly request limits based on the user's policy preset.
func (m *MeteringMiddleware) CheckPresetLimits(c *fiber.Ctx) error {
	user, err := GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error":     "Unauthorized",
			"message":   "Authentication required",
			"timestamp": time.Now(),
		})
	}

	preset := domainpolicy.NormalizePreset(user.Preset)
	limits := domainpolicy.GetRateLimits(preset)

	// Check if preset has monthly limit (0 means unlimited)
	if limits.MonthlyRequestLimit == 0 {
		return c.Next()
	}

	// Get monthly usage
	monthlyUsage, err := m.tracker.GetMonthlyUsage(c.Context(), user.ID)
	if err != nil {
		logger.Error("Failed to get monthly usage",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		// Don't block request if we can't check usage
		return c.Next()
	}

	// Check if limit exceeded
	if monthlyUsage >= int64(limits.MonthlyRequestLimit) {
		logger.Warn("Monthly limit exceeded",
			zap.String("user_id", user.ID.String()),
			zap.String("preset", preset),
			zap.Int64("usage", monthlyUsage),
			zap.Int("limit", limits.MonthlyRequestLimit),
		)

		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
			"error":   "Monthly Limit Exceeded",
			"message": "You have exceeded the monthly request limit for the current policy preset.",
			"details": fiber.Map{
				"preset":        preset,
				"usage":         monthlyUsage,
				"limit":         limits.MonthlyRequestLimit,
				"usage_percent": float64(monthlyUsage) / float64(limits.MonthlyRequestLimit) * 100,
			},
			"timestamp": time.Now(),
		})
	}

	// Add usage headers to response
	c.Set("X-RateGuard-Limit", fmt.Sprint(limits.MonthlyRequestLimit))
	c.Set("X-RateGuard-Usage", fmt.Sprint(monthlyUsage))
	c.Set("X-RateGuard-Remaining", fmt.Sprint(limits.MonthlyRequestLimit-int(monthlyUsage)))

	return c.Next()
}

// AddUsageHeaders adds usage information to response headers.
func (m *MeteringMiddleware) AddUsageHeaders(c *fiber.Ctx) error {
	user, err := GetUserFromContext(c)
	if err != nil {
		return c.Next()
	}

	preset := domainpolicy.NormalizePreset(user.Preset)
	limits := domainpolicy.GetRateLimits(preset)

	// Add preset info to headers
	c.Set("X-RateGuard-Policy-Preset", preset)
	c.Set("X-RateGuard-Rate-Limit", fmt.Sprint(limits.RequestsPerSecond))

	return c.Next()
}
