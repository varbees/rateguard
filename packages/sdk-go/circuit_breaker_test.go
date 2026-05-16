package rateguard

import (
	"net/http"
	"net/http/httptest"
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
