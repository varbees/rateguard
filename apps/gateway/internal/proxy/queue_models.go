package proxy

import (
	"errors"
	"time"
)

var (
	// ErrRequestNotFound is returned when a queued request is not found
	ErrRequestNotFound = errors.New("request not found in queue")
	
	// ErrInvalidQueueConfig is returned when queue configuration is invalid
	ErrInvalidQueueConfig = errors.New("invalid queue configuration")
)

// QueuedRequest represents a request currently in queue
type QueuedRequest struct {
	RequestID   string    `json:"request_id"`
	TargetAPI   string    `json:"target_api"`
	Method      string    `json:"method"`
	Path        string    `json:"path"`
	EnqueuedAt  time.Time `json:"enqueued_at"`
	QueuedFor   int64     `json:"queued_for_ms"` // How long it's been queued in ms
	Position    int       `json:"position"`      // Position in queue
	EstWaitTime int64     `json:"est_wait_time_ms"` // Estimated remaining wait time
}

// QueueStats provides statistics about request queues
type QueueStats struct {
	ActiveQueues           int       `json:"active_queues"`           // Number of APIs with active queues
	TotalQueuedRequests    int       `json:"total_queued_requests"`   // Total requests in all queues
	LongestQueuedTime      int64     `json:"longest_queued_time_ms"`  // Longest currently queued request time
	AvgWaitTime            int64     `json:"avg_wait_time_ms"`        // Average wait time for completed requests
	MaxWaitTime            int64     `json:"max_wait_time_ms"`        // Maximum wait time allowed
	PeakQueueLength        int       `json:"peak_queue_length"`       // Peak queue length in last 24h
	TotalRequestsQueued24h int       `json:"total_requests_queued_24h"` // Total requests that entered queue in 24h
	DroppedJobs            int64     `json:"dropped_jobs"`            // Number of jobs dropped due to queue limits
	QueuedByAPI            []APIQueue `json:"queued_by_api"`          // Queue stats per API
	Timestamp              time.Time `json:"timestamp"`              // Time stats were collected
}

// APIQueue represents queue status for a single API
type APIQueue struct {
	APIName         string `json:"api_name"`          // API name
	QueuedRequests  int    `json:"queued_requests"`   // Current requests in queue
	AvgWaitTime     int64  `json:"avg_wait_time_ms"`  // Average wait time
	RateLimitHits24h int   `json:"rate_limit_hits_24h"` // Rate limit hits in past 24h
}

// QueueConfig represents queue configuration settings
type QueueConfig struct {
	Enabled           bool          `json:"enabled"`             // Whether queuing is enabled
	MaxWaitTime       int64         `json:"max_wait_time_ms"`    // Maximum time a request can wait in queue
	QueueingStrategy  string        `json:"queueing_strategy"`   // FIFO, priority, or weighted
	PerAPISettings    []APIQueueConfig `json:"per_api_settings"` // Per-API queue settings
}

// APIQueueConfig represents queue settings for a single API
type APIQueueConfig struct {
	APIName           string `json:"api_name"`            // API name
	Enabled           bool   `json:"enabled"`             // Whether queuing is enabled for this API
	MaxWaitTime       int64  `json:"max_wait_time_ms"`    // Maximum wait time (0 = use global)
	MaxQueueLength    int    `json:"max_queue_length"`    // Maximum queue length
	Priority          int    `json:"priority"`            // Queue priority (1-10, higher = more priority)
}
