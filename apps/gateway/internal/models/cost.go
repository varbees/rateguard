package models

import (
	"time"

	"github.com/google/uuid"
)

// APICost represents the cost breakdown for a single API
type APICost struct {
	APIID        uuid.UUID `json:"api_id"`
	APIName      string    `json:"api_name"`
	RequestCount int64     `json:"request_count"`
	CostPerReq   float64   `json:"cost_per_request"`
	TotalCost    float64   `json:"total_cost"`
}

// CostEstimate represents usage cost estimation
type CostEstimate struct {
	// Existing request-based metrics
	TodayCost         float64   `json:"today_cost"`
	MonthlyProjection float64   `json:"monthly_projection"`
	MTDCost           float64   `json:"mtd_cost"`           // Month-to-date cost
	MTDRequests       int64     `json:"mtd_requests"`       // Month-to-date request count
	APICosts          []APICost `json:"api_costs"`
	CalculatedAt      time.Time `json:"calculated_at"`
	
	// NEW: Token-based metrics for LLMs
	MTDTokens         int64              `json:"mtd_tokens"`
	TokensByModel     map[string]int64   `json:"tokens_by_model"`
	CostByModel       map[string]float64 `json:"cost_by_model"`
}
