package proxy

import "time"

// CircuitBreakerInfo holds circuit breaker information for API metrics endpoint
type CircuitBreakerInfo struct {
	State         string
	Failures      int
	LastFailureAt *time.Time
}

// GetCircuitBreakerForAPI retrieves circuit breaker info for a specific API
func (s *ProxyService) GetCircuitBreakerForAPI(apiID string) *CircuitBreakerInfo {
	if s.circuitBreakers == nil {
		return nil
	}

	breaker := s.circuitBreakers.Get(apiID)
	if breaker == nil {
		return &CircuitBreakerInfo{
			State:    "closed",
			Failures: 0,
		}
	}

	metrics := breaker.GetMetrics()
	info := &CircuitBreakerInfo{
		State:    string(breaker.GetState()),
		Failures: int(metrics.ConsecutiveFailures),
	}

	// Get last failure time if available
	if !metrics.LastStateChange.IsZero() && breaker.GetState() != StateClosed {
		info.LastFailureAt = &metrics.LastStateChange
	}

	return info
}
