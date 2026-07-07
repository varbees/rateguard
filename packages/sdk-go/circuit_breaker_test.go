package rateguard

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type fakeCircuitClock struct {
	now time.Time
}

func (c *fakeCircuitClock) Now() time.Time {
	return c.now
}

func (c *fakeCircuitClock) Advance(d time.Duration) {
	c.now = c.now.Add(d)
}

func TestCircuitBreakerOpensAndRecovers(t *testing.T) {
	t.Parallel()

	clock := &fakeCircuitClock{now: time.Date(2026, 5, 16, 10, 0, 0, 0, time.UTC)}
	breaker := newCircuitBreaker(clock, CircuitBreakerOptions{
		ErrorRateThreshold:        0.5,
		OpenTimeout:               time.Second,
		HalfOpenSuccessesRequired: 2,
		SampleSize:                10,
	})

	for i := 0; i < 9; i++ {
		if decision := breaker.Allow(); !decision.Allowed {
			t.Fatalf("failure %d unexpectedly blocked: %+v", i, decision)
		}
		decision := breaker.RecordOutcome(false)
		if decision.State != CircuitBreakerClosed {
			t.Fatalf("state after %d failures = %q, want closed", i+1, decision.State)
		}
	}

	if decision := breaker.Allow(); !decision.Allowed {
		t.Fatalf("tenth failure unexpectedly blocked: %+v", decision)
	}
	decision := breaker.RecordOutcome(false)
	if decision.State != CircuitBreakerOpen {
		t.Fatalf("state after tenth failure = %q, want open", decision.State)
	}

	blocked := breaker.Allow()
	if blocked.Allowed || blocked.State != CircuitBreakerOpen || blocked.RetryAfter <= 0 {
		t.Fatalf("open breaker decision = %+v, want blocked open decision", blocked)
	}

	clock.Advance(2 * time.Second)
	probe := breaker.Allow()
	if !probe.Allowed || probe.State != CircuitBreakerHalfOpen || !probe.ProbeInFlight {
		t.Fatalf("probe decision = %+v, want half-open probe", probe)
	}
	if blockedProbe := breaker.Allow(); blockedProbe.Allowed || blockedProbe.State != CircuitBreakerHalfOpen {
		t.Fatalf("second probe decision = %+v, want blocked half-open", blockedProbe)
	}

	if recovered := breaker.RecordOutcome(true); recovered.State != CircuitBreakerHalfOpen {
		t.Fatalf("state after first recovery success = %q, want half-open", recovered.State)
	}
	if probe = breaker.Allow(); !probe.Allowed || probe.State != CircuitBreakerHalfOpen {
		t.Fatalf("second recovery probe = %+v, want allowed half-open", probe)
	}
	if recovered := breaker.RecordOutcome(true); recovered.State != CircuitBreakerClosed {
		t.Fatalf("state after second recovery success = %q, want closed", recovered.State)
	}
	if decision := breaker.RecordOutcome(true); decision.State != CircuitBreakerClosed {
		t.Fatalf("state after fresh closed success = %q, want closed", decision.State)
	}
}

// TestReleaseProbeUnwedgesHalfOpen reproduces the bug this SDK shipped with:
// a half-open probe granted by Allow() that never got an outcome recorded
// (because it was denied by something other than the upstream call) used
// to leak forever, permanently wedging the breaker. ReleaseProbe must clear
// it without counting as a success or a failure.
func TestReleaseProbeUnwedgesHalfOpen(t *testing.T) {
	t.Parallel()

	clock := &fakeCircuitClock{now: time.Date(2026, 5, 16, 10, 0, 0, 0, time.UTC)}
	breaker := newCircuitBreaker(clock, CircuitBreakerOptions{
		ErrorRateThreshold:        0.5,
		OpenTimeout:               time.Second,
		HalfOpenSuccessesRequired: 1,
		SampleSize:                10,
	})

	for i := 0; i < 10; i++ {
		breaker.Allow()
		breaker.RecordOutcome(false)
	}
	if state := breaker.State(); state != CircuitBreakerOpen {
		t.Fatalf("state after 10 failures = %q, want open", state)
	}

	clock.Advance(2 * time.Second)
	probe := breaker.Allow()
	if !probe.Allowed || !probe.ProbeInFlight {
		t.Fatalf("probe decision = %+v, want granted half-open probe", probe)
	}

	// Simulate the probe request getting denied by an unrelated gate (rate
	// limit, guardrail, token budget) before it ever reaches upstream —
	// nothing calls RecordOutcome. Without ReleaseProbe, every future
	// Allow() would report probeInFlight forever.
	stuck := breaker.Allow()
	if stuck.Allowed || !stuck.ProbeInFlight {
		t.Fatalf("second Allow while probe outstanding = %+v, want blocked with probe still in flight", stuck)
	}

	breaker.ReleaseProbe()

	freed := breaker.Allow()
	if !freed.Allowed || !freed.ProbeInFlight {
		t.Fatalf("Allow after ReleaseProbe = %+v, want a fresh probe granted", freed)
	}
	if recovered := breaker.RecordOutcome(true); recovered.State != CircuitBreakerClosed {
		t.Fatalf("state after the freed probe succeeds = %q, want closed (HalfOpenSuccessesRequired=1)", recovered.State)
	}
}

// TestHTTPMiddlewareRecoversAfterHalfOpenProbeDeniedByGuardrail reproduces
// the exact production scenario: the breaker opens on upstream failures,
// the open timeout elapses, and the very first recovery request happens to
// trip a content guardrail (PII/prompt-injection) before it ever reaches
// upstream. That request must NOT consume the breaker's probe permanently
// — a subsequent clean request has to get a real shot at testing upstream,
// not be wedged in half-open forever.
func TestHTTPMiddlewareRecoversAfterHalfOpenProbeDeniedByGuardrail(t *testing.T) {
	t.Parallel()

	clock := &fakeCircuitClock{now: time.Date(2026, 5, 16, 10, 0, 0, 0, time.UTC)}
	emitter := &recordingEmitter{}
	upstreamCalls := 0
	sdk := New(Config{
		Preset:            PresetStandard,
		RequestsPerSecond: 1000,
		Burst:             1000,
		EventEmitter:      emitter,
		Clock:             clock,
		Guardrails:        StandardGuardrails(),
		CircuitBreaker: CircuitBreakerOptions{
			ErrorRateThreshold:        0.5,
			OpenTimeout:               time.Minute,
			HalfOpenSuccessesRequired: 1,
			SampleSize:                1,
		},
	})

	handler := sdk.HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		upstreamCalls++
		w.WriteHeader(http.StatusInternalServerError)
	}))

	cleanBody := func() *strings.Reader { return strings.NewReader(`{"prompt":"summarize this document"}`) }
	piiBody := func() *strings.Reader { return strings.NewReader(`{"prompt":"email me at attacker@example.com"}`) }

	// Trip the breaker open with a clean request that fails upstream.
	tripped := httptest.NewRecorder()
	handler.ServeHTTP(tripped, httptest.NewRequest(http.MethodPost, "http://example.com/upstream", cleanBody()))
	if tripped.Code != http.StatusInternalServerError {
		t.Fatalf("tripping request status = %d, want 500", tripped.Code)
	}

	clock.Advance(2 * time.Minute)

	// This request claims the half-open probe, then gets denied by the
	// guardrail before it ever reaches upstream — RecordOutcome never runs.
	blocked := httptest.NewRecorder()
	handler.ServeHTTP(blocked, httptest.NewRequest(http.MethodPost, "http://example.com/upstream", piiBody()))
	if blocked.Code != http.StatusUnprocessableEntity {
		t.Fatalf("guardrail-blocked probe status = %d, want 422 (test assumption broken)", blocked.Code)
	}

	// The bug: without releasing the probe, every request from here on
	// would see the breaker permanently wedged in half-open and never
	// reach upstream again, no matter how much time passes.
	recovered := httptest.NewRecorder()
	handler.ServeHTTP(recovered, httptest.NewRequest(http.MethodPost, "http://example.com/upstream", cleanBody()))
	if recovered.Code == http.StatusServiceUnavailable {
		t.Fatalf("recovery request status = %d (circuit-open), want the request to reach upstream — probe leaked", recovered.Code)
	}
	if upstreamCalls != 2 {
		t.Fatalf("upstream calls = %d, want 2 (trip + recovery) — the guardrail-blocked request must not have leaked the probe or reached upstream", upstreamCalls)
	}
}

func TestHTTPMiddlewareRejectsWhenCircuitOpen(t *testing.T) {
	t.Parallel()

	clock := &fakeCircuitClock{now: time.Date(2026, 5, 16, 10, 0, 0, 0, time.UTC)}
	emitter := &recordingEmitter{}
	calls := 0
	sdk := New(Config{
		Preset:            PresetStandard,
		RequestsPerSecond: 100,
		Burst:             100,
		EventEmitter:      emitter,
		Clock:             clock,
		CircuitBreaker: CircuitBreakerOptions{
			ErrorRateThreshold:        0.5,
			OpenTimeout:               time.Minute,
			HalfOpenSuccessesRequired: 1,
			SampleSize:                2,
		},
	})

	handler := sdk.HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.WriteHeader(http.StatusInternalServerError)
	}))

	for i := 0; i < 2; i++ {
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "http://example.com/upstream", nil))
		if res.Code != http.StatusInternalServerError {
			t.Fatalf("failure %d status = %d, want 500", i+1, res.Code)
		}
	}

	blocked := httptest.NewRecorder()
	handler.ServeHTTP(blocked, httptest.NewRequest(http.MethodGet, "http://example.com/upstream", nil))

	if blocked.Code != http.StatusServiceUnavailable {
		t.Fatalf("blocked status = %d, want 503", blocked.Code)
	}
	if got := blocked.Header().Get("Retry-After"); got == "" {
		t.Fatal("Retry-After header should be set on circuit rejection")
	}
	if calls != 2 {
		t.Fatalf("handler calls = %d, want 2", calls)
	}

	events := emitter.Events()
	if len(events) != 3 {
		t.Fatalf("events = %d, want 3", len(events))
	}
	if events[1].Payload.CircuitBreakerState != string(CircuitBreakerOpen) {
		t.Fatalf("second event circuit state = %q, want open", events[1].Payload.CircuitBreakerState)
	}
	if events[2].Payload.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("blocked event status = %d, want 503", events[2].Payload.StatusCode)
	}
	if events[2].Payload.CircuitBreakerState != string(CircuitBreakerOpen) {
		t.Fatalf("blocked event circuit state = %q, want open", events[2].Payload.CircuitBreakerState)
	}
}
