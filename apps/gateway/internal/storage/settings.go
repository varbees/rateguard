package storage

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// GetNotificationPreferences retrieves notification preferences for a user
func (s *PostgresStore) GetNotificationPreferences(ctx context.Context, userID uuid.UUID) (*models.NotificationPreferences, error) {
	query := `
		SELECT id, user_id, email_alerts, usage_threshold_percent, error_alerts, weekly_report, created_at, updated_at
		FROM notification_preferences
		WHERE user_id = $1
	`

	var prefs models.NotificationPreferences
	err := s.db.QueryRowContext(ctx, query, userID).Scan(
		&prefs.ID,
		&prefs.UserID,
		&prefs.EmailAlerts,
		&prefs.UsageThresholdPercent,
		&prefs.ErrorAlerts,
		&prefs.WeeklyReport,
		&prefs.CreatedAt,
		&prefs.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("notification preferences not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get notification preferences: %w", err)
	}

	return &prefs, nil
}

// UpsertNotificationPreferences creates or updates notification preferences
func (s *PostgresStore) UpsertNotificationPreferences(ctx context.Context, prefs *models.NotificationPreferences) error {
	query := `
		INSERT INTO notification_preferences (id, user_id, email_alerts, usage_threshold_percent, error_alerts, weekly_report, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (user_id)
		DO UPDATE SET
			email_alerts = EXCLUDED.email_alerts,
			usage_threshold_percent = EXCLUDED.usage_threshold_percent,
			error_alerts = EXCLUDED.error_alerts,
			weekly_report = EXCLUDED.weekly_report,
			updated_at = EXCLUDED.updated_at
	`

	now := time.Now()
	if prefs.ID == uuid.Nil {
		prefs.ID = uuid.New()
	}
	if prefs.CreatedAt.IsZero() {
		prefs.CreatedAt = now
	}
	prefs.UpdatedAt = now

	_, err := s.db.ExecContext(ctx, query,
		prefs.ID,
		prefs.UserID,
		prefs.EmailAlerts,
		prefs.UsageThresholdPercent,
		prefs.ErrorAlerts,
		prefs.WeeklyReport,
		prefs.CreatedAt,
		prefs.UpdatedAt,
	)

	if err != nil {
		return fmt.Errorf("failed to upsert notification preferences: %w", err)
	}

	logger.Debug("Notification preferences upserted",
		zap.String("user_id", prefs.UserID.String()),
	)

	return nil
}

// UpdatePassword updates a user's password
func (s *PostgresStore) UpdatePassword(ctx context.Context, userID uuid.UUID, passwordHash string) error {
	query := `
		UPDATE users
		SET password_hash = $1,
		    updated_at = $2
		WHERE id = $3
	`

	result, err := s.db.ExecContext(ctx, query, passwordHash, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to update password: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return models.ErrUserNotFound
	}

	logger.Info("Password updated successfully",
		zap.String("user_id", userID.String()),
	)

	return nil
}

// UpdateAPIKey updates a user's API key
func (s *PostgresStore) UpdateAPIKey(ctx context.Context, userID uuid.UUID, apiKey string) error {
	query := `
		UPDATE users
		SET api_key = $1,
		    updated_at = $2
		WHERE id = $3
	`

	result, err := s.db.ExecContext(ctx, query, apiKey, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to update API key: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return models.ErrUserNotFound
	}

	logger.Info("API key updated successfully",
		zap.String("user_id", userID.String()),
	)

	return nil
}
