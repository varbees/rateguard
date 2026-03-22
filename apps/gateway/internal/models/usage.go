package models

import (
	"time"

	"github.com/google/uuid"
)

// APIUsage tracks request counts for billing
type APIUsage struct {
	ID        int64     `json:"id" db:"id"`
	UserID    uuid.UUID `json:"user_id" db:"user_id"`
	TargetAPI string    `json:"target_api" db:"target_api"`
	Requests  int64     `json:"requests" db:"requests"`
	Timestamp time.Time `json:"timestamp" db:"timestamp"`
}

// APIMetrics tracks detailed performance metrics
type APIMetrics struct {
	ID         int64         `json:"id" db:"id"`
	UserID     uuid.UUID     `json:"user_id" db:"user_id"`
	TargetAPI  string        `json:"target_api" db:"target_api"`
	StatusCode int           `json:"status_code" db:"status_code"`
	DurationMs int64         `json:"duration_ms" db:"duration_ms"`
	Timestamp  time.Time     `json:"timestamp" db:"timestamp"`
}

// UsageStats represents aggregated usage statistics
type UsageStats struct {
	UserID         uuid.UUID `json:"user_id"`
	TotalRequests  int64     `json:"total_requests"`
	APIsUsed       int       `json:"apis_used"`
	AvgDurationMs  float64   `json:"avg_duration_ms"`
	SuccessRate    float64   `json:"success_rate"`
	ErrorRate      float64   `json:"error_rate"`
	Period         string    `json:"period"` // daily, weekly, monthly
	PeriodStart    time.Time `json:"period_start"`
	PeriodEnd      time.Time `json:"period_end"`
}

// UsageByAPI represents usage statistics per API
type UsageByAPI struct {
	APIName       string    `json:"api_name"`
	Requests      int64     `json:"requests"`
	AvgDurationMs float64   `json:"avg_duration_ms"`
	SuccessRate   float64   `json:"success_rate"`
	ErrorRate     float64   `json:"error_rate"`
	LastUsed      time.Time `json:"last_used"`
}

// DashboardStats represents overview statistics for dashboard
type DashboardStats struct {
	TotalRequests     int64        `json:"total_requests"`
	RequestsToday     int64        `json:"requests_today"`
	ActiveAPIs        int          `json:"active_apis"`
	AvgResponseTimeMs float64      `json:"avg_response_time_ms"`
	SuccessRate       float64      `json:"success_rate"`
	MonthlyUsage      int64        `json:"monthly_usage"`
	PlanLimit         int          `json:"plan_limit"`
	UsageByAPI        []UsageByAPI `json:"usage_by_api"`
	UsagePercentages  struct {
		Daily   float64 `json:"daily_pct"`   // current/limit * 100
		Monthly float64 `json:"monthly_pct"` // current/limit * 100
	} `json:"usage_percentages"`
	Timestamp time.Time `json:"timestamp"`
}

// UsageQueryParams represents query parameters for usage data
type UsageQueryParams struct {
	StartDate   time.Time `json:"start_date"`
	EndDate     time.Time `json:"end_date"`
	APIName     string    `json:"api_name,omitempty"`
	Granularity string    `json:"granularity"` // hour, day, week, month
}

// UsageHistoryPoint represents a single point in time-series usage data
type UsageHistoryPoint struct {
	Timestamp        time.Time `json:"timestamp" db:"timestamp"`
	Requests         int64     `json:"requests" db:"requests"`
	SuccessRate      float64   `json:"success_rate" db:"success_rate"`
	AvgResponseTimeMs float64   `json:"avg_response_time_ms" db:"avg_response_time_ms"`
}

// UsageHistoryResponse represents the response for usage history endpoint
type UsageHistoryResponse struct {
	Period string              `json:"period"`
	Data   []UsageHistoryPoint `json:"data"`
}

// RequestLog represents a single API request with full details
type RequestLog struct {
	ID             uuid.UUID `json:"id" db:"id"`
	UserID         uuid.UUID `json:"user_id" db:"user_id"`
	APIID          uuid.UUID `json:"api_id" db:"api_id"`
	APIName        string    `json:"api_name" db:"api_name"`
	Method         string    `json:"method" db:"method"`
	Path           string    `json:"path" db:"path"`
	StatusCode     int       `json:"status_code" db:"status_code"`
	ResponseTimeMs int64     `json:"response_time_ms" db:"response_time_ms"`
	Timestamp      time.Time `json:"timestamp" db:"timestamp"`
	ErrorMessage   *string   `json:"error_message,omitempty" db:"error_message"`
}

// RecentRequestsResponse represents the response for recent requests endpoint
type RecentRequestsResponse struct {
	Requests []RequestLog `json:"requests"`
	Total    int          `json:"total"`
}

// StreamingStats holds aggregated metrics for real-time updates
type StreamingStats struct {
	TotalRequests int64   `json:"total_requests"`
	TotalBytes    int64   `json:"total_bytes"`
	AvgLatency    float64 `json:"avg_latency"`
	ErrorCount    int64   `json:"error_count"`
}
