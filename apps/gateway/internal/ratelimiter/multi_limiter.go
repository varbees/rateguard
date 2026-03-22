package ratelimiter

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// MultiLimiter manages rate limiters for multiple users and APIs
type MultiLimiter struct {
	limiters   map[string]*RateLimiter // key: "userID:apiName"
	lastAccess map[string]time.Time    // tracks last access time for cleanup
	mu         sync.RWMutex
	enabled    bool
}

// NewMultiLimiter creates a new multi-user rate limiter
func NewMultiLimiter(enabled bool) *MultiLimiter {
	return &MultiLimiter{
		limiters:   make(map[string]*RateLimiter),
		lastAccess: make(map[string]time.Time),
		enabled:    enabled,
	}
}

// AllowForUser checks rate limit for specific user+API combination
// Returns true if request is allowed, false if rate limit exceeded
func (m *MultiLimiter) AllowForUser(userID uuid.UUID, apiName string, rps int, burst int) bool {
	if !m.enabled {
		return true
	}

	key := m.makeKey(userID, apiName)

	m.mu.RLock()
	limiter, exists := m.limiters[key]
	m.mu.RUnlock()

	if !exists {
		m.mu.Lock()
		// Double-check after acquiring write lock
		if limiter, exists = m.limiters[key]; !exists {
			limiter = New(rps, burst, true)
			m.limiters[key] = limiter
			logger.Debug("Created new rate limiter",
				zap.String("user_id", userID.String()),
				zap.String("api_name", apiName),
				zap.Int("rps", rps),
				zap.Int("burst", burst),
			)
		}
		m.mu.Unlock()
	}

	allowed := limiter.Allow()
	if !allowed {
		logger.Warn("Rate limit exceeded",
			zap.String("user_id", userID.String()),
			zap.String("api_name", apiName),
		)
	}

	return allowed
}

// WaitForUser waits for rate limit permission for a specific user+API combination
// Returns an error if the wait is cancelled or times out
func (m *MultiLimiter) WaitForUser(ctx context.Context, userID uuid.UUID, apiName string, rps int, burst int) error {
	if !m.enabled {
		return nil
	}

	// Validate inputs
	if rps <= 0 || burst <= 0 {
		logger.Warn("Invalid rate limit parameters, using defaults",
			zap.String("user_id", userID.String()),
			zap.String("api_name", apiName),
			zap.Int("rps", rps),
			zap.Int("burst", burst),
		)
		rps = max(rps, 1)
		burst = max(burst, 1)
	}

	key := m.makeKey(userID, apiName)

	// Try to get existing limiter with read lock
	m.mu.RLock()
	limiter, exists := m.limiters[key]
	m.mu.RUnlock()

	if !exists {
		// Double-checked locking pattern for thread safety
		m.mu.Lock()
		if limiter, exists = m.limiters[key]; !exists {
			limiter = New(rps, burst, true)
			m.limiters[key] = limiter
			m.lastAccess[key] = time.Now()
			// Add last access time
			logger.Debug("Created new rate limiter",
				zap.String("user_id", userID.String()),
				zap.String("api_name", apiName),
				zap.Int("rps", rps),
				zap.Int("burst", burst),
			)
		}
		m.mu.Unlock()
	} else {
		// Update last access time
		m.mu.Lock()
		m.lastAccess[key] = time.Now()
		m.mu.Unlock()
	}

	// Wait for rate limit permission
	if err := limiter.Wait(ctx); err != nil {
		logger.Debug("Rate limit wait failed",
			zap.String("user_id", userID.String()),
			zap.String("api_name", apiName),
			zap.Error(err),
		)
		return fmt.Errorf("rate limit exceeded for %s: %w", apiName, err)
	}

	return nil
}

// Helper function for max of two integers
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// UpdateLimits updates rate limits for a specific user+API combination
func (m *MultiLimiter) UpdateLimits(userID uuid.UUID, apiName string, rps int, burst int) {
	if !m.enabled {
		return
	}

	key := m.makeKey(userID, apiName)

	m.mu.RLock()
	limiter, exists := m.limiters[key]
	m.mu.RUnlock()

	if exists {
		limiter.SetRate(rps)
		limiter.SetBurst(burst)
		logger.Info("Updated rate limits",
			zap.String("user_id", userID.String()),
			zap.String("api_name", apiName),
			zap.Int("rps", rps),
			zap.Int("burst", burst),
		)
	} else {
		m.mu.Lock()
		limiter = New(rps, burst, true)
		m.limiters[key] = limiter
		m.mu.Unlock()
		logger.Info("Created rate limiter with new limits",
			zap.String("user_id", userID.String()),
			zap.String("api_name", apiName),
			zap.Int("rps", rps),
			zap.Int("burst", burst),
		)
	}
}

// RemoveLimiter removes a rate limiter for a specific user+API combination
func (m *MultiLimiter) RemoveLimiter(userID uuid.UUID, apiName string) {
	key := m.makeKey(userID, apiName)

	m.mu.Lock()
	delete(m.limiters, key)
	delete(m.lastAccess, key)
	m.mu.Unlock()

	logger.Debug("Removed rate limiter",
		zap.String("user_id", userID.String()),
		zap.String("api_name", apiName),
	)
}

// ClearUserLimiters removes all rate limiters for a specific user
func (m *MultiLimiter) ClearUserLimiters(userID uuid.UUID) {
	userPrefix := userID.String() + ":"

	m.mu.Lock()
	for key := range m.limiters {
		if len(key) > len(userPrefix) && key[:len(userPrefix)] == userPrefix {
			delete(m.limiters, key)
			delete(m.lastAccess, key)
		}
	}
	m.mu.Unlock()

	logger.Debug("Cleared all rate limiters for user",
		zap.String("user_id", userID.String()),
	)
}

// GetStats returns detailed statistics about active rate limiters
func (m *MultiLimiter) GetStats() map[string]interface{} {
	m.mu.RLock()
	defer m.mu.RUnlock()

	stats := map[string]interface{}{
		"enabled":         m.enabled,
		"active_limiters": len(m.limiters),
		"total_keys":      len(m.lastAccess),
	}

	// Count limiters by age
	now := time.Now()
	active1m := 0
	active5m := 0
	active1h := 0

	for key, lastAccess := range m.lastAccess {
		age := now.Sub(lastAccess)
		if age < 1*time.Minute {
			active1m++
		}
		if age < 5*time.Minute {
			active5m++
		}
		if age < 1*time.Hour {
			active1h++
		}

		// Check if limiter exists (defensive check)
		if _, exists := m.limiters[key]; !exists {
			logger.Warn("Orphaned last access entry",
				zap.String("key", key),
			)
		}
	}

	stats["active_last_1m"] = active1m
	stats["active_last_5m"] = active5m
	stats["active_last_1h"] = active1h

	return stats
}

// GetLimiterCount returns the number of active rate limiters
func (m *MultiLimiter) GetLimiterCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.limiters)
}

// ResetLimiter removes a specific rate limiter
func (m *MultiLimiter) ResetLimiter(userID uuid.UUID, apiName string) {
	if !m.enabled {
		return
	}

	key := m.makeKey(userID, apiName)
	
	m.mu.Lock()
	defer m.mu.Unlock()
	
	delete(m.limiters, key)
	delete(m.lastAccess, key)
	
	logger.Info("Reset rate limiter",
		zap.String("user_id", userID.String()),
		zap.String("api_name", apiName),
	)
}

// GetLimiterInfo returns information about a specific limiter
func (m *MultiLimiter) GetLimiterInfo(userID uuid.UUID, apiName string) map[string]interface{} {
	key := m.makeKey(userID, apiName)

	m.mu.RLock()
	limiter, exists := m.limiters[key]
	m.mu.RUnlock()

	if !exists {
		return map[string]interface{}{
			"exists": false,
		}
	}

	return map[string]interface{}{
		"exists": true,
		"rate":   limiter.GetRate(),
		"burst":  limiter.GetBurst(),
		"enabled": limiter.IsEnabled(),
	}
}

// Cleanup removes inactive rate limiters (can be called periodically)
func (m *MultiLimiter) Cleanup() {
	// This is a placeholder for potential cleanup logic
	// In a production system, you might want to remove limiters that haven't been used recently
	// For now, we keep all limiters in memory
	m.mu.RLock()
	count := len(m.limiters)
	m.mu.RUnlock()

	logger.Debug("Rate limiter cleanup check", zap.Int("active_limiters", count))
}

// Enable enables the multi-limiter
func (m *MultiLimiter) Enable() {
	m.enabled = true
	logger.Info("Multi-limiter enabled")
}

// Disable disables the multi-limiter
func (m *MultiLimiter) Disable() {
	m.enabled = false
	logger.Info("Multi-limiter disabled")
}

// IsEnabled returns whether the multi-limiter is enabled
func (m *MultiLimiter) IsEnabled() bool {
	return m.enabled
}

// makeKey creates a unique key for user+API combination
func (m *MultiLimiter) makeKey(userID uuid.UUID, apiName string) string {
	return fmt.Sprintf("%s:%s", userID.String(), apiName)
}

// StartCleanupRoutine starts a background goroutine to periodically cleanup
func (m *MultiLimiter) StartCleanupRoutine(interval time.Duration, done <-chan struct{}) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	logger.Info("Started rate limiter cleanup routine", zap.Duration("interval", interval))

	for {
		select {
		case <-ticker.C:
			m.Cleanup()
		case <-done:
			logger.Info("Stopped rate limiter cleanup routine")
			return
		}
	}
}
