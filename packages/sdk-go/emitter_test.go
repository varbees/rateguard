package rateguard

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type captureRoundTripper struct {
	request *http.Request
	body    []byte
	status  int
}

func (c *captureRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	c.request = req.Clone(req.Context())

	body, err := io.ReadAll(req.Body)
	if err != nil {
		return nil, err
	}
	c.body = append([]byte(nil), body...)

	if c.status == 0 {
		c.status = http.StatusAccepted
	}

	return &http.Response{
		StatusCode: c.status,
		Header:     make(http.Header),
		Body:       io.NopCloser(bytes.NewBufferString("ok")),
		Request:    req,
	}, nil
}

func TestHTTPEventEmitterSerializesEnvelope(t *testing.T) {
	t.Parallel()

	rt := &captureRoundTripper{}
	client := &http.Client{Transport: rt}
	emitter := NewHTTPEventEmitter("https://controlplane.example/api/v1/events", client)

	event := EventEnvelope{
		EventID:    "evt-123",
		EventType:  EventTypeRequestCompleted,
		TenantID:   "tenant-a",
		RouteID:    "route-a",
		UpstreamID: "upstream-a",
		TraceID:    "0123456789abcdef0123456789abcdef",
		OccurredAt: time.Date(2026, 3, 20, 10, 30, 0, 0, time.UTC),
		Payload: RequestEventPayload{
			Method:              http.MethodPost,
			Path:                "/v1/chat/completions",
			StatusCode:          http.StatusOK,
			LatencyMS:           42,
			RateLimitApplied:    true,
			RateLimitAllowed:    true,
			RateLimitLimit:      100,
			RateLimitRemaining:  99,
			Preset:              "llm-heavy",
			CircuitBreakerState: "closed",
			QueueDepth:          0,
		},
	}

	if err := emitter.Emit(context.Background(), event); err != nil {
		t.Fatalf("Emit() error = %v", err)
	}

	if rt.request == nil {
		t.Fatal("expected request to be captured")
	}
	if got := rt.request.Method; got != http.MethodPost {
		t.Fatalf("request method = %q, want %q", got, http.MethodPost)
	}
	if got := rt.request.Header.Get("Content-Type"); got != "application/json" {
		t.Fatalf("content-type = %q, want application/json", got)
	}
	if got := rt.request.URL.String(); got != "https://controlplane.example/api/v1/events" {
		t.Fatalf("request URL = %q, want %q", got, "https://controlplane.example/api/v1/events")
	}

	var decoded EventEnvelope
	if err := json.Unmarshal(rt.body, &decoded); err != nil {
		t.Fatalf("json.Unmarshal(body) error = %v", err)
	}

	if decoded.EventID != event.EventID {
		t.Fatalf("decoded EventID = %q, want %q", decoded.EventID, event.EventID)
	}
	if decoded.EventType != event.EventType {
		t.Fatalf("decoded EventType = %q, want %q", decoded.EventType, event.EventType)
	}
	if decoded.TenantID != event.TenantID || decoded.RouteID != event.RouteID || decoded.UpstreamID != event.UpstreamID {
		t.Fatalf("decoded envelope routing fields mismatch: got %+v want %+v", decoded, event)
	}
	if decoded.TraceID != event.TraceID {
		t.Fatalf("decoded TraceID = %q, want %q", decoded.TraceID, event.TraceID)
	}
	if !decoded.OccurredAt.Equal(event.OccurredAt) {
		t.Fatalf("decoded OccurredAt = %s, want %s", decoded.OccurredAt, event.OccurredAt)
	}

	if decoded.Payload.Method != http.MethodPost {
		t.Fatalf("payload.method = %q, want %q", decoded.Payload.Method, http.MethodPost)
	}
	if decoded.Payload.StatusCode != http.StatusOK {
		t.Fatalf("payload.status_code = %d, want %d", decoded.Payload.StatusCode, http.StatusOK)
	}
	if !decoded.Payload.RateLimitApplied {
		t.Fatalf("payload.rate_limit_applied = false, want true")
	}
	if decoded.Payload.Preset != "llm-heavy" {
		t.Fatalf("payload.preset = %q, want %q", decoded.Payload.Preset, "llm-heavy")
	}
	if !strings.Contains(string(rt.body), `"event_id":"evt-123"`) {
		t.Fatalf("serialized body does not contain event_id: %s", string(rt.body))
	}
}
