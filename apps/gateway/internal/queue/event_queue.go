package queue

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// EventType represents different types of events in the system
type EventType string

const (
	EventTypeRequest  EventType = "request"
	EventTypeResponse EventType = "response"
	EventTypeLLM      EventType = "llm_response"
)

// Event represents a generic analytics event
type Event struct {
	ID        string    `json:"id"`
	Type      EventType `json:"type"`
	UserID    uuid.UUID `json:"user_id"`
	Timestamp time.Time `json:"timestamp"`
	Data      EventData `json:"data"`
}

// EventData holds the actual event payload
type EventData struct {
	// Common fields
	TargetAPI string `json:"target_api"`
	
	// Request/Response fields
	StatusCode int   `json:"status_code,omitempty"`
	DurationMs int64 `json:"duration_ms,omitempty"`
	
	// LLM-specific fields
	Model        string `json:"model,omitempty"`
	InputTokens  int64  `json:"input_tokens,omitempty"`
	OutputTokens int64  `json:"output_tokens,omitempty"`
	TotalTokens  int64  `json:"total_tokens,omitempty"`
	CostCents    int    `json:"cost_cents,omitempty"`
}

// EventQueue defines the interface for publishing and consuming events
type EventQueue interface {
	// Publish sends an event to the queue
	// Returns immediately after persisting to queue (non-blocking)
	Publish(ctx context.Context, event *Event) error
	
	// StartConsumer starts consuming events from the queue
	// Processes events in batches and writes to database
	StartConsumer(ctx context.Context, groupName string, consumerID string) error
	
	// GetStats returns queue statistics
	GetStats(ctx context.Context) (*QueueStats, error)
	
	// Close gracefully shuts down the queue
	Close() error
}

// QueueStats holds queue metrics
type QueueStats struct {
	PendingMessages int64     `json:"pending_messages"`
	ConsumerLag     int64     `json:"consumer_lag"`
	LastProcessedAt time.Time `json:"last_processed_at"`
	ProcessedTotal  int64     `json:"processed_total"`
	ErrorsTotal     int64     `json:"errors_total"`
}

// EventHandler processes a batch of events
type EventHandler func(ctx context.Context, events []*Event) error
