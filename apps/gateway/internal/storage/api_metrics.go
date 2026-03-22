package storage

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
)

// APIMetricsData holds real-time metrics for a specific API
type APIMetricsData struct {
	RequestsToday  int64
	RequestsHour   int64
	SuccessRate    float64
	AvgLatencyMs   float64
	P95LatencyMs   float64
	ErrorCount     int64
	LastRequestAt  *time.Time
}

// GetAPIMetrics retrieves comprehensive metrics for a specific API
func (t *UsageTracker) GetAPIMetrics(ctx context.Context, userID, apiID uuid.UUID) (*APIMetricsData, error) {
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	hourStart := now.Add(-1 * time.Hour)

	metrics := &APIMetricsData{}

	// Get requests today
	err := t.db.QueryRowContext(ctx, `
		SELECT COALESCE(COUNT(*), 0)
		FROM request_logs
		WHERE user_id = $1 
		AND api_id = $2 
		AND timestamp >= $3
	`, userID, apiID, todayStart).Scan(&metrics.RequestsToday)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	// Get requests in last hour
	err = t.db.QueryRowContext(ctx, `
		SELECT COALESCE(COUNT(*), 0)
		FROM request_logs
		WHERE user_id = $1 
		AND api_id = $2 
		AND timestamp >= $3
	`, userID, apiID, hourStart).Scan(&metrics.RequestsHour)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	// Get success rate, avg latency, and error count (last 24 hours)
	var totalRequests int64
	var successfulRequests int64
	
	err = t.db.QueryRowContext(ctx, `
		SELECT 
			COALESCE(COUNT(*), 0) as total,
			COALESCE(SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END), 0) as successful,
			COALESCE(SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END), 0) as errors,
			COALESCE(AVG(CASE WHEN latency_ms > 0 THEN latency_ms ELSE NULL END), 0) as avg_latency
		FROM request_logs
		WHERE user_id = $1 
		AND api_id = $2 
		AND timestamp >= $3
	`, userID, apiID, todayStart).Scan(&totalRequests, &successfulRequests, &metrics.ErrorCount, &metrics.AvgLatencyMs)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	// Calculate success rate
	if totalRequests > 0 {
		metrics.SuccessRate = (float64(successfulRequests) / float64(totalRequests)) * 100.0
	} else {
		metrics.SuccessRate = 0.0
	}

	// Get P95 latency (95th percentile)
	err = t.db.QueryRowContext(ctx, `
		SELECT COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)
		FROM request_logs
		WHERE user_id = $1 
		AND api_id = $2 
		AND timestamp >= $3
		AND latency_ms > 0
	`, userID, apiID, todayStart).Scan(&metrics.P95LatencyMs)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	// Get last request timestamp
	err = t.db.QueryRowContext(ctx, `
		SELECT timestamp
		FROM request_logs
		WHERE user_id = $1 AND api_id = $2
		ORDER BY timestamp DESC
		LIMIT 1
	`, userID, apiID).Scan(&metrics.LastRequestAt)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	return metrics, nil
}
