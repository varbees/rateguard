package rateguard

import (
	"sync"
	"time"
)

// CircuitBreakerState is the current upstream protection state.
type CircuitBreakerState string

const (
	CircuitBreakerClosed   CircuitBreakerState = "closed"
	CircuitBreakerOpen     CircuitBreakerState = "open"
	CircuitBreakerHalfOpen CircuitBreakerState = "half-open"
)

// CircuitBreakerOptions controls in-process upstream protection.
type CircuitBreakerOptions struct {
	ErrorRateThreshold        float64
	OpenTimeout               time.Duration
	HalfOpenSuccessesRequired int
	SampleSize                int
	Disabled                  bool
}

// CircuitBreakerDecision describes whether a request may pass the breaker.
type CircuitBreakerDecision struct {
	Allowed       bool
	State         CircuitBreakerState
	RetryAfter    time.Duration
	ProbeInFlight bool
}

type circuitBreaker struct {
	mu                         sync.Mutex
	clock                      Clock
	windowSize                 int
	errorRateThreshold         float64
	openTimeout                time.Duration
	halfOpenSuccessesRequired  int
	minSamplesToTrip           int
	disabled                   bool
	state                      CircuitBreakerState
	openedAt                   time.Time
	probeInFlight              bool
	consecutiveHalfOpenSuccess int
	values                     []bool
	head                       int
	total                      int
	failures                   int
}

func newCircuitBreaker(clock Clock, options CircuitBreakerOptions) *circuitBreaker {
	if clock == nil {
		clock = systemClock{}
	}

	windowSize := options.SampleSize
	if windowSize <= 0 {
		windowSize = 100
	}

	threshold := options.ErrorRateThreshold
	if threshold <= 0 || threshold > 1 {
		threshold = 0.5
	}

	openTimeout := options.OpenTimeout
	if openTimeout <= 0 {
		openTimeout = 60 * time.Second
	}

	halfOpenSuccessesRequired := options.HalfOpenSuccessesRequired
	if halfOpenSuccessesRequired <= 0 {
		halfOpenSuccessesRequired = 2
	}

	minSamplesToTrip := windowSize
	if minSamplesToTrip > 10 {
		minSamplesToTrip = 10
	}

	return &circuitBreaker{
		clock:                     clock,
		windowSize:                windowSize,
		errorRateThreshold:        threshold,
		openTimeout:               openTimeout,
		halfOpenSuccessesRequired: halfOpenSuccessesRequired,
		minSamplesToTrip:          minSamplesToTrip,
		disabled:                  options.Disabled,
		state:                     CircuitBreakerClosed,
		values:                    make([]bool, windowSize),
	}
}

func (b *circuitBreaker) Allow() CircuitBreakerDecision {
	if b == nil || b.disabled {
		return CircuitBreakerDecision{Allowed: true, State: CircuitBreakerClosed}
	}

	b.mu.Lock()
	defer b.mu.Unlock()

	b.maybeHalfOpenLocked()

	switch b.state {
	case CircuitBreakerOpen:
		return CircuitBreakerDecision{
			Allowed:    false,
			State:      CircuitBreakerOpen,
			RetryAfter: b.remainingOpenTimeoutLocked(),
		}
	case CircuitBreakerHalfOpen:
		if b.probeInFlight {
			return CircuitBreakerDecision{
				Allowed:       false,
				State:         CircuitBreakerHalfOpen,
				RetryAfter:    b.openTimeout,
				ProbeInFlight: true,
			}
		}
		b.probeInFlight = true
		return CircuitBreakerDecision{
			Allowed:       true,
			State:         CircuitBreakerHalfOpen,
			ProbeInFlight: true,
		}
	default:
		return CircuitBreakerDecision{Allowed: true, State: CircuitBreakerClosed}
	}
}

func (b *circuitBreaker) RecordOutcome(success bool) CircuitBreakerDecision {
	if b == nil || b.disabled {
		return CircuitBreakerDecision{Allowed: true, State: CircuitBreakerClosed}
	}

	b.mu.Lock()
	defer b.mu.Unlock()

	b.pushOutcomeLocked(!success)
	b.maybeHalfOpenLocked()

	switch b.state {
	case CircuitBreakerHalfOpen:
		b.probeInFlight = false
		if success {
			b.consecutiveHalfOpenSuccess++
			if b.consecutiveHalfOpenSuccess >= b.halfOpenSuccessesRequired {
				b.closeLocked()
			}
		} else {
			b.openLocked()
		}
	case CircuitBreakerClosed:
		if b.total >= b.minSamplesToTrip && b.errorRateLocked() > b.errorRateThreshold {
			b.openLocked()
		}
	}

	decision := CircuitBreakerDecision{
		Allowed:       b.state != CircuitBreakerOpen,
		State:         b.state,
		ProbeInFlight: b.probeInFlight,
	}
	if b.state == CircuitBreakerOpen {
		decision.RetryAfter = b.openTimeout
	}
	return decision
}

func (b *circuitBreaker) State() CircuitBreakerState {
	if b == nil || b.disabled {
		return CircuitBreakerClosed
	}

	b.mu.Lock()
	defer b.mu.Unlock()
	b.maybeHalfOpenLocked()
	return b.state
}

func (b *circuitBreaker) maybeHalfOpenLocked() {
	if b.state == CircuitBreakerOpen && b.clock.Now().Sub(b.openedAt) >= b.openTimeout {
		b.state = CircuitBreakerHalfOpen
		b.probeInFlight = false
		b.consecutiveHalfOpenSuccess = 0
	}
}

func (b *circuitBreaker) openLocked() {
	b.state = CircuitBreakerOpen
	b.openedAt = b.clock.Now()
	b.probeInFlight = false
	b.consecutiveHalfOpenSuccess = 0
}

func (b *circuitBreaker) closeLocked() {
	b.state = CircuitBreakerClosed
	b.probeInFlight = false
	b.consecutiveHalfOpenSuccess = 0
	b.values = make([]bool, b.windowSize)
	b.head = 0
	b.total = 0
	b.failures = 0
}

func (b *circuitBreaker) remainingOpenTimeoutLocked() time.Duration {
	remaining := b.openTimeout - b.clock.Now().Sub(b.openedAt)
	if remaining <= 0 {
		return time.Millisecond
	}
	return remaining
}

func (b *circuitBreaker) pushOutcomeLocked(failed bool) {
	outgoing := b.values[b.head]
	if b.total >= b.windowSize && outgoing {
		b.failures--
	}

	b.values[b.head] = failed
	if failed {
		b.failures++
	}

	b.head = (b.head + 1) % b.windowSize
	if b.total < b.windowSize {
		b.total++
	}
}

func (b *circuitBreaker) errorRateLocked() float64 {
	if b.total == 0 {
		return 0
	}
	return float64(b.failures) / float64(b.total)
}
