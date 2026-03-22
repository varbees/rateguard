package policy

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// TokenBudgetChecker verifies token usage against preset limits.
type TokenBudgetChecker struct {
	db     *sql.DB
	logger *zap.Logger
}

// NewTokenBudgetChecker creates a new token budget checker.
func NewTokenBudgetChecker(db *sql.DB, logger *zap.Logger) *TokenBudgetChecker {
	return &TokenBudgetChecker{db: db, logger: logger}
}

// TokenBudgetStatus represents current token usage status.
type TokenBudgetStatus struct {
	UserID         uuid.UUID
	Preset         string
	TokensUsedMTD  int64
	TokensLimitMTD int64
	Remaining      int64
	PercentUsed    float64
	QuotaExceeded  bool
}

// CheckTokenBudget verifies whether a user can consume additional tokens.
func (c *TokenBudgetChecker) CheckTokenBudget(ctx context.Context, userID uuid.UUID, tokensRequested int64) (*TokenBudgetStatus, error) {
	presetChecker := NewPresetChecker(c.db, c.logger)
	preset, err := presetChecker.GetUserPreset(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user preset: %w", err)
	}

	features := GetPresetFeatures(preset)

	query := `
		SELECT COALESCE(SUM(total_tokens), 0)
		FROM api_metrics
		WHERE user_id = $1
		  AND timestamp >= DATE_TRUNC('month', NOW())
	`

	var mtdTokens int64
	err = c.db.QueryRowContext(ctx, query, userID).Scan(&mtdTokens)
	if err != nil {
		c.logger.Error("Failed to get token usage",
			zap.String("user_id", userID.String()),
			zap.Error(err),
		)
		return nil, fmt.Errorf("failed to get token usage: %w", err)
	}

	remaining := features.MaxTokensPerMonth - mtdTokens
	percentUsed := float64(mtdTokens) / float64(features.MaxTokensPerMonth) * 100
	quotaExceeded := mtdTokens+tokensRequested > features.MaxTokensPerMonth

	return &TokenBudgetStatus{
		UserID:         userID,
		Preset:         preset,
		TokensUsedMTD:  mtdTokens,
		TokensLimitMTD: features.MaxTokensPerMonth,
		Remaining:      remaining,
		PercentUsed:    percentUsed,
		QuotaExceeded:  quotaExceeded,
	}, nil
}

// SoftCheckTokenBudget checks quota and logs warning without blocking.
func (c *TokenBudgetChecker) SoftCheckTokenBudget(ctx context.Context, userID uuid.UUID, tokens int64) bool {
	status, err := c.CheckTokenBudget(ctx, userID, tokens)
	if err != nil {
		c.logger.Error("Token budget check failed", zap.Error(err))
		return false
	}

	if status.QuotaExceeded {
		c.logger.Warn("User exceeded token budget",
			zap.String("user_id", userID.String()),
			zap.String("preset", status.Preset),
			zap.Int64("used", status.TokensUsedMTD),
			zap.Int64("limit", status.TokensLimitMTD),
			zap.Float64("percent", status.PercentUsed),
		)
	} else if status.PercentUsed >= 80 {
		c.logger.Info("User approaching token budget",
			zap.String("user_id", userID.String()),
			zap.Float64("percent", status.PercentUsed),
		)
	}

	return status.QuotaExceeded
}
