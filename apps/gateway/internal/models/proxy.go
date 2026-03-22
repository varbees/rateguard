package models

import (
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"
)

var (
	ErrRateLimitExceeded = errors.New("rate limit exceeded")
	ErrAPINotFound       = errors.New("API configuration not found")
	ErrAPIDisabled       = errors.New("API is disabled")
	ErrInvalidRequest    = errors.New("invalid proxy request")
)

// ProxyRequest represents an incoming request to proxy
type ProxyRequest struct {
	ID          string            `json:"id"`
	UserID      uuid.UUID         `json:"user_id"`
	APIConfigID uuid.UUID         `json:"api_config_id"`
	TargetAPI   string            `json:"target_api"`
	TargetURL   string            `json:"target_url"`
	Method      string            `json:"method"`
	Path        string            `json:"path,omitempty"` // Path to append to base URL
	Headers     map[string]string `json:"headers"`
	Body        []byte            `json:"body,omitempty"`
	QueryParams map[string]string `json:"query_params,omitempty"`
	Timestamp   time.Time         `json:"timestamp"`
}

// ProxyResponse represents the response from a proxied request
type ProxyResponse struct {
	RequestID     string         `json:"request_id"`
	StatusCode    int            `json:"status_code"`
	Headers       http.Header    `json:"headers"`
	Body          []byte         `json:"body,omitempty"`
	Duration      time.Duration  `json:"duration"`
	Queued        bool           `json:"queued,omitempty"`         // Was request queued due to rate limit
	QueueDuration time.Duration  `json:"queue_duration,omitempty"` // Time spent in queue
	Cached        bool           `json:"cached"`
	RateLimit     *RateLimitInfo `json:"rate_limit,omitempty"`
	Error         *ProxyError    `json:"error,omitempty"`
	Timestamp     time.Time      `json:"timestamp"`

	// Streaming support fields
	IsStreaming   bool          `json:"is_streaming,omitempty"`   // Whether response is streaming
	StreamingType string        `json:"streaming_type,omitempty"` // Type: "sse", "chunked", "ndjson"
	RawBody       io.ReadCloser `json:"-"`                        // Raw response body for streaming (not serialized)

	// Internal-only LLM metadata for streamed completions.
	LLMProvider string `json:"-"`
	LLMModel    string `json:"-"`

	// QueueRelease notifies the next queued request after this request completes.
	// It is intentionally omitted from JSON serialization.
	QueueRelease func() `json:"-"`
}

// RateLimitInfo provides rate limit status in response
type RateLimitInfo struct {
	Limit     int   `json:"limit"`
	Remaining int   `json:"remaining"`
	Reset     int64 `json:"reset"` // Unix timestamp
}

// ProxyError represents an error during proxy operation
type ProxyError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details string `json:"details,omitempty"`
}

// ProxyRequestPayload represents the HTTP request payload for proxy endpoint
type ProxyRequestPayload struct {
	APIName     string            `json:"api_name" validate:"required"`
	Method      string            `json:"method" validate:"required,oneof=GET POST PUT PATCH DELETE"`
	Path        string            `json:"path" validate:"required"`
	Headers     map[string]string `json:"headers,omitempty"`
	Body        interface{}       `json:"body,omitempty"`
	QueryParams map[string]string `json:"query_params,omitempty"`
}

// ProxyStats tracks proxy performance metrics
type ProxyStats struct {
	TotalProxied        int64         `json:"total_proxied"`
	SuccessfulRequests  int64         `json:"successful_requests"`
	FailedRequests      int64         `json:"failed_requests"`
	RateLimitedRequests int64         `json:"rate_limited_requests"`
	AvgDuration         time.Duration `json:"avg_duration"`
	TotalDuration       time.Duration `json:"total_duration"`
	Timestamp           time.Time     `json:"timestamp"`
}
