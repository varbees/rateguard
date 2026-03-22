package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// CreateWebhookEvent creates a new webhook event
func (s *PostgresStore) CreateWebhookEvent(ctx context.Context, event *models.WebhookEvent) error {
	// Serialize payload and headers to JSONB
	payloadJSON, err := json.Marshal(event.Payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}
	
	headersJSON, err := json.Marshal(event.Headers)
	if err != nil {
		return fmt.Errorf("failed to marshal headers: %w", err)
	}

	query := `
		INSERT INTO webhook_relay_events (
			id, user_id, source, event_type, payload, headers, target_url,
			status, retries, max_retries, next_attempt_at, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
		)
	`

	_, err = s.db.ExecContext(
		ctx, query,
		event.ID, event.UserID, event.Source, event.EventType,
		payloadJSON, headersJSON, event.TargetURL,
		event.Status, event.Retries, event.MaxRetries, event.NextAttemptAt,
		event.CreatedAt, event.UpdatedAt,
	)

	if err != nil {
		return fmt.Errorf("failed to create webhook event: %w", err)
	}

	logger.Info("Webhook event created",
		zap.String("event_id", event.ID.String()),
		zap.String("user_id", event.UserID.String()),
		zap.String("source", event.Source),
		zap.String("event_type", event.EventType),
	)

	return nil
}

// GetWebhookEvent retrieves a webhook event by ID
func (s *PostgresStore) GetWebhookEvent(ctx context.Context, eventID uuid.UUID) (*models.WebhookEvent, error) {
	query := `
		SELECT id, user_id, source, event_type, payload, headers, target_url,
		       status, retries, max_retries, next_attempt_at,
		       last_error, last_attempt_at, delivered_at,
		       response_status_code, response_body,
		       created_at, updated_at
		FROM webhook_relay_events
		WHERE id = $1
	`

	var event models.WebhookEvent
	var payloadJSON, headersJSON []byte

	err := s.db.QueryRowContext(ctx, query, eventID).Scan(
		&event.ID, &event.UserID, &event.Source, &event.EventType,
		&payloadJSON, &headersJSON, &event.TargetURL,
		&event.Status, &event.Retries, &event.MaxRetries, &event.NextAttemptAt,
		&event.LastError, &event.LastAttemptAt, &event.DeliveredAt,
		&event.ResponseStatusCode, &event.ResponseBody,
		&event.CreatedAt, &event.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, models.ErrWebhookNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get webhook event: %w", err)
	}

	// Deserialize JSON fields
	if err := json.Unmarshal(payloadJSON, &event.Payload); err != nil {
		return nil, fmt.Errorf("failed to unmarshal payload: %w", err)
	}
	if err := json.Unmarshal(headersJSON, &event.Headers); err != nil {
		return nil, fmt.Errorf("failed to unmarshal headers: %w", err)
	}

	return &event, nil
}

// ListWebhookEvents retrieves webhook events for a user with pagination
func (s *PostgresStore) ListWebhookEvents(ctx context.Context, userID uuid.UUID, page, pageSize int, status *models.WebhookEventStatus) ([]models.WebhookEvent, int, error) {
	offset := (page - 1) * pageSize

	// Build query with optional status filter
	whereClause := "WHERE user_id = $1"
	args := []interface{}{userID}
	argCount := 1

	if status != nil {
		argCount++
		whereClause += fmt.Sprintf(" AND status = $%d", argCount)
		args = append(args, *status)
	}

	// Count total
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM webhook_relay_events %s", whereClause)
	var totalCount int
	if err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&totalCount); err != nil {
		return nil, 0, fmt.Errorf("failed to count webhook events: %w", err)
	}

	// Fetch events
	argCount++
	limitArg := argCount
	argCount++
	offsetArg := argCount
	
	query := fmt.Sprintf(`
		SELECT id, user_id, source, event_type, payload, headers, target_url,
		       status, retries, max_retries, next_attempt_at,
		       last_error, last_attempt_at, delivered_at,
		       response_status_code, response_body,
		       created_at, updated_at
		FROM webhook_relay_events
		%s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, limitArg, offsetArg)

	args = append(args, pageSize, offset)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list webhook events: %w", err)
	}
	defer rows.Close()

	var events []models.WebhookEvent

	for rows.Next() {
		var event models.WebhookEvent
		var payloadJSON, headersJSON []byte

		err := rows.Scan(
			&event.ID, &event.UserID, &event.Source, &event.EventType,
			&payloadJSON, &headersJSON, &event.TargetURL,
			&event.Status, &event.Retries, &event.MaxRetries, &event.NextAttemptAt,
			&event.LastError, &event.LastAttemptAt, &event.DeliveredAt,
			&event.ResponseStatusCode, &event.ResponseBody,
			&event.CreatedAt, &event.UpdatedAt,
		)
		if err != nil {
			logger.Error("Failed to scan webhook event", zap.Error(err))
			continue
		}

		// Deserialize JSON fields
		if err := json.Unmarshal(payloadJSON, &event.Payload); err != nil {
			logger.Error("Failed to unmarshal payload", zap.Error(err))
			continue
		}
		if err := json.Unmarshal(headersJSON, &event.Headers); err != nil {
			logger.Error("Failed to unmarshal headers", zap.Error(err))
			continue
		}

		events = append(events, event)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error iterating webhook events: %w", err)
	}

	return events, totalCount, nil
}

// GetPendingWebhookEvents retrieves webhook events ready for delivery
func (s *PostgresStore) GetPendingWebhookEvents(ctx context.Context, limit int) ([]models.WebhookEvent, error) {
	query := `
		SELECT id, user_id, source, event_type, payload, headers, target_url,
		       status, retries, max_retries, next_attempt_at,
		       last_error, last_attempt_at, delivered_at,
		       response_status_code, response_body,
		       created_at, updated_at
		FROM webhook_relay_events
		WHERE status IN ('pending', 'failed')
		  AND retries < max_retries
		  AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
		ORDER BY next_attempt_at ASC NULLS FIRST, created_at ASC
		LIMIT $1
	`

	rows, err := s.db.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get pending webhook events: %w", err)
	}
	defer rows.Close()

	var events []models.WebhookEvent

	for rows.Next() {
		var event models.WebhookEvent
		var payloadJSON, headersJSON []byte

		err := rows.Scan(
			&event.ID, &event.UserID, &event.Source, &event.EventType,
			&payloadJSON, &headersJSON, &event.TargetURL,
			&event.Status, &event.Retries, &event.MaxRetries, &event.NextAttemptAt,
			&event.LastError, &event.LastAttemptAt, &event.DeliveredAt,
			&event.ResponseStatusCode, &event.ResponseBody,
			&event.CreatedAt, &event.UpdatedAt,
		)
		if err != nil {
			logger.Error("Failed to scan webhook event", zap.Error(err))
			continue
		}

		// Deserialize JSON fields
		if err := json.Unmarshal(payloadJSON, &event.Payload); err != nil {
			logger.Error("Failed to unmarshal payload", zap.Error(err))
			continue
		}
		if err := json.Unmarshal(headersJSON, &event.Headers); err != nil {
			logger.Error("Failed to unmarshal headers", zap.Error(err))
			continue
		}

		events = append(events, event)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating pending webhooks: %w", err)
	}

	return events, nil
}

// UpdateWebhookEventDelivery updates webhook event after a delivery attempt
func (s *PostgresStore) UpdateWebhookEventDelivery(ctx context.Context, eventID uuid.UUID, attempt *models.WebhookDeliveryAttempt) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Determine new status
	newStatus := models.WebhookStatusFailed
	if attempt.Success {
		newStatus = models.WebhookStatusDelivered
	}

	// Update webhook event
	query := `
		UPDATE webhook_relay_events
		SET status = $1,
		    retries = retries + 1,
		    last_attempt_at = $2,
		    last_error = $3,
		    response_status_code = $4,
		    response_body = $5,
		    delivered_at = $6,
		    next_attempt_at = $7,
		    updated_at = $8
		WHERE id = $9
		RETURNING retries, max_retries
	`

	var deliveredAt *time.Time
	if attempt.Success {
		deliveredAt = &attempt.AttemptedAt
	}

	var retries, maxRetries int
	err = tx.QueryRowContext(
		ctx, query,
		newStatus,
		attempt.AttemptedAt,
		attempt.Error,
		attempt.StatusCode,
		attempt.ResponseBody,
		deliveredAt,
		attempt.NextRetryAt,
		time.Now(),
		eventID,
	).Scan(&retries, &maxRetries)

	if err != nil {
		return fmt.Errorf("failed to update webhook event: %w", err)
	}

	// Move to dead letter if max retries exceeded
	if !attempt.Success && retries >= maxRetries {
		deadLetterQuery := `
			UPDATE webhook_relay_events
			SET status = 'dead_letter',
			    updated_at = NOW()
			WHERE id = $1
		`
		_, err = tx.ExecContext(ctx, deadLetterQuery, eventID)
		if err != nil {
			return fmt.Errorf("failed to move to dead letter: %w", err)
		}

		logger.Warn("Webhook moved to dead letter queue",
			zap.String("event_id", eventID.String()),
			zap.Int("retries", retries),
			zap.Int("max_retries", maxRetries),
		)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	logger.Debug("Webhook delivery attempt recorded",
		zap.String("event_id", eventID.String()),
		zap.Bool("success", attempt.Success),
		zap.Int("attempt_number", attempt.AttemptNumber),
	)

	return nil
}

// MarkWebhookEventProcessing marks a webhook event as being processed
func (s *PostgresStore) MarkWebhookEventProcessing(ctx context.Context, eventID uuid.UUID) error {
	query := `
		UPDATE webhook_relay_events
		SET status = 'processing',
		    updated_at = NOW()
		WHERE id = $1
		  AND status IN ('pending', 'failed')
	`

	result, err := s.db.ExecContext(ctx, query, eventID)
	if err != nil {
		return fmt.Errorf("failed to mark webhook as processing: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rows == 0 {
		return models.ErrWebhookNotFound
	}

	return nil
}

// GetWebhookStatsByUser returns webhook statistics for a user
func (s *PostgresStore) GetWebhookStatsByUser(ctx context.Context, userID uuid.UUID) (map[string]interface{}, error) {
	query := `
		SELECT 
			COUNT(*) as total,
			COUNT(*) FILTER (WHERE status = 'pending') as pending,
			COUNT(*) FILTER (WHERE status = 'processing') as processing,
			COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
			COUNT(*) FILTER (WHERE status = 'failed') as failed,
			COUNT(*) FILTER (WHERE status = 'dead_letter') as dead_letter,
			COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h,
			COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as last_hour
		FROM webhook_relay_events
		WHERE user_id = $1
	`

	var stats struct {
		Total      int
		Pending    int
		Processing int
		Delivered  int
		Failed     int
		DeadLetter int
		Last24h    int
		LastHour   int
	}

	err := s.db.QueryRowContext(ctx, query, userID).Scan(
		&stats.Total,
		&stats.Pending,
		&stats.Processing,
		&stats.Delivered,
		&stats.Failed,
		&stats.DeadLetter,
		&stats.Last24h,
		&stats.LastHour,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get webhook stats: %w", err)
	}

	return map[string]interface{}{
		"total":       stats.Total,
		"pending":     stats.Pending,
		"processing":  stats.Processing,
		"delivered":   stats.Delivered,
		"failed":      stats.Failed,
		"dead_letter": stats.DeadLetter,
		"last_24h":    stats.Last24h,
		"last_hour":   stats.LastHour,
	}, nil
}

// CleanupOldWebhookEvents deletes old delivered webhook events (retention policy)
func (s *PostgresStore) CleanupOldWebhookEvents(ctx context.Context, retentionDays int) (int64, error) {
	query := `
		DELETE FROM webhook_relay_events
		WHERE status = 'delivered'
		  AND created_at < NOW() - INTERVAL '1 day' * $1
	`

	result, err := s.db.ExecContext(ctx, query, retentionDays)
	if err != nil {
		// Check if it's a foreign key constraint error
		if pqErr, ok := err.(*pq.Error); ok {
			logger.Error("Database error during cleanup", zap.String("code", string(pqErr.Code)))
		}
		return 0, fmt.Errorf("failed to cleanup old webhook events: %w", err)
	}

	deleted, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("failed to get rows affected: %w", err)
	}

	if deleted > 0 {
		logger.Info("Cleaned up old webhook events",
			zap.Int64("deleted", deleted),
			zap.Int("retention_days", retentionDays),
		)
	}

	return deleted, nil
}

// ReplayWebhook resets a webhook event for retry
func (s *PostgresStore) ReplayWebhook(ctx context.Context, eventID uuid.UUID) error {
	query := `
		UPDATE webhook_relay_events
		SET status = 'pending',
		    retries = 0,
		    next_attempt_at = NOW(),
		    last_error = NULL,
		    updated_at = NOW()
		WHERE id = $1
	`

	result, err := s.db.ExecContext(ctx, query, eventID)
	if err != nil {
		return fmt.Errorf("failed to replay webhook: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rows == 0 {
		return models.ErrWebhookNotFound
	}

	logger.Info("Webhook marked for replay",
		zap.String("event_id", eventID.String()),
	)

	return nil
}
