package rateguard

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

const (
	EventTypeRequestCompleted    = "request.completed"
	EventTypeRequestRateLimited  = "request.rate_limited"
	EventTypeTokenBudgetExceeded = "request.token_budget_exceeded"
)

// RequestEventPayload is the structured payload emitted for request events.
type RequestEventPayload struct {
	RequestID            string `json:"request_id,omitempty"`
	Method               string `json:"method"`
	Path                 string `json:"path"`
	StatusCode           int    `json:"status_code"`
	LatencyMS            int64  `json:"latency_ms"`
	RateLimitApplied     bool   `json:"rate_limit_applied"`
	RateLimitAllowed     bool   `json:"rate_limit_allowed"`
	RateLimitLimit       int    `json:"rate_limit_limit"`
	RateLimitRemaining   int    `json:"rate_limit_remaining"`
	RetryAfterMS         int64  `json:"retry_after_ms,omitempty"`
	Preset               string `json:"preset"`
	CircuitBreakerState  string `json:"circuit_breaker_state"`
	QueueDepth           int    `json:"queue_depth"`
	TokenProvider        string `json:"token_provider,omitempty"`
	TokenModel           string `json:"token_model,omitempty"`
	TokenInputTokens     int64  `json:"token_input_tokens,omitempty"`
	TokenOutputTokens    int64  `json:"token_output_tokens,omitempty"`
	TokenTotalTokens     int64  `json:"token_total_tokens,omitempty"`
	TokenBudgetMode      string `json:"token_budget_mode,omitempty"`
	TokenBudgetApplied   bool   `json:"token_budget_applied"`
	TokenBudgetQueued    bool   `json:"token_budget_queued"`
	TokenBudgetWaitMS    int64  `json:"token_budget_wait_ms,omitempty"`
	TokenBudgetLimit     int64  `json:"token_budget_limit,omitempty"`
	TokenBudgetRemaining int64  `json:"token_budget_remaining,omitempty"`
}

// EventEnvelope is the standard event wrapper used by the SDK.
type EventEnvelope struct {
	EventID    string              `json:"event_id"`
	EventType  string              `json:"event_type"`
	TenantID   string              `json:"tenant_id,omitempty"`
	RouteID    string              `json:"route_id,omitempty"`
	UpstreamID string              `json:"upstream_id,omitempty"`
	TraceID    string              `json:"trace_id,omitempty"`
	OccurredAt time.Time           `json:"occurred_at"`
	Payload    RequestEventPayload `json:"payload"`
}

// EventEmitter sends SDK events to the control plane.
type EventEmitter interface {
	Emit(ctx context.Context, event EventEnvelope) error
}

// NoopEmitter discards all events.
type NoopEmitter struct{}

func (NoopEmitter) Emit(context.Context, EventEnvelope) error {
	return nil
}

// HTTPEventEmitter posts events as JSON to the control plane.
type HTTPEventEmitter struct {
	endpoint string
	client   *http.Client
}

// NewHTTPEventEmitter creates a new HTTP event emitter.
func NewHTTPEventEmitter(endpoint string, client *http.Client) *HTTPEventEmitter {
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}
	return &HTTPEventEmitter{
		endpoint: endpoint,
		client:   client,
	}
}

func (e *HTTPEventEmitter) Emit(ctx context.Context, event EventEnvelope) error {
	if e == nil || e.endpoint == "" {
		return nil
	}

	body, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, e.endpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build event request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "RateGuard-Go-SDK/"+Version)

	resp, err := e.client.Do(req)
	if err != nil {
		return fmt.Errorf("send event: %w", err)
	}
	defer resp.Body.Close()

	if _, err := io.Copy(io.Discard, resp.Body); err != nil {
		return fmt.Errorf("drain event response body: %w", err)
	}
	if resp.StatusCode >= 300 {
		return fmt.Errorf("event delivery failed: %s", resp.Status)
	}
	return nil
}

func newEventID() string {
	return newRandomHexID(16)
}

func newTraceID() string {
	return newRandomHexID(16)
}

func newRandomHexID(size int) string {
	if size <= 0 {
		size = 16
	}

	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		log.Printf("rateguard: generate random id: %v", err)
		return fmt.Sprintf("%x", time.Now().UTC().UnixNano())
	}

	return hex.EncodeToString(buf)
}

func requestIDFromHeader(h http.Header) string {
	if v := strings.TrimSpace(h.Get("X-Request-Id")); v != "" {
		return v
	}
	if v := strings.TrimSpace(h.Get("X-Request-ID")); v != "" {
		return v
	}
	return ""
}

func traceIDFromHeader(h http.Header) string {
	if v := strings.TrimSpace(h.Get("traceparent")); v != "" {
		parts := strings.Split(v, "-")
		if len(parts) >= 3 && len(parts[1]) == 32 {
			return parts[1]
		}
	}
	if v := strings.TrimSpace(h.Get("X-Trace-Id")); v != "" {
		return v
	}
	if v := strings.TrimSpace(h.Get("X-Trace-ID")); v != "" {
		return v
	}
	if v := strings.TrimSpace(h.Get("X-Request-Id")); v != "" {
		return v
	}
	return newTraceID()
}
