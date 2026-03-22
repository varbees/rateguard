package proxy

import (
	"fmt"
	"sync"
	"time"

	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// CircuitBreakerManager manages circuit breakers for multiple APIs
type CircuitBreakerManager struct {
	breakers      sync.Map // key: apiID (string) -> value: *CircuitBreaker
	config        CircuitBreakerConfig
	onStateChange func(userID, apiID, apiName string, state CircuitState)
	mu            sync.RWMutex
}

// NewCircuitBreakerManager creates a new circuit breaker manager
func NewCircuitBreakerManager(config CircuitBreakerConfig, onStateChange func(userID, apiID, apiName string, state CircuitState)) *CircuitBreakerManager {
	logger.Info("Circuit breaker manager initialized",
		zap.Int("max_failures", config.MaxFailures),
		zap.Duration("timeout", config.Timeout),
		zap.Int("max_concurrent_half_open", config.MaxConcurrentRequestsInHalfOpen),
		zap.Int("success_threshold_half_open", config.SuccessThresholdInHalfOpen),
	)
	
	return &CircuitBreakerManager{
		config:        config,
		onStateChange: onStateChange,
	}
}

// GetOrCreate gets an existing circuit breaker or creates a new one for the API
func (m *CircuitBreakerManager) GetOrCreate(apiID, apiName, userID string) *CircuitBreaker {
	// Fast path: try to load existing breaker
	if breaker, ok := m.breakers.Load(apiID); ok {
		return breaker.(*CircuitBreaker)
	}
	
	// Slow path: create new breaker
	m.mu.Lock()
	defer m.mu.Unlock()
	
	// Double-check after acquiring lock
	if breaker, ok := m.breakers.Load(apiID); ok {
		return breaker.(*CircuitBreaker)
	}
	
	// Create new circuit breaker
	breaker := NewCircuitBreaker(apiID, apiName, userID, m.config, m.onStateChange)
	m.breakers.Store(apiID, breaker)
	
	logger.Info("Created new circuit breaker for API",
		zap.String("api_id", apiID),
		zap.String("api_name", apiName),
		zap.String("user_id", userID),
	)
	
	return breaker
}

// Get retrieves a circuit breaker for an API (returns nil if not found)
func (m *CircuitBreakerManager) Get(apiID string) *CircuitBreaker {
	if breaker, ok := m.breakers.Load(apiID); ok {
		return breaker.(*CircuitBreaker)
	}
	return nil
}

// Remove removes a circuit breaker for an API
func (m *CircuitBreakerManager) Remove(apiID string) {
	m.breakers.Delete(apiID)
	logger.Info("Removed circuit breaker for API",
		zap.String("api_id", apiID),
	)
}

// Reset resets a specific circuit breaker
func (m *CircuitBreakerManager) Reset(apiID string) error {
	breaker := m.Get(apiID)
	if breaker == nil {
		return fmt.Errorf("circuit breaker not found for API: %s", apiID)
	}
	
	breaker.Reset()
	return nil
}

// ResetAll resets all circuit breakers
func (m *CircuitBreakerManager) ResetAll() {
	count := 0
	m.breakers.Range(func(key, value interface{}) bool {
		breaker := value.(*CircuitBreaker)
		breaker.Reset()
		count++
		return true
	})
	
	logger.Info("Reset all circuit breakers",
		zap.Int("count", count),
	)
}

// GetAllMetrics returns metrics for all circuit breakers
func (m *CircuitBreakerManager) GetAllMetrics() map[string]CircuitBreakerMetrics {
	metrics := make(map[string]CircuitBreakerMetrics)
	
	m.breakers.Range(func(key, value interface{}) bool {
		apiID := key.(string)
		breaker := value.(*CircuitBreaker)
		metrics[apiID] = breaker.GetMetrics()
		return true
	})
	
	return metrics
}

// GetOpenCircuitBreakers returns a list of APIs with open circuit breakers
func (m *CircuitBreakerManager) GetOpenCircuitBreakers() []string {
	var openAPIs []string
	
	m.breakers.Range(func(key, value interface{}) bool {
		apiID := key.(string)
		breaker := value.(*CircuitBreaker)
		if breaker.IsOpen() {
			openAPIs = append(openAPIs, apiID)
		}
		return true
	})
	
	return openAPIs
}

// GetStats returns aggregated statistics
func (m *CircuitBreakerManager) GetStats() CircuitBreakerStats {
	stats := CircuitBreakerStats{
		Timestamp: time.Now(),
	}
	
	m.breakers.Range(func(key, value interface{}) bool {
		breaker := value.(*CircuitBreaker)
		metrics := breaker.GetMetrics()
		
		stats.TotalCircuitBreakers++
		stats.TotalRequests += metrics.TotalRequests
		stats.TotalSuccesses += metrics.TotalSuccesses
		stats.TotalFailures += metrics.TotalFailures
		stats.TotalRejections += metrics.TotalRejections
		
		switch breaker.GetState() {
		case StateClosed:
			stats.ClosedCount++
		case StateOpen:
			stats.OpenCount++
			stats.OpenAPIs = append(stats.OpenAPIs, metrics.APIName)
		case StateHalfOpen:
			stats.HalfOpenCount++
		}
		
		return true
	})
	
	return stats
}

// CircuitBreakerStats holds aggregated statistics
type CircuitBreakerStats struct {
	Timestamp            time.Time `json:"timestamp"`
	TotalCircuitBreakers int       `json:"total_circuit_breakers"`
	ClosedCount          int       `json:"closed_count"`
	OpenCount            int       `json:"open_count"`
	HalfOpenCount        int       `json:"half_open_count"`
	OpenAPIs             []string  `json:"open_apis,omitempty"`
	TotalRequests        int64     `json:"total_requests"`
	TotalSuccesses       int64     `json:"total_successes"`
	TotalFailures        int64     `json:"total_failures"`
	TotalRejections      int64     `json:"total_rejections"`
}

// HealthCheck performs a health check on all circuit breakers
func (m *CircuitBreakerManager) HealthCheck() (healthy bool, issues []string) {
	healthy = true
	
	m.breakers.Range(func(key, value interface{}) bool {
		breaker := value.(*CircuitBreaker)
		
		if breaker.IsOpen() {
			healthy = false
			metrics := breaker.GetMetrics()
			issues = append(issues, fmt.Sprintf(
				"API %s: circuit breaker is OPEN (failures: %d, time in state: %v)",
				metrics.APIName,
				metrics.TotalFailures,
				metrics.TimeInState,
			))
		}
		
		return true
	})
	
	return healthy, issues
}

// Cleanup removes inactive circuit breakers (not used in a while)
func (m *CircuitBreakerManager) Cleanup(inactiveThreshold time.Duration) int {
	removed := 0
	now := time.Now()
	
	m.breakers.Range(func(key, value interface{}) bool {
		breaker := value.(*CircuitBreaker)
		metrics := breaker.GetMetrics()
		
		// Check if circuit breaker has been inactive
		if breaker.IsClosed() && 
		   now.Sub(metrics.LastStateChange) > inactiveThreshold &&
		   metrics.TotalRequests == 0 {
			m.breakers.Delete(key)
			removed++
			logger.Debug("Removed inactive circuit breaker",
				zap.String("api_name", metrics.APIName),
			)
		}
		
		return true
	})
	
	if removed > 0 {
		logger.Info("Circuit breaker cleanup completed",
			zap.Int("removed", removed),
		)
	}
	
	return removed
}

// StartCleanupRoutine starts a background goroutine to cleanup inactive circuit breakers
func (m *CircuitBreakerManager) StartCleanupRoutine(interval, inactiveThreshold time.Duration, done chan struct{}) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	
	logger.Info("Circuit breaker cleanup routine started",
		zap.Duration("interval", interval),
		zap.Duration("inactive_threshold", inactiveThreshold),
	)
	
	for {
		select {
		case <-ticker.C:
			m.Cleanup(inactiveThreshold)
		case <-done:
			logger.Info("Circuit breaker cleanup routine stopped")
			return
		}
	}
}
