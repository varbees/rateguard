package models

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	// ErrWebhookNotFound is returned when a webhook event is not found
	ErrWebhookNotFound = errors.New("webhook event not found")
	
	// ErrWebhookDeliveryFailed is returned when webhook delivery fails
	ErrWebhookDeliveryFailed = errors.New("webhook delivery failed")
	
	// ErrMaxRetriesExceeded is returned when max retries are exceeded
	ErrMaxRetriesExceeded = errors.New("max retries exceeded")
)

// WebhookEventStatus represents the status of a webhook event
type WebhookEventStatus string

const (
	WebhookStatusPending    WebhookEventStatus = "pending"     // Waiting for first delivery attempt
	WebhookStatusProcessing WebhookEventStatus = "processing"  // Currently being processed
	WebhookStatusDelivered  WebhookEventStatus = "delivered"   // Successfully delivered
	WebhookStatusFailed     WebhookEventStatus = "failed"      // Failed, will retry
	WebhookStatusDeadLetter WebhookEventStatus = "dead_letter" // Max retries exceeded, moved to dead letter
)

// WebhookEvent represents a webhook event to be delivered
type WebhookEvent struct {
	ID                 uuid.UUID          `json:"id" db:"id"`
	UserID             uuid.UUID          `json:"user_id" db:"user_id"`
	Source             string             `json:"source" db:"source"`
	EventType          string             `json:"event_type" db:"event_type"`
	Payload            map[string]any     `json:"payload" db:"payload"`
	Headers            map[string]string  `json:"headers,omitempty" db:"headers"`
	TargetURL          string             `json:"target_url" db:"target_url"`
	Status             WebhookEventStatus `json:"status" db:"status"`
	Retries            int                `json:"retries" db:"retries"`
	MaxRetries         int                `json:"max_retries" db:"max_retries"`
	NextAttemptAt      *time.Time         `json:"next_attempt_at,omitempty" db:"next_attempt_at"`
	LastError          *string            `json:"last_error,omitempty" db:"last_error"`
	LastAttemptAt      *time.Time         `json:"last_attempt_at,omitempty" db:"last_attempt_at"`
	DeliveredAt        *time.Time         `json:"delivered_at,omitempty" db:"delivered_at"`
	ResponseStatusCode *int               `json:"response_status_code,omitempty" db:"response_status_code"`
	ResponseBody       *string            `json:"response_body,omitempty" db:"response_body"`
	CreatedAt          time.Time          `json:"created_at" db:"created_at"`
	UpdatedAt          time.Time          `json:"updated_at" db:"updated_at"`
}

// WebhookInboxRequest represents incoming webhook POST request
type WebhookInboxRequest struct {
	Source    string            `json:"source" validate:"required"`          // e.g., "stripe", "github"
	EventType string            `json:"event_type" validate:"required"`      // e.g., "payment.succeeded"
	Payload   map[string]any    `json:"payload" validate:"required"`         // Webhook JSON payload
	Headers   map[string]string `json:"headers,omitempty"`                   // Original headers for verification
	TargetURL string            `json:"target_url" validate:"required,url"`  // Where to forward
}

// WebhookInboxResponse represents webhook acceptance response
type WebhookInboxResponse struct {
	ID         uuid.UUID `json:"id"`
	Status     string    `json:"status"`
	Message    string    `json:"message"`
	ReceivedAt time.Time `json:"received_at"`
}

// WebhookStatusResponse represents webhook status query response
type WebhookStatusResponse struct {
	Events     []WebhookEvent  `json:"events"`
	TotalCount int             `json:"total_count"`
	Page       int             `json:"page"`
	PageSize   int             `json:"page_size"`
	Timestamp  time.Time       `json:"timestamp"`
}

// WebhookDeliveryAttempt represents a single delivery attempt
type WebhookDeliveryAttempt struct {
	EventID        uuid.UUID  `json:"event_id"`
	AttemptNumber  int        `json:"attempt_number"`
	AttemptedAt    time.Time  `json:"attempted_at"`
	Success        bool       `json:"success"`
	StatusCode     *int       `json:"status_code,omitempty"`
	Error          *string    `json:"error,omitempty"`
	ResponseBody   *string    `json:"response_body,omitempty"`
	DurationMs     int64      `json:"duration_ms"`
	NextRetryAt    *time.Time `json:"next_retry_at,omitempty"`
}

// CalculateNextRetry calculates next retry time with exponential backoff
func CalculateNextRetry(retries int, baseDelay time.Duration, maxDelay time.Duration) time.Time {
	// Exponential backoff: baseDelay * 2^retries
	// Example with baseDelay=5s: 5s, 10s, 20s, 40s, 80s
	delay := baseDelay
	for i := 0; i < retries; i++ {
		delay *= 2
		if delay > maxDelay {
			delay = maxDelay
			break
		}
	}
	return time.Now().Add(delay)
}

// IsDeliverable returns true if the webhook can be attempted for delivery
func (w *WebhookEvent) IsDeliverable() bool {
	if w.Status != WebhookStatusPending && w.Status != WebhookStatusFailed {
		return false
	}
	
	if w.Retries >= w.MaxRetries {
		return false
	}
	
	// Check if it's time to retry
	if w.NextAttemptAt != nil && time.Now().Before(*w.NextAttemptAt) {
		return false
	}
	
	return true
}

// ShouldRetry determines if a status code warrants a retry
func ShouldRetry(statusCode int) bool {
	// Retry on 5xx errors (server errors)
	if statusCode >= 500 && statusCode < 600 {
		return true
	}
	
	// Retry on 429 (rate limit)
	if statusCode == 429 {
		return true
	}
	
	// Retry on 408 (request timeout)
	if statusCode == 408 {
		return true
	}
	
	// Don't retry on 4xx errors (except above) - these are client errors
	return false
}
