package middleware

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/varbees/rateguard/internal/cache"
)

const (
	idempotencyInFlightTTL = 10 * time.Minute
	idempotencyCompletedTTL = 24 * time.Hour
)

// IdempotencyMiddleware enforces the Idempotency-Key contract on mutating routes.
type IdempotencyMiddleware struct {
	redis *cache.RedisClient

	mu    sync.Mutex
	local map[string]time.Time
}

// NewIdempotencyMiddleware creates a new idempotency middleware.
func NewIdempotencyMiddleware(redis *cache.RedisClient) *IdempotencyMiddleware {
	return &IdempotencyMiddleware{
		redis: redis,
		local: make(map[string]time.Time),
	}
}

// Enforce requires an Idempotency-Key and prevents duplicates from replaying the same mutation.
func (m *IdempotencyMiddleware) Enforce(c *fiber.Ctx) error {
	if m == nil {
		return c.Next()
	}

	key := strings.TrimSpace(c.Get("Idempotency-Key"))
	if key == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Missing Idempotency-Key",
			"message": "This mutating endpoint requires an Idempotency-Key header",
		})
	}
	if len(key) > 128 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Invalid Idempotency-Key",
			"message": "Idempotency-Key must be 128 characters or fewer",
		})
	}

	scopeKey := m.scopeKey(c, key)
	acquired, err := m.acquire(scopeKey)
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error":   "Idempotency store unavailable",
			"message": err.Error(),
		})
	}
	if !acquired {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error":   "Duplicate Idempotency-Key",
			"message": "This mutating request has already been accepted",
		})
	}

	err = c.Next()
	statusCode := c.Response().StatusCode()
	if err != nil || statusCode >= fiber.StatusInternalServerError {
		_ = m.release(scopeKey)
		return err
	}

	_ = m.complete(scopeKey)
	return err
}

func (m *IdempotencyMiddleware) scopeKey(c *fiber.Ctx, key string) string {
	route := "unknown-route"
	if r := c.Route(); r != nil && r.Path != "" {
		route = r.Path
	}

	subject := strings.TrimSpace(fmt.Sprint(c.Locals("user_id")))
	if subject == "" || subject == "<nil>" {
		subject = strings.TrimSpace(c.IP())
	}
	if subject == "" {
		subject = "global"
	}

	return fmt.Sprintf("rateguard:idempotency:%s:%s:%s:%s", c.Method(), route, subject, key)
}

func (m *IdempotencyMiddleware) acquire(key string) (bool, error) {
	if m.redis != nil {
		return m.redis.AcquireLock(key, idempotencyInFlightTTL)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	m.cleanupExpiredLocked(time.Now())
	if expiry, exists := m.local[key]; exists && time.Now().Before(expiry) {
		return false, nil
	}

	m.local[key] = time.Now().Add(idempotencyInFlightTTL)
	return true, nil
}

func (m *IdempotencyMiddleware) complete(key string) error {
	if m.redis != nil {
		return m.redis.Set(key, "completed", idempotencyCompletedTTL)
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.local[key] = time.Now().Add(idempotencyCompletedTTL)
	return nil
}

func (m *IdempotencyMiddleware) release(key string) error {
	if m.redis != nil {
		return m.redis.Delete(key)
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.local, key)
	return nil
}

func (m *IdempotencyMiddleware) cleanupExpiredLocked(now time.Time) {
	for key, expiry := range m.local {
		if now.After(expiry) {
			delete(m.local, key)
		}
	}
}
