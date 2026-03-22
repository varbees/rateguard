package storage

import (
	"context"
	"fmt"

	"github.com/varbees/rateguard/internal/models"
)

// RecordRateLimitObservation persists an observed upstream rate-limit signal.
func (s *PostgresStore) RecordRateLimitObservation(ctx context.Context, observation *models.RateLimitObservation) error {
	query := `
		INSERT INTO rate_limit_observations (
			id, user_id, api_id, limit_per_window, window_seconds,
			reset_timestamp, retry_after_seconds, source_header,
			observed_at, response_status
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`

	_, err := s.db.ExecContext(ctx, query,
		observation.ID, observation.UserID, observation.APIID,
		observation.LimitPerWindow, observation.WindowSeconds,
		observation.ResetTimestamp, observation.RetryAfterSeconds,
		observation.SourceHeader, observation.ObservedAt, observation.ResponseStatus,
	)
	if err != nil {
		return fmt.Errorf("record rate limit observation: %w", err)
	}

	return nil
}
