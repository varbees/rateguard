package models

import (
	"time"

	"github.com/google/uuid"
)

// LLMMetric represents detailed token usage for a single LLM request
type LLMMetric struct {
	ID                 int64     `json:"id" db:"id"`
	UserID             uuid.UUID `json:"user_id" db:"user_id"`
	TargetAPI          string    `json:"target_api" db:"target_api"`
	ModelUsed          string    `json:"model_used" db:"model_used"`
	InputTokens        int64     `json:"input_tokens" db:"input_tokens"`
	OutputTokens       int64     `json:"output_tokens" db:"output_tokens"`
	TotalTokens        int64     `json:"total_tokens" db:"total_tokens"`
	EstimatedCostCents int       `json:"estimated_cost_cents" db:"estimated_cost_cents"`
	StatusCode         int       `json:"status_code" db:"status_code"`
	DurationMs         int64     `json:"duration_ms" db:"duration_ms"`
	Timestamp          time.Time `json:"timestamp" db:"timestamp"`
}

// TokenUsageSummary represents aggregated token usage for a user
type TokenUsageSummary struct {
	UserID          uuid.UUID                 `json:"user_id"`
	TotalTokens     int64                     `json:"total_tokens"`
	InputTokens     int64                     `json:"input_tokens"`
	OutputTokens    int64                     `json:"output_tokens"`
	TotalCostCents  int                       `json:"total_cost_cents"`  // in cents
	TotalCostUSD    float64                   `json:"total_cost_usd"`    // formatted
	ByModel         map[string]*ModelUsage    `json:"by_model"`
	Period          string                    `json:"period"`            // "today", "month"
	CalculatedAt    time.Time                 `json:"calculated_at"`
}

// ModelUsage represents token usage for a specific model
type ModelUsage struct {
	Model      string  `json:"model"`
	Tokens     int64   `json:"tokens"`
	Requests   int64   `json:"requests"`
	CostCents  int     `json:"cost_cents"`
	CostUSD    float64 `json:"cost_usd"`
}

// ModelPricing represents pricing for a specific LLM model
type ModelPricing struct {
	ID                     uuid.UUID  `json:"id" db:"id"`
	Provider               string     `json:"provider" db:"provider"`
	Model                  string     `json:"model" db:"model"`
	InputPricePerMillion   int        `json:"input_price_per_million" db:"input_price_per_million"`   // cents per 1M tokens
	OutputPricePerMillion  int        `json:"output_price_per_million" db:"output_price_per_million"` // cents per 1M tokens
	EffectiveDate          time.Time  `json:"effective_date" db:"effective_date"`
	DeprecatedDate         *time.Time `json:"deprecated_date,omitempty" db:"deprecated_date"`
	CreatedAt              time.Time  `json:"created_at" db:"created_at"`
}
