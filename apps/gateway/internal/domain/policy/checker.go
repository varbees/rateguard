package policy

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// PresetChecker provides methods to read and enforce policy presets.
type PresetChecker struct {
	db     *sql.DB
	logger *zap.Logger
}

// NewPresetChecker creates a new preset checker instance.
func NewPresetChecker(db *sql.DB, logger *zap.Logger) *PresetChecker {
	return &PresetChecker{db: db, logger: logger}
}

// GetUserPreset retrieves the user's current preset from the stored users.plan column.
func (p *PresetChecker) GetUserPreset(ctx context.Context, userID uuid.UUID) (string, error) {
	query := `SELECT plan FROM users WHERE id = $1`

	var preset string
	err := p.db.QueryRowContext(ctx, query, userID).Scan(&preset)
	if err == sql.ErrNoRows {
		return "dev", nil
	}
	if err != nil {
		p.logger.Error("Failed to get user preset",
			zap.String("user_id", userID.String()),
			zap.Error(err),
		)
		return "", fmt.Errorf("failed to get user preset: %w", err)
	}

	return NormalizePreset(preset), nil
}

// GetUserFeatures retrieves the feature limits for a user's preset.
func (p *PresetChecker) GetUserFeatures(ctx context.Context, userID uuid.UUID) (Features, error) {
	preset, err := p.GetUserPreset(ctx, userID)
	if err != nil {
		return Features{}, err
	}

	return GetPresetFeatures(preset), nil
}

// CanCreateAPI checks whether a user can create another API route.
func (p *PresetChecker) CanCreateAPI(ctx context.Context, userID uuid.UUID) (bool, string, error) {
	features, err := p.GetUserFeatures(ctx, userID)
	if err != nil {
		return false, "", err
	}

	query := `SELECT COUNT(*) FROM api_configs WHERE user_id = $1`
	var apiCount int
	err = p.db.QueryRowContext(ctx, query, userID).Scan(&apiCount)
	if err != nil {
		p.logger.Error("Failed to count user APIs",
			zap.String("user_id", userID.String()),
			zap.Error(err),
		)
		return false, "", fmt.Errorf("failed to count APIs: %w", err)
	}

	if features.MaxAPIs > 0 && apiCount >= features.MaxAPIs {
		preset, _ := p.GetUserPreset(ctx, userID)
		message := fmt.Sprintf(
			"You have reached the maximum number of routes (%d) for the %s preset.",
			features.MaxAPIs,
			preset,
		)
		return false, message, nil
	}

	return true, "", nil
}

// CanMakeRequest checks whether a user can make another request.
func (p *PresetChecker) CanMakeRequest(ctx context.Context, userID uuid.UUID) (bool, int64, string, error) {
	features, err := p.GetUserFeatures(ctx, userID)
	if err != nil {
		return false, 0, "", err
	}

	todayQuery := `
		SELECT COALESCE(SUM(requests), 0)
		FROM api_usage
		WHERE user_id = $1 AND usage_date = CURRENT_DATE
	`
	var todayRequests int64
	err = p.db.QueryRowContext(ctx, todayQuery, userID).Scan(&todayRequests)
	if err != nil {
		p.logger.Error("Failed to get today's usage",
			zap.String("user_id", userID.String()),
			zap.Error(err),
		)
		return false, 0, "", fmt.Errorf("failed to get usage: %w", err)
	}

	monthQuery := `
		SELECT COALESCE(SUM(requests), 0)
		FROM api_usage
		WHERE user_id = $1
		  AND usage_date >= DATE_TRUNC('month', CURRENT_DATE)
	`
	var monthRequests int64
	err = p.db.QueryRowContext(ctx, monthQuery, userID).Scan(&monthRequests)
	if err != nil {
		p.logger.Error("Failed to get monthly usage",
			zap.String("user_id", userID.String()),
			zap.Error(err),
		)
		return false, 0, "", fmt.Errorf("failed to get monthly usage: %w", err)
	}

	preset, _ := p.GetUserPreset(ctx, userID)

	if features.MaxRequestsPerMonth > 0 && monthRequests >= features.MaxRequestsPerMonth {
		message := fmt.Sprintf(
			"You have reached the monthly request limit (%d) for the %s preset.",
			features.MaxRequestsPerMonth,
			preset,
		)
		return false, 0, message, nil
	}

	if features.MaxRequestsPerDay > 0 && todayRequests >= features.MaxRequestsPerDay {
		message := fmt.Sprintf(
			"You have reached the daily request limit (%d) for the %s preset.",
			features.MaxRequestsPerDay,
			preset,
		)
		return false, 0, message, nil
	}

	remaining := features.MaxRequestsPerMonth - monthRequests
	if features.MaxRequestsPerMonth == 0 {
		remaining = -1
	}

	return true, remaining, "", nil
}

// GetUsageStats returns current route count and today's request count.
func (p *PresetChecker) GetUsageStats(ctx context.Context, userID uuid.UUID) (int, int64, error) {
	var apiCount int
	apiQuery := `SELECT COUNT(*) FROM api_configs WHERE user_id = $1`
	if err := p.db.QueryRowContext(ctx, apiQuery, userID).Scan(&apiCount); err != nil {
		return 0, 0, fmt.Errorf("failed to get API count: %w", err)
	}

	var todayRequests int64
	usageQuery := `
		SELECT COALESCE(SUM(requests), 0)
		FROM api_usage
		WHERE user_id = $1 AND usage_date = CURRENT_DATE
	`
	if err := p.db.QueryRowContext(ctx, usageQuery, userID).Scan(&todayRequests); err != nil {
		return 0, 0, fmt.Errorf("failed to get usage: %w", err)
	}

	return apiCount, todayRequests, nil
}
