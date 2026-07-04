package rateguard

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

type recordingEmitter struct {
	mu     sync.Mutex
	events []EventEnvelope
}

func (r *recordingEmitter) Emit(_ context.Context, event EventEnvelope) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, event)
	return nil
}

func (r *recordingEmitter) Events() []EventEnvelope {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([]EventEnvelope, len(r.events))
	copy(out, r.events)
	return out
}

func TestHTTPMiddlewareAllowsAndEmitsEvent(t *testing.T) {
	t.Parallel()

	emitter := &recordingEmitter{}
	sdk := New(Config{
		Preset:            "starter",
		TenantID:          "tenant-a",
		RouteID:           "route-a",
		UpstreamID:        "upstream-a",
		RequestsPerSecond: 100,
		Burst:             100,
		EventEmitter:      emitter,
	})

	req := httptest.NewRequest(http.MethodGet, "http://example.com/v1/widgets", nil)
	req.Header.Set("traceparent", "00-0123456789abcdef0123456789abcdef-abcdef0123456789-01")
	rr := httptest.NewRecorder()

	sdk.HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Handler", "ok")
		w.WriteHeader(http.StatusNoContent)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("status code = %d, want %d", rr.Code, http.StatusNoContent)
	}
	if got := rr.Header().Get("X-RateGuard-Preset"); got != "standard" {
		t.Fatalf("X-RateGuard-Preset = %q, want %q", got, "standard")
	}
	if got := rr.Header().Get("X-RateGuard-Limit"); got != "100" {
		t.Fatalf("X-RateGuard-Limit = %q, want %q", got, "100")
	}
	if got := rr.Header().Get("X-RateGuard-Remaining"); got == "" {
		t.Fatal("X-RateGuard-Remaining should be set")
	}

	events := emitter.Events()
	if len(events) != 1 {
		t.Fatalf("recorded events = %d, want 1", len(events))
	}

	event := events[0]
	if event.EventType != EventTypeRequestCompleted {
		t.Fatalf("event type = %q, want %q", event.EventType, EventTypeRequestCompleted)
	}
	if event.TenantID != "tenant-a" || event.RouteID != "route-a" || event.UpstreamID != "upstream-a" {
		t.Fatalf("unexpected envelope routing fields: %+v", event)
	}
	if event.TraceID != "0123456789abcdef0123456789abcdef" {
		t.Fatalf("trace id = %q, want extracted traceparent id", event.TraceID)
	}
	if event.EventID == "" {
		t.Fatal("event id should not be empty")
	}
	if event.OccurredAt.IsZero() {
		t.Fatal("occurred_at should not be zero")
	}

	payload := event.Payload
	if payload.Method != http.MethodGet {
		t.Fatalf("payload method = %q, want %q", payload.Method, http.MethodGet)
	}
	if payload.Path != "/v1/widgets" {
		t.Fatalf("payload path = %q, want /v1/widgets", payload.Path)
	}
	if payload.StatusCode != http.StatusNoContent {
		t.Fatalf("payload status_code = %d, want %d", payload.StatusCode, http.StatusNoContent)
	}
	if !payload.RateLimitApplied || !payload.RateLimitAllowed {
		t.Fatalf("expected request to be allowed with rate limiting applied, got %+v", payload)
	}
	if payload.Preset != "standard" {
		t.Fatalf("payload preset = %q, want standard", payload.Preset)
	}
}

func TestHTTPMiddlewareRejectsWhenLimitExceeded(t *testing.T) {
	t.Parallel()

	emitter := &recordingEmitter{}
	calls := 0
	sdk := New(Config{
		Preset:            "dev",
		RequestsPerSecond: 1,
		Burst:             1,
		EventEmitter:      emitter,
	})

	handler := sdk.HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusOK)
	}))

	firstReq := httptest.NewRequest(http.MethodGet, "http://example.com/v1/widgets", nil)
	firstRes := httptest.NewRecorder()
	handler.ServeHTTP(firstRes, firstReq)
	if firstRes.Code != http.StatusOK {
		t.Fatalf("first status = %d, want %d", firstRes.Code, http.StatusOK)
	}

	secondReq := httptest.NewRequest(http.MethodGet, "http://example.com/v1/widgets", nil)
	secondRes := httptest.NewRecorder()
	handler.ServeHTTP(secondRes, secondReq)

	if secondRes.Code != http.StatusTooManyRequests {
		t.Fatalf("second status = %d, want %d", secondRes.Code, http.StatusTooManyRequests)
	}
	if calls != 1 {
		t.Fatalf("handler call count = %d, want 1", calls)
	}
	if got := secondRes.Header().Get("Retry-After"); got == "" {
		t.Fatal("Retry-After header should be set on rate limit rejection")
	}
	if got := secondRes.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", got)
	}
	if got := secondRes.Header().Get("X-RateGuard-Limit"); got != "1" {
		t.Fatalf("X-RateGuard-Limit = %q, want %q", got, "1")
	}
	if got := secondRes.Header().Get("X-RateGuard-Remaining"); got != "0" {
		t.Fatalf("X-RateGuard-Remaining = %q, want %q", got, "0")
	}

	events := emitter.Events()
	if len(events) != 2 {
		t.Fatalf("recorded events = %d, want 2", len(events))
	}
	if events[1].EventType != EventTypeRequestRateLimited {
		t.Fatalf("second event type = %q, want %q", events[1].EventType, EventTypeRequestRateLimited)
	}
	if events[1].Payload.RateLimitAllowed {
		t.Fatalf("expected second request to be denied, got %+v", events[1].Payload)
	}
	if events[1].Payload.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("second payload status_code = %d, want %d", events[1].Payload.StatusCode, http.StatusTooManyRequests)
	}
}

func TestChiMiddlewareSharesHTTPBehavior(t *testing.T) {
	t.Parallel()

	sdk := New(Config{
		Preset:            "dev",
		RequestsPerSecond: 100,
		Burst:             100,
		EventEmitter:      &recordingEmitter{},
	})

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://example.com/chi", nil)

	sdk.ChiMiddleware()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusAccepted {
		t.Fatalf("status code = %d, want %d", rr.Code, http.StatusAccepted)
	}
}

func TestMiddlewareAliasSharesHTTPBehavior(t *testing.T) {
	t.Parallel()

	sdk := New(Config{
		Preset:            "dev",
		RequestsPerSecond: 100,
		Burst:             100,
		EventEmitter:      &recordingEmitter{},
	})

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://example.com/chi", nil)

	sdk.Middleware()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusAccepted {
		t.Fatalf("status code = %d, want %d", rr.Code, http.StatusAccepted)
	}
}

func TestEventEnvelopeJSONRoundTrip(t *testing.T) {
	t.Parallel()

	original := EventEnvelope{
		EventID:    "evt-123",
		EventType:  EventTypeRequestCompleted,
		TenantID:   "tenant-a",
		RouteID:    "route-a",
		UpstreamID: "upstream-a",
		TraceID:    "trace-a",
		OccurredAt: eventTimeForTest(t),
		Payload: RequestEventPayload{
			Method:              http.MethodGet,
			Path:                "/v1/widgets",
			StatusCode:          http.StatusOK,
			LatencyMS:           10,
			RateLimitApplied:    true,
			RateLimitAllowed:    true,
			RateLimitLimit:      100,
			RateLimitRemaining:  99,
			Preset:              "standard",
			CircuitBreakerState: "closed",
			QueueDepth:          0,
		},
	}

	encoded, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal error = %v", err)
	}

	var decoded EventEnvelope
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("json.Unmarshal error = %v", err)
	}

	if decoded.EventID != original.EventID || decoded.EventType != original.EventType {
		t.Fatalf("decoded envelope mismatch: got %+v want %+v", decoded, original)
	}
}

func eventTimeForTest(t *testing.T) time.Time {
	t.Helper()
	return time.Date(2026, 3, 20, 10, 30, 0, 0, time.UTC)
}
