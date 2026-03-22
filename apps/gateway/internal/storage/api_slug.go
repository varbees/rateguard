package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// GetAPIConfigBySlug retrieves an API config by user ID and slug
// Uses same encryption/caching patterns as GetAPIConfigByName for consistency
func (s *PostgresStore) GetAPIConfigBySlug(ctx context.Context, userID uuid.UUID, slug string) (*models.APIConfig, error) {
	// Step 1: Try cache first (if available) - use slug as cache key
	if s.cache != nil {
		// Note: Cache layer would need to support slug-based lookup
		// For now, we skip cache for slug lookups to avoid complexity
		// This can be optimized later with a slug-to-id cache mapping
	}

	// Step 2: Query database
	query := `
		SELECT id, user_id, name, slug, target_url, rate_limit_per_second, burst_size,
		       rate_limit_per_hour, rate_limit_per_day, rate_limit_per_month, enabled,
		       allowed_origins, custom_headers, auth_type, auth_credentials,
		       timeout_seconds, retry_attempts, provider, model, is_llm_api,
		       pricing_model, created_at, updated_at
		FROM api_configs
		WHERE user_id = $1 AND slug = $2 AND enabled = true
	`

	var config models.APIConfig
	var customHeadersJSON, authCredsJSON, allowedOriginsJSON []byte

	err := s.db.QueryRowContext(ctx, query, userID, slug).Scan(
		&config.ID,
		&config.UserID,
		&config.Name,
		&config.Slug,
		&config.TargetURL,
		&config.RateLimitPerSecond,
		&config.BurstSize,
		&config.RateLimitPerHour,
		&config.RateLimitPerDay,
		&config.RateLimitPerMonth,
		&config.Enabled,
		&allowedOriginsJSON,
		&customHeadersJSON,
		&config.AuthType,
		&authCredsJSON,
		&config.TimeoutSeconds,
		&config.RetryAttempts,
		&config.Provider,
		&config.Model,
		&config.IsLLMAPI,
		&config.PricingModel,
		&config.CreatedAt,
		&config.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, models.ErrAPIConfigNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get API config by slug: %w", err)
	}

	// Unmarshal JSONB fields
	json.Unmarshal(customHeadersJSON, &config.CustomHeaders)
	json.Unmarshal(allowedOriginsJSON, &config.AllowedOrigins)

	// Step 3: Decrypt credentials (use shared helper for consistency)
	if len(authCredsJSON) > 0 {
		decryptedCreds, err := s.DecryptAuthCredentials(authCredsJSON)
		if err != nil {
			logger.Error("Failed to decrypt auth credentials for slug lookup",
				zap.String("config_id", config.ID.String()),
				zap.String("slug", slug),
				zap.Error(err),
			)
			return nil, fmt.Errorf("failed to decrypt credentials: %w", err)
		}
		config.AuthCredentials = decryptedCreds
	} else {
		config.AuthCredentials = make(map[string]string)
	}

	return &config, nil
}

// CheckSlugAvailability checks if a slug is available within a user's namespace
// Returns true if available, false if taken
func (s *PostgresStore) CheckSlugAvailability(ctx context.Context, userID uuid.UUID, slug string) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM api_configs WHERE user_id = $1 AND slug = $2)`
	
	var exists bool
	err := s.db.QueryRowContext(ctx, query, userID, slug).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("failed to check slug availability: %w", err)
	}
	
	// Return true if NOT exists (available)
	return !exists, nil
}

// CheckSlugAvailabilityExcludingConfig checks slug availability excluding a specific config
// Used when updating a config's slug to avoid self-collision
func (s *PostgresStore) CheckSlugAvailabilityExcludingConfig(ctx context.Context, userID, excludeConfigID uuid.UUID, slug string) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM api_configs WHERE user_id = $1 AND slug = $2 AND id != $3)`
	
	var exists bool
	err := s.db.QueryRowContext(ctx, query, userID, slug, excludeConfigID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("failed to check slug availability: %w", err)
	}
	
	// Return true if NOT exists (available)
	return !exists, nil
}

// UpdateAPIConfigSlug updates an API config's slug (with collision checking)
func (s *PostgresStore) UpdateAPIConfigSlug(ctx context.Context, configID, userID uuid.UUID, newSlug string) error {
	// Validate slug format first
	if err := models.ValidateSlug(newSlug); err != nil {
		return err
	}

	// Check if new slug is available (excluding current config)
	available, err := s.CheckSlugAvailabilityExcludingConfig(ctx, userID, configID, newSlug)
	if err != nil {
		return err
	}
	if !available {
		return models.ErrSlugTaken
	}
	
	// Update slug
	query := `
		UPDATE api_configs
		SET slug = $1, updated_at = NOW()
		WHERE id = $2 AND user_id = $3
	`
	
	result, err := s.db.ExecContext(ctx, query, newSlug, configID, userID)
	if err != nil {
		// Check for unique constraint violation (race condition)
		if pqErr, ok := err.(*pq.Error); ok {
			if pqErr.Code == "23505" { // unique_violation
				return models.ErrSlugTaken
			}
		}
		return fmt.Errorf("failed to update slug: %w", err)
	}
	
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return models.ErrAPIConfigNotFound
	}
	
	logger.Info("API config slug updated",
		zap.String("config_id", configID.String()),
		zap.String("user_id", userID.String()),
		zap.String("new_slug", newSlug),
	)
	
	// Invalidate cache if available (same pattern as UpdateAPIConfig)
	if s.cache != nil {
		if err := s.cache.InvalidateAPIConfig(configID); err != nil {
			logger.Warn("Failed to invalidate API config cache after slug update",
				zap.String("config_id", configID.String()),
				zap.Error(err),
			)
		}
	}
	
	return nil
}

// DecryptAuthCredentials is a shared helper for decrypting credentials
// Used by multiple methods to ensure consistent error handling
func (s *PostgresStore) DecryptAuthCredentials(authCredsJSON []byte) (map[string]string, error) {
	if s.encryptor == nil {
		return nil, fmt.Errorf("credentials are encrypted but ENCRYPTION_KEY is not set")
	}
	
	// Deserialize encrypted map from binary
	var encryptedCreds map[string]string
	if err := json.Unmarshal(authCredsJSON, &encryptedCreds); err != nil {
		return nil, fmt.Errorf("failed to deserialize encrypted credentials: %w", err)
	}
	
	// Decrypt the map
	decryptedCreds, err := s.encryptor.DecryptMap(encryptedCreds)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt credentials: %w", err)
	}
	
	return decryptedCreds, nil
}
