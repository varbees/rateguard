//go:build commercial

package billing

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	domainpolicy "github.com/varbees/rateguard/internal/domain/policy"
	"go.uber.org/zap"
)

// TokenQuotaChecker verifies token usage against preset limits.
type TokenQuotaChecker struct {
	db     *sql.DB
	logger *zap.Logger
}

// NewTokenQuotaChecker creates a new token quota checker.
func NewTokenQuotaChecker(db *sql.DB, logger *zap.Logger) *TokenQuotaChecker {
	return &TokenQuotaChecker{
		db:     db,
		logger: logger,
	}
}

// TokenQuotaStatus represents current token usage status.
type TokenQuotaStatus struct {
	UserID         uuid.UUID
	Preset         string
	TokensUsedMTD  int64
	TokensLimitMTD int64
	Remaining      int64
	PercentUsed    float64
	QuotaExceeded  bool
}

// CheckTokenQuota verifies if a user can use additional tokens.
func (c *TokenQuotaChecker) CheckTokenQuota(ctx context.Context, userID uuid.UUID, tokensRequested int64) (*TokenQuotaStatus, error) {
	presetChecker := domainpolicy.NewPresetChecker(c.db, c.logger)
	preset, err := presetChecker.GetUserPreset(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user preset: %w", err)
	}

	features, err := presetChecker.GetUserFeatures(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get preset features: %w", err)
	}

	query := `
		SELECT COALESCE(SUM(total_tokens), 0)
		FROM api_metrics
		WHERE user_id = $1
		  AND timestamp >= DATE_TRUNC('month', NOW())
	`

	var mtdTokens int64
	if err := c.db.QueryRowContext(ctx, query, userID).Scan(&mtdTokens); err != nil {
		c.logger.Error("Failed to get token usage",
			zap.String("user_id", userID.String()),
			zap.Error(err),
		)
		return nil, fmt.Errorf("failed to get token usage: %w", err)
	}

	limit := features.MaxTokensPerMonth
	remaining := limit - mtdTokens
	percentUsed := 0.0
	quotaExceeded := false

	if limit > 0 {
		percentUsed = float64(mtdTokens) / float64(limit) * 100
		quotaExceeded = mtdTokens+tokensRequested > limit
	} else {
		remaining = -1
	}

	return &TokenQuotaStatus{
		UserID:         userID,
		Preset:         preset,
		TokensUsedMTD:  mtdTokens,
		TokensLimitMTD: limit,
		Remaining:      remaining,
		PercentUsed:    percentUsed,
		QuotaExceeded:  quotaExceeded,
	}, nil
}

// SoftCheckTokenQuota checks quota and logs warning without blocking.
func (c *TokenQuotaChecker) SoftCheckTokenQuota(ctx context.Context, userID uuid.UUID, tokens int64) bool {
	status, err := c.CheckTokenQuota(ctx, userID, tokens)
	if err != nil {
		c.logger.Error("Token quota check failed", zap.Error(err))
		return false
	}

	if status.QuotaExceeded {
		c.logger.Warn("User exceeded token quota",
			zap.String("user_id", userID.String()),
			zap.String("preset", status.Preset),
			zap.Int64("used", status.TokensUsedMTD),
			zap.Int64("limit", status.TokensLimitMTD),
			zap.Float64("percent", status.PercentUsed),
		)
	} else if status.PercentUsed >= 80 {
		c.logger.Info("User approaching token quota",
			zap.String("user_id", userID.String()),
			zap.Float64("percent", status.PercentUsed),
		)
	}

	return status.QuotaExceeded
}
