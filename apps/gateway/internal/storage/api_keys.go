package storage

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// --- API Key Operations ---

// ListAPIKeys returns all API keys for a user (active and revoked)
func (s *PostgresStore) ListAPIKeys(ctx context.Context, userID uuid.UUID) ([]models.APIKey, error) {
	query := `
		SELECT id, user_id, key_name, api_key, created_at, last_used_at, revoked_at
		FROM api_keys
		WHERE user_id = $1
		ORDER BY created_at DESC
	`
	
	rows, err := s.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to list API keys: %w", err)
	}
	defer rows.Close()
	
	var keys []models.APIKey
	for rows.Next() {
		var key models.APIKey
		if err := rows.Scan(&key.ID, &key.UserID, &key.KeyName, &key.APIKey, 
		                    &key.CreatedAt, &key.LastUsedAt, &key.RevokedAt); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}
	
	return keys, nil
}

// CreateAPIKey creates a new API key
func (s *PostgresStore) CreateAPIKey(ctx context.Context, key *models.APIKey) error {
	query := `
		INSERT INTO api_keys (id, user_id, key_name, api_key, created_at)
		VALUES ($1, $2, $3, $4, $5)
	`
	
	_, err := s.db.ExecContext(ctx, query, key.ID, key.UserID, 
	                            key.KeyName, key.APIKey, key.CreatedAt)
	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok {
			if pqErr.Code == "23505" { // unique_violation
				return fmt.Errorf("key with name '%s' already exists", key.KeyName)
			}
		}
		return fmt.Errorf("failed to create API key: %w", err)
	}
	
	logger.Info("API key created",
		zap.String("user_id", key.UserID.String()),
		zap.String("key_name", key.KeyName),
	)
	
	return nil
}

// RevokeAPIKey soft-deletes an API key by setting revoked_at
func (s *PostgresStore) RevokeAPIKey(ctx context.Context, keyID, userID uuid.UUID) error {
	query := `
		UPDATE api_keys
		SET revoked_at = NOW()
		WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
	`
	
	result, err := s.db.ExecContext(ctx, query, keyID, userID)
	if err != nil {
		return fmt.Errorf("failed to revoke API key: %w", err)
	}
	
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("API key not found or already revoked")
	}
	
	logger.Info("API key revoked",
		zap.String("user_id", userID.String()),
		zap.String("key_id", keyID.String()),
	)
	
	return nil
}

// UpdateAPIKeyLastUsed updates the last_used_at timestamp (async, non-blocking)
func (s *PostgresStore) UpdateAPIKeyLastUsed(ctx context.Context, apiKey string) error {
	query := `
		UPDATE api_keys
		SET last_used_at = NOW()
		WHERE api_key = $1 AND revoked_at IS NULL
	`
	
	_, err := s.db.ExecContext(ctx, query, apiKey)
	// Silently fail - not critical if update doesn't work
	if err != nil {
		logger.Debug("Failed to update last_used_at",
			zap.Error(err),
		)
	}
	return err
}
