package ratelimiter

import (
	"context"
	"time"

	"golang.org/x/time/rate"
)

// RateLimiter controls the rate of job submissions
type RateLimiter struct {
	limiter *rate.Limiter
	enabled bool
}

// New creates a new rate limiter
// rps: requests per second
// burst: maximum burst size (allows temporary spikes)
func New(rps int, burst int, enabled bool) *RateLimiter {
	return &RateLimiter{
		limiter: rate.NewLimiter(rate.Limit(rps), burst),
		enabled: enabled,
	}
}

// Wait blocks until a token is available or context is cancelled
// This is the token bucket algorithm:
// - Tokens are added at a constant rate (rps)
// - Bucket can hold up to 'burst' tokens
// - Each request consumes one token
// - If no tokens available, request waits
func (rl *RateLimiter) Wait(ctx context.Context) error {
	if !rl.enabled {
		return nil // Rate limiting disabled
	}
	
	return rl.limiter.Wait(ctx)
}

// Allow checks if a request can proceed without waiting
// Returns true if a token is immediately available
func (rl *RateLimiter) Allow() bool {
	if !rl.enabled {
		return true
	}
	
	return rl.limiter.Allow()
}

// SetRate dynamically updates the rate limit
// Useful for adaptive rate limiting based on system load
func (rl *RateLimiter) SetRate(rps int) {
	if rl.enabled {
		rl.limiter.SetLimit(rate.Limit(rps))
	}
}

// SetBurst dynamically updates the burst size
func (rl *RateLimiter) SetBurst(burst int) {
	if rl.enabled {
		rl.limiter.SetBurst(burst)
	}
}

// GetRate returns current rate limit
func (rl *RateLimiter) GetRate() float64 {
	return float64(rl.limiter.Limit())
}

// GetBurst returns current burst size
func (rl *RateLimiter) GetBurst() int {
	return rl.limiter.Burst()
}

// WaitN blocks until n tokens are available
// Useful for batch operations
func (rl *RateLimiter) WaitN(ctx context.Context, n int) error {
	if !rl.enabled {
		return nil
	}
	
	return rl.limiter.WaitN(ctx, n)
}

// Reserve returns a Reservation that indicates how long the caller must wait
// before n events can happen. Useful for scheduling.
func (rl *RateLimiter) Reserve(n int) *rate.Reservation {
	if !rl.enabled {
		return &rate.Reservation{}
	}
	
	return rl.limiter.ReserveN(time.Now(), n)
}

// IsEnabled returns whether rate limiting is enabled
func (rl *RateLimiter) IsEnabled() bool {
	return rl.enabled
}

// Enable enables rate limiting
func (rl *RateLimiter) Enable() {
	rl.enabled = true
}

// Disable disables rate limiting
func (rl *RateLimiter) Disable() {
	rl.enabled = false
}
