package rateguard

import (
	"context"
	"sync"
	"testing"
	"time"
)

// recordingLimiter captures the policies it is asked to enforce.
type recordingLimiter struct {
	mu       sync.Mutex
	policies []PolicyPreset
}

func (r *recordingLimiter) Allow(_ context.Context, _ string, policy PolicyPreset) (AdmissionDecision, error) {
	r.mu.Lock()
	r.policies = append(r.policies, policy)
	r.mu.Unlock()
	return AdmissionDecision{Allowed: true, Applied: true, Remaining: 1, Limit: policy.RequestsPerSecond}, nil
}

func (r *recordingLimiter) Peek(_ context.Context, _ string, policy PolicyPreset) (AdmissionDecision, error) {
	return r.Allow(context.Background(), "", policy)
}

func (r *recordingLimiter) last() PolicyPreset {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.policies) == 0 {
		return PolicyPreset{}
	}
	return r.policies[len(r.policies)-1]
}

func TestAdaptiveLimiterDefaultsAndPassthrough(t *testing.T) {
	inner := &recordingLimiter{}
	a := NewAdaptiveLimiter(inner, AdaptiveOptions{})

	if got := a.Factor(); got != 1.0 {
		t.Fatalf("initial factor = %v, want 1.0", got)
	}

	policy := PolicyPreset{RequestsPerSecond: 100, Burst: 200}
	if _, err := a.Allow(context.Background(), "k", policy); err != nil {
		t.Fatal(err)
	}
	if got := inner.last(); got.RequestsPerSecond != 100 || got.Burst != 200 {
		t.Fatalf("factor 1.0 must pass the policy through unchanged, got %+v", got)
	}
}

func TestAdaptiveLimiterCutsUnderErrors(t *testing.T) {
	clock := &fakeLimiterClock{now: time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)}
	inner := &recordingLimiter{}
	a := newAdaptiveLimiterWithClock(inner, AdaptiveOptions{TargetErrorRate: 0.05}, clock)

	// Sustained failures: EMA rises above 80% of target fast; each adjust
	// interval halves the factor down to the floor.
	for i := 0; i < 20; i++ {
		clock.advance(time.Second)
		a.RecordOutcome(false)
	}

	if got := a.Factor(); got != 0.25 {
		t.Fatalf("factor after sustained errors = %v, want floor 0.25", got)
	}

	policy := PolicyPreset{RequestsPerSecond: 100, Burst: 200}
	if _, err := a.Allow(context.Background(), "k", policy); err != nil {
		t.Fatal(err)
	}
	got := inner.last()
	if got.RequestsPerSecond != 25 || got.Burst != 50 {
		t.Fatalf("scaled policy = %+v, want rps=25 burst=50", got)
	}
}

func TestAdaptiveLimiterRecoversWhenHealthy(t *testing.T) {
	clock := &fakeLimiterClock{now: time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)}
	a := newAdaptiveLimiterWithClock(&recordingLimiter{}, AdaptiveOptions{}, clock)

	// Crash the factor first.
	for i := 0; i < 10; i++ {
		clock.advance(time.Second)
		a.RecordOutcome(false)
	}
	floor := a.Factor()

	// Healthy traffic: additive recovery, eventually capped at MaxFactor.
	for i := 0; i < 500; i++ {
		clock.advance(time.Second)
		a.RecordOutcome(true)
	}

	if got := a.Factor(); got <= floor {
		t.Fatalf("factor did not recover: %v <= %v", got, floor)
	}
	if got := a.Factor(); got > 2.0 {
		t.Fatalf("factor exceeded MaxFactor: %v", got)
	}
}

func TestAdaptiveLimiterPredictiveThreshold(t *testing.T) {
	clock := &fakeLimiterClock{now: time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)}
	a := newAdaptiveLimiterWithClock(&recordingLimiter{}, AdaptiveOptions{TargetErrorRate: 0.5}, clock)

	// Walk the EMA (alpha 0.2) deterministically into the predictive band:
	// above the 0.8 × target trigger (0.4) but below the target itself (0.5).
	clock.advance(time.Second)
	a.RecordOutcome(false) // EMA 1.0 — adjusts once (factor 1.0 → 0.5)
	for i := 0; i < 5; i++ {
		a.RecordOutcome(true) // within the interval: EMA decays to 0.8^5 ≈ 0.328
	}
	factorBefore := a.Factor()

	clock.advance(2 * time.Second)
	a.RecordOutcome(false) // EMA = 0.2 + 0.8×0.328 ≈ 0.462 — in the band

	rate := a.ErrorRate()
	if rate >= 0.5 || rate <= 0.4 {
		t.Fatalf("test premise broken: EMA %v must sit in the predictive band (0.4, 0.5)", rate)
	}
	if got := a.Factor(); got >= factorBefore {
		t.Fatalf("controller must cut while error rate is still below target (predictive): factor %v -> %v", factorBefore, got)
	}
}

func TestAdaptiveLimiterAdjustIntervalRateLimitsChanges(t *testing.T) {
	clock := &fakeLimiterClock{now: time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)}
	a := newAdaptiveLimiterWithClock(&recordingLimiter{}, AdaptiveOptions{}, clock)

	// Many failures inside one interval: only the first sample after the
	// interval boundary may adjust — one halving, not ten.
	clock.advance(time.Second)
	for i := 0; i < 10; i++ {
		a.RecordOutcome(false)
	}

	if got := a.Factor(); got < 0.5 {
		t.Fatalf("multiple adjustments within one interval: factor = %v, want 0.5", got)
	}
}

func TestSDKWiresAdaptiveLimiter(t *testing.T) {
	sdk := New(Config{Preset: "standard", AdaptiveRateLimit: true})
	if sdk.adaptive == nil {
		t.Fatal("AdaptiveRateLimit: true must install the adaptive limiter")
	}
	if _, ok := sdk.limiter.(*AdaptiveLimiter); !ok {
		t.Fatalf("limiter chain head = %T, want *AdaptiveLimiter", sdk.limiter)
	}

	plain := New(Config{Preset: "standard"})
	if plain.adaptive != nil {
		t.Fatal("adaptive limiter must be opt-in")
	}
}

func TestSDKAdaptiveRateLimitFactorReporting(t *testing.T) {
	plain := New(Config{Preset: "standard"})
	factor, rate, enabled := plain.AdaptiveRateLimitFactor()
	if enabled {
		t.Fatal("factor reporting must be disabled when AdaptiveRateLimit is not set")
	}
	if factor != 1.0 || rate != 0 {
		t.Fatalf("disabled reporting should return neutral values, got factor=%v rate=%v", factor, rate)
	}

	adaptive := New(Config{Preset: "standard", AdaptiveRateLimit: true})
	factor, _, enabled = adaptive.AdaptiveRateLimitFactor()
	if !enabled {
		t.Fatal("factor reporting must be enabled when AdaptiveRateLimit is set")
	}
	if factor != 1.0 {
		t.Fatalf("a fresh adaptive limiter should start at factor 1.0, got %v", factor)
	}
}
