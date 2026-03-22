package models

import (
	"time"

	"github.com/google/uuid"
)

// RateLimitObservation stores observed rate limit information from API responses
type RateLimitObservation struct {
	ID     uuid.UUID `db:"id" json:"id"`
	UserID uuid.UUID `db:"user_id" json:"user_id"`
	APIID  uuid.UUID `db:"api_id" json:"api_id"`

	// Observed from headers
	LimitPerWindow    *int64     `db:"limit_per_window" json:"limit_per_window,omitempty"`
	WindowSeconds     *int       `db:"window_seconds" json:"window_seconds,omitempty"`
	ResetTimestamp    *time.Time `db:"reset_timestamp" json:"reset_timestamp,omitempty"`
	RetryAfterSeconds *int       `db:"retry_after_seconds" json:"retry_after_seconds,omitempty"`

	// Context
	SourceHeader   string    `db:"source_header" json:"source_header"`     // Which header provided data
	ObservedAt     time.Time `db:"observed_at" json:"observed_at"`         // Observation timestamp
	ResponseStatus int       `db:"response_status" json:"response_status"` // Usually 429

	CreatedAt time.Time `db:"created_at" json:"created_at"`
}

// RateLimitSuggestion represents analyzed rate limit recommendations
type RateLimitSuggestion struct {
	APIID   uuid.UUID `json:"api_id"`
	APIName string    `json:"api_name"`

	// Suggested limits
	SuggestedPerSecond *int64 `json:"suggested_per_second,omitempty"`
	SuggestedPerMinute *int64 `json:"suggested_per_minute,omitempty"`
	SuggestedPerHour   *int64 `json:"suggested_per_hour,omitempty"`
	SuggestedPerDay    *int64 `json:"suggested_per_day,omitempty"`

	// Current configured limits
	CurrentPerSecond int64 `json:"current_per_second"`
	CurrentPerMinute int64 `json:"current_per_minute"`
	CurrentPerHour   int64 `json:"current_per_hour"`
	CurrentPerDay    int64 `json:"current_per_day"`

	// Confidence metrics
	ConfidenceScore  int       `json:"confidence_score"`   // 0-100
	ObservationCount int       `json:"observation_count"`  // Number of observations
	LastObservedAt   time.Time `json:"last_observed_at"`   // Most recent observation

	// Analysis
	RecommendationReason string `json:"recommendation_reason"` // Why this suggestion
}
