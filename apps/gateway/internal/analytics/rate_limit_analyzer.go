package analytics

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/models"
)

type RateLimitAnalyzer struct {
	db *sql.DB
}

func NewRateLimitAnalyzer(db *sql.DB) *RateLimitAnalyzer {
	return &RateLimitAnalyzer{db: db}
}

// GetRateLimitSuggestions analyzes observations and returns recommendations
func (a *RateLimitAnalyzer) GetRateLimitSuggestions(
	ctx context.Context,
	userID, apiID uuid.UUID,
) (*models.RateLimitSuggestion, error) {
	// Get current config
	var currentConfig struct {
		Name               string
		RateLimitPerSec    int64
		RateLimitPerMinute int64
		RateLimitPerHour   int64
		RateLimitPerDay    int64
	}

	err := a.db.QueryRowContext(ctx, `
		SELECT name, rate_limit_per_second, 
		       COALESCE(rate_limit_per_minute, 0) as rate_limit_per_minute,
		       COALESCE(rate_limit_per_hour, 0) as rate_limit_per_hour,
		       COALESCE(rate_limit_per_day, 0) as rate_limit_per_day
		FROM api_configs
		WHERE id = $1 AND user_id = $2
	`, apiID, userID).Scan(
		&currentConfig.Name,
		&currentConfig.RateLimitPerSec,
		&currentConfig.RateLimitPerMinute,
		&currentConfig.RateLimitPerHour,
		&currentConfig.RateLimitPerDay,
	)
	if err != nil {
		return nil, err
	}

	// Get observations from last 30 days
	rows, err := a.db.QueryContext(ctx, `
		SELECT limit_per_window, window_seconds, observed_at
		FROM rate_limit_observations
		WHERE api_id = $1
		  AND observed_at > NOW() - INTERVAL '30 days'
		ORDER BY observed_at DESC
		LIMIT 100
	`, apiID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Analyze observations
	var observations []struct {
		LimitPerWindow int64
		WindowSeconds  int
		ObservedAt     time.Time
	}

	for rows.Next() {
		var obs struct {
			LimitPerWindow sql.NullInt64
			WindowSeconds  sql.NullInt32
			ObservedAt     time.Time
		}
		if err := rows.Scan(&obs.LimitPerWindow, &obs.WindowSeconds, &obs.ObservedAt); err != nil {
			continue
		}
		if obs.LimitPerWindow.Valid && obs.WindowSeconds.Valid {
			observations = append(observations, struct {
				LimitPerWindow int64
				WindowSeconds  int
				ObservedAt     time.Time
			}{
				LimitPerWindow: obs.LimitPerWindow.Int64,
				WindowSeconds:  int(obs.WindowSeconds.Int32),
				ObservedAt:     obs.ObservedAt,
			})
		}
	}

	if len(observations) == 0 {
		return nil, nil // No suggestions available
	}

	// Calculate suggestions based on observed patterns
	suggestion := &models.RateLimitSuggestion{
		APIID:             apiID,
		APIName:           currentConfig.Name,
		CurrentPerSecond:  currentConfig.RateLimitPerSec,
		CurrentPerMinute:  currentConfig.RateLimitPerMinute,
		CurrentPerHour:    currentConfig.RateLimitPerHour,
		CurrentPerDay:     currentConfig.RateLimitPerDay,
		ObservationCount:  len(observations),
		LastObservedAt:    observations[0].ObservedAt,
	}

	// Group by window size and find most common limits
	windowLimits := make(map[int][]int64)
	for _, obs := range observations {
		windowLimits[obs.WindowSeconds] = append(windowLimits[obs.WindowSeconds], obs.LimitPerWindow)
	}

	// Convert to per-second, per-minute, per-hour, per-day
	maxConfidence := 0
	for window, limits := range windowLimits {
		avgLimit := average(limits)
		confidence := calculateConfidence(limits)

		switch window {
		case 1: // Per second
			suggestion.SuggestedPerSecond = &avgLimit
		case 60: // Per minute
			suggestion.SuggestedPerMinute = &avgLimit
			perSec := avgLimit / 60
			if suggestion.SuggestedPerSecond == nil {
				suggestion.SuggestedPerSecond = &perSec
			}
		case 3600: // Per hour
			suggestion.SuggestedPerHour = &avgLimit
		case 86400: // Per day
			suggestion.SuggestedPerDay = &avgLimit
		default:
			// Handle arbitrary windows - normalize to closest standard window
			if window < 60 {
				perSec := avgLimit / int64(window)
				if suggestion.SuggestedPerSecond == nil {
					suggestion.SuggestedPerSecond = &perSec
				}
			} else if window < 3600 {
				perMin := avgLimit * 60 / int64(window)
				if suggestion.SuggestedPerMinute == nil {
					suggestion.SuggestedPerMinute = &perMin
				}
			} else if window < 86400 {
				perHour := avgLimit * 3600 / int64(window)
				if suggestion.SuggestedPerHour == nil {
					suggestion.SuggestedPerHour = &perHour
				}
			} else {
				perDay := avgLimit * 86400 / int64(window)
				if suggestion.SuggestedPerDay == nil {
					suggestion.SuggestedPerDay = &perDay
				}
			}
		}

		// Use highest confidence score
		if confidence > maxConfidence {
			maxConfidence = confidence
		}
	}

	suggestion.ConfidenceScore = maxConfidence

	// Generate recommendation reason
	suggestion.RecommendationReason = generateRecommendationReason(suggestion, struct {
		RateLimitPerSec    int64
		RateLimitPerMinute int64
		RateLimitPerHour   int64
		RateLimitPerDay    int64
	}{
		RateLimitPerSec:    currentConfig.RateLimitPerSec,
		RateLimitPerMinute: currentConfig.RateLimitPerMinute,
		RateLimitPerHour:   currentConfig.RateLimitPerHour,
		RateLimitPerDay:    currentConfig.RateLimitPerDay,
	})

	return suggestion, nil
}

func average(nums []int64) int64 {
	if len(nums) == 0 {
		return 0
	}
	var sum int64
	for _, n := range nums {
		sum += n
	}
	return sum / int64(len(nums))
}

func calculateConfidence(nums []int64) int {
	if len(nums) < 3 {
		return 30 // Low confidence with few samples
	}

	avg := average(nums)
	if avg == 0 {
		return 20
	}

	var variance float64
	for _, n := range nums {
		diff := float64(n - avg)
		variance += diff * diff
	}
	variance /= float64(len(nums))

	// Calculate coefficient of variation (CV = stddev / mean)
	stdDev := math.Sqrt(variance)
	cv := stdDev / float64(avg)

	// Lower CV = higher confidence
	// Normalize to 0-100 scale
	if cv < 0.05 { // Very low variation
		return 95
	} else if cv < 0.10 { // Low variation
		return 85
	} else if cv < 0.20 { // Moderate variation
		return 70
	} else if cv < 0.30 { // Higher variation
		return 55
	}
	return 40 // High variation
}

func generateRecommendationReason(
	suggestion *models.RateLimitSuggestion,
	currentConfig struct {
		RateLimitPerSec    int64
		RateLimitPerMinute int64
		RateLimitPerHour   int64
		RateLimitPerDay    int64
	},
) string {
	reasons := []string{}

	if suggestion.SuggestedPerSecond != nil && *suggestion.SuggestedPerSecond < currentConfig.RateLimitPerSec {
		diff := currentConfig.RateLimitPerSec - *suggestion.SuggestedPerSecond
		reasons = append(reasons, fmt.Sprintf("Detected per-second limit is %d lower than configured", diff))
	}

	if suggestion.SuggestedPerMinute != nil && currentConfig.RateLimitPerMinute > 0 &&
		*suggestion.SuggestedPerMinute < currentConfig.RateLimitPerMinute {
		diff := currentConfig.RateLimitPerMinute - *suggestion.SuggestedPerMinute
		reasons = append(reasons, fmt.Sprintf("Per-minute limit appears %d lower", diff))
	}

	if suggestion.SuggestedPerHour != nil && currentConfig.RateLimitPerHour > 0 &&
		*suggestion.SuggestedPerHour < currentConfig.RateLimitPerHour {
		reasons = append(reasons, "Hourly limit appears lower than configured")
	}

	if suggestion.SuggestedPerDay != nil && currentConfig.RateLimitPerDay > 0 &&
		*suggestion.SuggestedPerDay < currentConfig.RateLimitPerDay {
		reasons = append(reasons, "Daily limit appears lower than configured")
	}

	if len(reasons) == 0 {
		return fmt.Sprintf("Suggested limits match observed API behavior based on %d observations", suggestion.ObservationCount)
	}

	return strings.Join(reasons, "; ")
}
