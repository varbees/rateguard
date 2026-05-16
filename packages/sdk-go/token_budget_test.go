package rateguard

import (
	"bytes"
	"context"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

type fakeBudgetClock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *fakeBudgetClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *fakeBudgetClock) Advance(d time.Duration) {
	c.mu.Lock()
	c.now = c.now.Add(d)
	c.mu.Unlock()
}

type advancingBudgetWaiter struct {
	clock *fakeBudgetClock
}

func (w *advancingBudgetWaiter) Wait(_ context.Context, d time.Duration) error {
	if d > 0 {
		w.clock.Advance(d)
	}
	return nil
}

func TestDefaultTokenUsageExtractorParsesResponseHeaders(t *testing.T) {
	t.Parallel()

	extractor := DefaultTokenUsageExtractor{}
	snapshot := ResponseSnapshot{
		Header: http.Header{
			"X-RateGuard-Input-Tokens":  []string{"13"},
			"X-RateGuard-Output-Tokens": []string{"21"},
			"X-RateGuard-Total-Tokens":  []string{"34"},
			"X-RateGuard-Model":         []string{"gpt-4.1"},
		},
	}

	usage, ok := extractor.Extract(snapshot)
	if !ok {
		t.Fatal("expected token usage to be extracted")
	}
	if usage.InputTokens != 13 || usage.OutputTokens != 21 || usage.TotalTokens != 34 {
		t.Fatalf("usage = %+v, want input/output/total = 13/21/34", usage)
	}
	if usage.Model != "gpt-4.1" {
		t.Fatalf("usage.model = %q, want %q", usage.Model, "gpt-4.1")
	}
}

func TestDefaultTokenUsageExtractorLogsMalformedJSONBody(t *testing.T) {
	var logs bytes.Buffer
	previous := log.Writer()
	log.SetOutput(&logs)
	defer log.SetOutput(previous)

	extractor := DefaultTokenUsageExtractor{}
	_, ok := extractor.Extract(ResponseSnapshot{
		Body: []byte(`{"usage":{"total_tokens":7}`),
	})

	if ok {
		t.Fatal("expected malformed token usage JSON to be ignored")
	}
	if got := logs.String(); !strings.Contains(got, "parse token usage response body") {
		t.Fatalf("log output = %q, want parse token usage response body", got)
	}
}

func TestDefaultTokenUsageExtractorParsesResponseBody(t *testing.T) {
	t.Parallel()

	extractor := DefaultTokenUsageExtractor{}
	snapshot := ResponseSnapshot{
		Body: []byte(`{"model":"gpt-4.1","usage":{"prompt_tokens":5,"completion_tokens":12,"total_tokens":17}}`),
	}

	usage, ok := extractor.Extract(snapshot)
	if !ok {
		t.Fatal("expected token usage to be extracted")
	}
	if usage.InputTokens != 5 || usage.OutputTokens != 12 || usage.TotalTokens != 17 {
		t.Fatalf("usage = %+v, want input/output/total = 5/12/17", usage)
	}
	if usage.Model != "gpt-4.1" {
		t.Fatalf("usage.model = %q, want %q", usage.Model, "gpt-4.1")
	}
}

func TestHTTPMiddlewareRecordsTokenUsageAndEmitsEvent(t *testing.T) {
	t.Parallel()

	clock := &fakeBudgetClock{now: time.Date(2026, 3, 20, 10, 0, 0, 0, time.UTC)}
	emitter := &recordingEmitter{}
	sdk := New(Config{
		Preset:              PresetLLMHeavy,
		TenantID:            "tenant-a",
		RouteID:             "route-a",
		UpstreamID:          "upstream-a",
		Model:               "gpt-4.1",
		TokenBudgetMode:     TokenBudgetModeHardStop,
		TokenBudgetPerMonth: 100,
		EventEmitter:        emitter,
		Clock:               clock,
	})

	req := httptest.NewRequest(http.MethodPost, "http://example.com/v1/chat/completions", nil)
	rr := httptest.NewRecorder()

	sdk.HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"model":"gpt-4.1","usage":{"prompt_tokens":5,"completion_tokens":12,"total_tokens":17}}`))
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status code = %d, want %d", rr.Code, http.StatusOK)
	}

	events := emitter.Events()
	if len(events) != 1 {
		t.Fatalf("recorded events = %d, want 1", len(events))
	}

	payload := events[0].Payload
	if payload.TokenInputTokens != 5 || payload.TokenOutputTokens != 12 || payload.TokenTotalTokens != 17 {
		t.Fatalf("token payload = %+v, want 5/12/17", payload)
	}
	if payload.TokenBudgetLimit != 100 {
		t.Fatalf("token budget limit = %d, want 100", payload.TokenBudgetLimit)
	}
	if payload.TokenBudgetRemaining != 83 {
		t.Fatalf("token budget remaining = %d, want 83", payload.TokenBudgetRemaining)
	}
	if payload.TokenModel != "gpt-4.1" {
		t.Fatalf("token model = %q, want %q", payload.TokenModel, "gpt-4.1")
	}
}

func TestHTTPMiddlewareHardStopRejectsWhenTokenBudgetExhausted(t *testing.T) {
	t.Parallel()

	clock := &fakeBudgetClock{now: time.Date(2026, 3, 20, 10, 0, 0, 0, time.UTC)}
	emitter := &recordingEmitter{}
	calls := 0
	sdk := New(Config{
		Preset:              PresetLLMHeavy,
		TenantID:            "tenant-a",
		RouteID:             "route-a",
		UpstreamID:          "upstream-a",
		Model:               "gpt-4.1",
		TokenBudgetMode:     TokenBudgetModeHardStop,
		TokenBudgetPerMonth: 10,
		EventEmitter:        emitter,
		Clock:               clock,
	})

	handler := sdk.HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		_, _ = w.Write([]byte(`{"model":"gpt-4.1","usage":{"prompt_tokens":4,"completion_tokens":6,"total_tokens":10}}`))
	}))

	firstRes := httptest.NewRecorder()
	handler.ServeHTTP(firstRes, httptest.NewRequest(http.MethodPost, "http://example.com/v1/chat/completions", nil))
	if firstRes.Code != http.StatusOK {
		t.Fatalf("first status = %d, want %d", firstRes.Code, http.StatusOK)
	}

	secondRes := httptest.NewRecorder()
	handler.ServeHTTP(secondRes, httptest.NewRequest(http.MethodPost, "http://example.com/v1/chat/completions", nil))

	if secondRes.Code != http.StatusTooManyRequests {
		t.Fatalf("second status = %d, want %d", secondRes.Code, http.StatusTooManyRequests)
	}
	if calls != 1 {
		t.Fatalf("handler calls = %d, want 1", calls)
	}

	events := emitter.Events()
	if len(events) != 2 {
		t.Fatalf("recorded events = %d, want 2", len(events))
	}
	if events[1].EventType != EventTypeTokenBudgetExceeded {
		t.Fatalf("event type = %q, want %q", events[1].EventType, EventTypeTokenBudgetExceeded)
	}
	if events[1].Payload.TokenBudgetRemaining != 0 {
		t.Fatalf("token budget remaining = %d, want 0", events[1].Payload.TokenBudgetRemaining)
	}
}

func TestHTTPMiddlewareSoftStopQueuesUntilTokenBudgetResets(t *testing.T) {
	t.Parallel()

	clock := &fakeBudgetClock{now: time.Date(2026, 3, 20, 10, 0, 0, 0, time.UTC)}
	waiter := &advancingBudgetWaiter{clock: clock}
	emitter := &recordingEmitter{}
	calls := 0
	sdk := New(Config{
		Preset:              PresetLLMHeavy,
		TenantID:            "tenant-a",
		RouteID:             "route-a",
		UpstreamID:          "upstream-a",
		Model:               "gpt-4.1",
		TokenBudgetMode:     TokenBudgetModeSoftStop,
		TokenBudgetPerMonth: 10,
		EventEmitter:        emitter,
		Clock:               clock,
		BudgetWaiter:        waiter,
	})

	handler := sdk.HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		_, _ = w.Write([]byte(`{"model":"gpt-4.1","usage":{"prompt_tokens":4,"completion_tokens":6,"total_tokens":10}}`))
	}))

	firstRes := httptest.NewRecorder()
	handler.ServeHTTP(firstRes, httptest.NewRequest(http.MethodPost, "http://example.com/v1/chat/completions", nil))
	if firstRes.Code != http.StatusOK {
		t.Fatalf("first status = %d, want %d", firstRes.Code, http.StatusOK)
	}

	secondRes := httptest.NewRecorder()
	handler.ServeHTTP(secondRes, httptest.NewRequest(http.MethodPost, "http://example.com/v1/chat/completions", nil))

	if secondRes.Code != http.StatusOK {
		t.Fatalf("second status = %d, want %d", secondRes.Code, http.StatusOK)
	}
	if calls != 2 {
		t.Fatalf("handler calls = %d, want 2", calls)
	}
	if clock.Now().Before(time.Date(2026, 4, 19, 10, 0, 0, 0, time.UTC)) {
		t.Fatalf("clock did not advance enough for monthly queueing: %s", clock.Now())
	}

	events := emitter.Events()
	if len(events) != 2 {
		t.Fatalf("recorded events = %d, want 2", len(events))
	}
	if !events[1].Payload.TokenBudgetQueued {
		t.Fatalf("expected second event to be marked queued, got %+v", events[1].Payload)
	}
}
