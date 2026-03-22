package proxy

import (
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

var (
	// ErrCircuitOpen is returned when circuit breaker is in open state
	ErrCircuitOpen = errors.New("circuit breaker is open")

	// ErrTooManyRequests is returned when max concurrent requests exceeded in half-open state
	ErrTooManyRequests = errors.New("too many requests in half-open state")
)

// CircuitState represents the state of a circuit breaker
type CircuitState string

const (
	// StateClosed - normal operation, requests pass through
	StateClosed CircuitState = "closed"

	// StateOpen - circuit is open, requests fail fast
	StateOpen CircuitState = "open"

	// StateHalfOpen - testing if service has recovered
	StateHalfOpen CircuitState = "half-open"
)

// CircuitBreakerConfig holds configuration for circuit breaker
type CircuitBreakerConfig struct {
	// RollingWindowSize is the number of recent outcomes used for the open decision.
	RollingWindowSize int

	// ErrorRateThreshold opens the circuit when the rolling error rate exceeds this value.
	ErrorRateThreshold float64

	// Timeout is the duration to wait in open state before transitioning to half-open
	Timeout time.Duration

	// MaxConcurrentRequestsInHalfOpen limits concurrent requests in half-open state
	MaxConcurrentRequestsInHalfOpen int

	// SuccessThresholdInHalfOpen is number of successful requests to close circuit
	SuccessThresholdInHalfOpen int
}

// DefaultCircuitBreakerConfig returns default configuration
func DefaultCircuitBreakerConfig() CircuitBreakerConfig {
	return CircuitBreakerConfig{
		RollingWindowSize:               100,
		ErrorRateThreshold:              0.5,
		Timeout:                         60 * time.Second,
		MaxConcurrentRequestsInHalfOpen: 1,
		SuccessThresholdInHalfOpen:      2,
	}
}

// NewCircuitBreakerConfigFromSettings creates config from application settings
func NewCircuitBreakerConfigFromSettings(rollingWindowSize int, timeoutSeconds, maxConcurrentHalfOpen, successThreshold int, errorRateThreshold float64) CircuitBreakerConfig {
	return CircuitBreakerConfig{
		RollingWindowSize:               rollingWindowSize,
		ErrorRateThreshold:              errorRateThreshold,
		Timeout:                         time.Duration(timeoutSeconds) * time.Second,
		MaxConcurrentRequestsInHalfOpen: maxConcurrentHalfOpen,
		SuccessThresholdInHalfOpen:      successThreshold,
	}
}

// CircuitBreaker implements the circuit breaker pattern
type CircuitBreaker struct {
	config CircuitBreakerConfig

	// State management
	state         atomic.Value // stores CircuitState
	lastFailTime  atomic.Value // stores time.Time
	lastStateTime atomic.Value // stores time.Time

	// Counters
	consecutiveFailures  atomic.Int32
	consecutiveSuccesses atomic.Int32
	halfOpenRequests     atomic.Int32

	// Rolling error window
	outcomesRing     [100]bool
	outcomesHead     int
	outcomesCount    int
	outcomesFailures int

	// Metrics
	totalRequests    atomic.Int64
	totalSuccesses   atomic.Int64
	totalFailures    atomic.Int64
	totalRejections  atomic.Int64
	stateTransitions atomic.Int64

	// API identification
	apiID   string
	apiName string
	userID  string

	// Callbacks
	onStateChange func(userID, apiID, apiName string, state CircuitState)

	// Mutex for state transitions
	mu sync.RWMutex
}

// NewCircuitBreaker creates a new circuit breaker
func NewCircuitBreaker(apiID, apiName, userID string, config CircuitBreakerConfig, onStateChange func(userID, apiID, apiName string, state CircuitState)) *CircuitBreaker {
	cb := &CircuitBreaker{
		config:        config,
		apiID:         apiID,
		apiName:       apiName,
		userID:        userID,
		onStateChange: onStateChange,
	}

	// Initialize state
	cb.state.Store(StateClosed)
	cb.lastStateTime.Store(time.Now())

	logger.Info("Circuit breaker created",
		zap.String("api_id", apiID),
		zap.String("api_name", apiName),
		zap.String("user_id", userID),
		zap.Int("rolling_window_size", config.RollingWindowSize),
		zap.Float64("error_rate_threshold", config.ErrorRateThreshold),
		zap.Duration("timeout", config.Timeout),
	)

	return cb
}

// Call executes a function with circuit breaker protection
func (cb *CircuitBreaker) Call(fn func() error) error {
	cb.totalRequests.Add(1)

	// Check if we can proceed
	if err := cb.beforeRequest(); err != nil {
		cb.totalRejections.Add(1)
		return err
	}

	// Execute the function
	err := fn()

	// Record the result
	cb.afterRequest(err)

	return err
}

// beforeRequest checks if request is allowed based on current state
func (cb *CircuitBreaker) beforeRequest() error {
	state := cb.GetState()

	switch state {
	case StateClosed:
		// Normal operation - allow request
		return nil

	case StateOpen:
		// Check if timeout has elapsed
		lastFail := cb.lastFailTime.Load().(time.Time)
		if time.Since(lastFail) > cb.config.Timeout {
			// Attempt transition to half-open
			cb.mu.Lock()
			// Double-check state (another goroutine might have changed it)
			if cb.GetState() == StateOpen {
				cb.toHalfOpen()
			}
			cb.mu.Unlock()

			// Allow request in half-open state
			return cb.checkHalfOpenCapacity()
		}

		// Circuit is still open
		logger.Debug("Circuit breaker rejected request (open state)",
			zap.String("api_name", cb.apiName),
			zap.Duration("time_since_last_fail", time.Since(lastFail)),
		)
		return ErrCircuitOpen

	case StateHalfOpen:
		// Check if we can allow more requests
		return cb.checkHalfOpenCapacity()

	default:
		return nil
	}
}

// checkHalfOpenCapacity checks if half-open state can accept more requests
func (cb *CircuitBreaker) checkHalfOpenCapacity() error {
	current := cb.halfOpenRequests.Load()
	if current >= int32(cb.config.MaxConcurrentRequestsInHalfOpen) {
		logger.Debug("Circuit breaker rejected request (half-open capacity)",
			zap.String("api_name", cb.apiName),
			zap.Int32("current_requests", current),
		)
		return ErrTooManyRequests
	}

	cb.halfOpenRequests.Add(1)
	return nil
}

// afterRequest records the result and updates state
func (cb *CircuitBreaker) afterRequest(err error) {
	state := cb.GetState()

	// Decrement half-open counter if in half-open state
	if state == StateHalfOpen {
		cb.halfOpenRequests.Add(-1)
	}

	if err != nil {
		cb.onFailure()
	} else {
		cb.onSuccess()
	}
}

// onSuccess handles successful request
func (cb *CircuitBreaker) onSuccess() {
	cb.totalSuccesses.Add(1)
	errorRate := cb.recordOutcome(false)
	state := cb.GetState()

	switch state {
	case StateClosed:
		cb.consecutiveFailures.Store(int32(cb.currentOutcomeFailures()))
		logger.Debug("Circuit breaker success in closed state",
			zap.String("api_name", cb.apiName),
			zap.Float64("error_rate", errorRate),
			zap.Float64("threshold", cb.config.ErrorRateThreshold),
		)

	case StateHalfOpen:
		// Increment consecutive successes
		successes := cb.consecutiveSuccesses.Add(1)

		logger.Debug("Circuit breaker success in half-open state",
			zap.String("api_name", cb.apiName),
			zap.Int32("consecutive_successes", successes),
			zap.Int("threshold", cb.config.SuccessThresholdInHalfOpen),
		)

		// Check if we have enough successes to close circuit
		if successes >= int32(cb.config.SuccessThresholdInHalfOpen) {
			cb.mu.Lock()
			if cb.GetState() == StateHalfOpen {
				cb.toClosed()
			}
			cb.mu.Unlock()
		}
	}
}

// onFailure handles failed request
func (cb *CircuitBreaker) onFailure() {
	cb.totalFailures.Add(1)
	cb.lastFailTime.Store(time.Now())
	errorRate := cb.recordOutcome(true)

	state := cb.GetState()

	switch state {
	case StateClosed:
		cb.consecutiveFailures.Store(int32(cb.currentOutcomeFailures()))

		logger.Warn("Circuit breaker failure",
			zap.String("api_name", cb.apiName),
			zap.Int32("rolling_failures", cb.consecutiveFailures.Load()),
			zap.Int("window_size", cb.config.RollingWindowSize),
			zap.Float64("error_rate", errorRate),
			zap.Float64("threshold", cb.config.ErrorRateThreshold),
		)

		// Check if we've exceeded threshold
		if errorRate > cb.config.ErrorRateThreshold {
			cb.mu.Lock()
			if cb.GetState() == StateClosed {
				cb.toOpen()
			}
			cb.mu.Unlock()
		}

	case StateHalfOpen:
		// Any failure in half-open state reopens the circuit
		logger.Warn("Circuit breaker failure in half-open state, reopening",
			zap.String("api_name", cb.apiName),
		)

		cb.mu.Lock()
		if cb.GetState() == StateHalfOpen {
			cb.toOpen()
		}
		cb.mu.Unlock()
	}
}

func (cb *CircuitBreaker) recordOutcome(failed bool) float64 {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	windowSize := cb.config.RollingWindowSize
	if windowSize <= 0 || windowSize > len(cb.outcomesRing) {
		windowSize = len(cb.outcomesRing)
	}

	if cb.outcomesCount < windowSize {
		cb.outcomesCount++
	} else if cb.outcomesRing[cb.outcomesHead] {
		cb.outcomesFailures--
	}

	cb.outcomesRing[cb.outcomesHead] = failed
	if failed {
		cb.outcomesFailures++
	}
	cb.outcomesHead = (cb.outcomesHead + 1) % windowSize

	if cb.outcomesCount == 0 {
		return 0
	}

	return float64(cb.outcomesFailures) / float64(cb.outcomesCount)
}

func (cb *CircuitBreaker) currentOutcomeFailures() int {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	return cb.outcomesFailures
}

func (cb *CircuitBreaker) resetOutcomeWindowLocked() {
	for i := range cb.outcomesRing {
		cb.outcomesRing[i] = false
	}
	cb.outcomesHead = 0
	cb.outcomesCount = 0
	cb.outcomesFailures = 0
}

// State transition methods (must be called with lock held)

func (cb *CircuitBreaker) toOpen() {
	cb.state.Store(StateOpen)
	cb.lastStateTime.Store(time.Now())
	cb.stateTransitions.Add(1)
	cb.consecutiveSuccesses.Store(0)

	logger.Error("Circuit breaker OPENED",
		zap.String("api_id", cb.apiID),
		zap.String("api_name", cb.apiName),
		zap.Int32("rolling_failures", cb.consecutiveFailures.Load()),
		zap.Int("window_size", cb.config.RollingWindowSize),
		zap.Float64("error_rate_threshold", cb.config.ErrorRateThreshold),
		zap.Duration("timeout", cb.config.Timeout),
	)

	if cb.onStateChange != nil {
		go cb.onStateChange(cb.userID, cb.apiID, cb.apiName, StateOpen)
	}
}

func (cb *CircuitBreaker) toHalfOpen() {
	cb.state.Store(StateHalfOpen)
	cb.lastStateTime.Store(time.Now())
	cb.stateTransitions.Add(1)
	cb.consecutiveSuccesses.Store(0)
	cb.halfOpenRequests.Store(0)

	logger.Info("Circuit breaker transitioned to HALF-OPEN",
		zap.String("api_id", cb.apiID),
		zap.String("api_name", cb.apiName),
	)

	if cb.onStateChange != nil {
		go cb.onStateChange(cb.userID, cb.apiID, cb.apiName, StateHalfOpen)
	}
}

func (cb *CircuitBreaker) toClosed() {
	cb.state.Store(StateClosed)
	cb.lastStateTime.Store(time.Now())
	cb.stateTransitions.Add(1)
	cb.consecutiveFailures.Store(0)
	cb.consecutiveSuccesses.Store(0)
	cb.resetOutcomeWindowLocked()

	logger.Info("Circuit breaker CLOSED",
		zap.String("api_id", cb.apiID),
		zap.String("api_name", cb.apiName),
	)

	if cb.onStateChange != nil {
		go cb.onStateChange(cb.userID, cb.apiID, cb.apiName, StateClosed)
	}
}

// Getters

// GetState returns current circuit state
func (cb *CircuitBreaker) GetState() CircuitState {
	return cb.state.Load().(CircuitState)
}

// IsOpen returns true if circuit is open
func (cb *CircuitBreaker) IsOpen() bool {
	return cb.GetState() == StateOpen
}

// IsClosed returns true if circuit is closed
func (cb *CircuitBreaker) IsClosed() bool {
	return cb.GetState() == StateClosed
}

// IsHalfOpen returns true if circuit is half-open
func (cb *CircuitBreaker) IsHalfOpen() bool {
	return cb.GetState() == StateHalfOpen
}

// GetMetrics returns current metrics
func (cb *CircuitBreaker) GetMetrics() CircuitBreakerMetrics {
	state := cb.GetState()
	lastStateTime := cb.lastStateTime.Load().(time.Time)

	return CircuitBreakerMetrics{
		State:                state,
		StateString:          string(state),
		APIName:              cb.apiName,
		TotalRequests:        cb.totalRequests.Load(),
		TotalSuccesses:       cb.totalSuccesses.Load(),
		TotalFailures:        cb.totalFailures.Load(),
		TotalRejections:      cb.totalRejections.Load(),
		ConsecutiveFailures:  cb.consecutiveFailures.Load(),
		ConsecutiveSuccesses: cb.consecutiveSuccesses.Load(),
		StateTransitions:     cb.stateTransitions.Load(),
		TimeInState:          time.Since(lastStateTime),
		LastStateChange:      lastStateTime,
	}
}

// Reset resets the circuit breaker to closed state
func (cb *CircuitBreaker) Reset() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	cb.toClosed()

	logger.Info("Circuit breaker manually reset",
		zap.String("api_name", cb.apiName),
	)
}

// CircuitBreakerMetrics holds circuit breaker metrics
type CircuitBreakerMetrics struct {
	State                CircuitState  `json:"state"`
	StateString          string        `json:"state_string"`
	APIName              string        `json:"api_name"`
	TotalRequests        int64         `json:"total_requests"`
	TotalSuccesses       int64         `json:"total_successes"`
	TotalFailures        int64         `json:"total_failures"`
	TotalRejections      int64         `json:"total_rejections"`
	ConsecutiveFailures  int32         `json:"consecutive_failures"`
	ConsecutiveSuccesses int32         `json:"consecutive_successes"`
	StateTransitions     int64         `json:"state_transitions"`
	TimeInState          time.Duration `json:"time_in_state"`
	LastStateChange      time.Time     `json:"last_state_change"`
}

// String returns a human-readable representation of metrics
func (m CircuitBreakerMetrics) String() string {
	return fmt.Sprintf(
		"CircuitBreaker[%s]: state=%s, requests=%d, successes=%d, failures=%d, rejections=%d",
		m.APIName,
		m.StateString,
		m.TotalRequests,
		m.TotalSuccesses,
		m.TotalFailures,
		m.TotalRejections,
	)
}
