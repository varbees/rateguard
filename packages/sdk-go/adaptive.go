package rateguard

import (
	"context"
	"math"
	"sync"
	"time"
)

// AdaptiveOptions tunes the adaptive rate limiting control loop.
// The zero value selects the documented defaults.
type AdaptiveOptions struct {
	// MinFactor / MaxFactor bound how far the effective limit may drift from
	// the configured policy (defaults 0.25 and 2.0). The configured policy is
	// always the anchor — adaptation scales it, never replaces it.
	MinFactor float64
	MaxFactor float64
	// TargetErrorRate is the upstream error rate the controller steers under
	// (default 0.05). Above it, limits shrink multiplicatively.
	TargetErrorRate float64
	// IncreaseStep is the additive factor gain per healthy interval
	// (default 0.05). DecreaseFactor is the multiplicative cut on breach
	// (default 0.5). AIMD, the same shape TCP congestion control uses.
	IncreaseStep   float64
	DecreaseFactor float64
	// AdjustInterval rate-limits controller decisions (default 1s).
	AdjustInterval time.Duration
	// EMAAlpha is the exponential moving average weight for new outcome
	// samples (default 0.2).
	EMAAlpha float64
}

func (o AdaptiveOptions) withDefaults() AdaptiveOptions {
	if o.MinFactor <= 0 {
		o.MinFactor = 0.25
	}
	if o.MaxFactor <= 0 {
		o.MaxFactor = 2.0
	}
	if o.MaxFactor < o.MinFactor {
		o.MaxFactor = o.MinFactor
	}
	if o.TargetErrorRate <= 0 {
		o.TargetErrorRate = 0.05
	}
	if o.IncreaseStep <= 0 {
		o.IncreaseStep = 0.05
	}
	if o.DecreaseFactor <= 0 || o.DecreaseFactor >= 1 {
		o.DecreaseFactor = 0.5
	}
	if o.AdjustInterval <= 0 {
		o.AdjustInterval = time.Second
	}
	if o.EMAAlpha <= 0 || o.EMAAlpha > 1 {
		o.EMAAlpha = 0.2
	}
	return o
}

// AdaptiveLimiter wraps any Limiter and auto-tunes the effective policy from
// observed upstream outcomes, instead of trusting a static config forever.
// Static limits are provably suboptimal under shifting traffic
// (arXiv:2511.03279); the fix does not need ML — an EMA of the error rate
// driving an AIMD controller captures the result:
//
//   - healthy upstream → limits grow additively toward MaxFactor × policy,
//   - error rate above target → limits cut multiplicatively toward
//     MinFactor × policy,
//   - the cut triggers at 80% of the breach threshold, so the limiter sheds
//     load *before* the circuit breaker has to trip (predictive, not
//     reactive).
//
// Peek scales identically to Allow, so agent pre-flight answers stay honest
// while adaptation moves the limit.
type AdaptiveLimiter struct {
	inner Limiter
	opts  AdaptiveOptions
	clock Clock

	mu         sync.Mutex
	factor     float64
	errorEMA   float64
	sampled    bool
	lastAdjust time.Time
}

// NewAdaptiveLimiter wraps inner with the adaptive control loop.
func NewAdaptiveLimiter(inner Limiter, opts AdaptiveOptions) *AdaptiveLimiter {
	return newAdaptiveLimiterWithClock(inner, opts, systemClock{})
}

func newAdaptiveLimiterWithClock(inner Limiter, opts AdaptiveOptions, clock Clock) *AdaptiveLimiter {
	if inner == nil {
		inner = NewShardedLimiter()
	}
	if clock == nil {
		clock = systemClock{}
	}
	return &AdaptiveLimiter{
		inner:  inner,
		opts:   opts.withDefaults(),
		clock:  clock,
		factor: 1.0,
	}
}

// Factor reports the current policy scaling factor (1.0 = configured policy).
func (a *AdaptiveLimiter) Factor() float64 {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.factor
}

// ErrorRate reports the current EMA of upstream failures.
func (a *AdaptiveLimiter) ErrorRate() float64 {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.errorEMA
}

// RecordOutcome feeds one upstream result (success = HTTP status < 500) into
// the controller. The middleware calls this on the same signal it already
// feeds the circuit breaker.
func (a *AdaptiveLimiter) RecordOutcome(success bool) {
	now := a.clock.Now()

	a.mu.Lock()
	defer a.mu.Unlock()

	sample := 0.0
	if !success {
		sample = 1.0
	}
	if !a.sampled {
		a.errorEMA = sample
		a.sampled = true
	} else {
		a.errorEMA = a.opts.EMAAlpha*sample + (1-a.opts.EMAAlpha)*a.errorEMA
	}

	if now.Sub(a.lastAdjust) < a.opts.AdjustInterval {
		return
	}
	a.lastAdjust = now

	// Predictive: act at 80% of the target so the breaker rarely has to.
	switch {
	case a.errorEMA >= 0.8*a.opts.TargetErrorRate:
		a.factor = math.Max(a.opts.MinFactor, a.factor*a.opts.DecreaseFactor)
	default:
		a.factor = math.Min(a.opts.MaxFactor, a.factor+a.opts.IncreaseStep)
	}
}

func (a *AdaptiveLimiter) scaled(policy PolicyPreset) PolicyPreset {
	a.mu.Lock()
	factor := a.factor
	a.mu.Unlock()

	if factor == 1.0 || policy.RequestsPerSecond <= 0 || policy.Burst <= 0 {
		return policy
	}

	scaledRPS := int(math.Round(float64(policy.RequestsPerSecond) * factor))
	scaledBurst := int(math.Round(float64(policy.Burst) * factor))
	if scaledRPS < 1 {
		scaledRPS = 1
	}
	if scaledBurst < 1 {
		scaledBurst = 1
	}

	policy.RequestsPerSecond = scaledRPS
	policy.Burst = scaledBurst
	return policy
}

func (a *AdaptiveLimiter) Allow(ctx context.Context, key string, policy PolicyPreset) (AdmissionDecision, error) {
	return a.inner.Allow(ctx, key, a.scaled(policy))
}

func (a *AdaptiveLimiter) Peek(ctx context.Context, key string, policy PolicyPreset) (AdmissionDecision, error) {
	return a.inner.Peek(ctx, key, a.scaled(policy))
}
