package storage

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// GetUserByHandle retrieves a user by their handle
func (s *PostgresStore) GetUserByHandle(ctx context.Context, handle string) (*models.User, error) {
	query := `
		SELECT id, email, password_hash, api_key, handle, plan, active, email_verified, 
		       verification_token, reset_token, reset_token_expires, country_code, 
		       detected_currency, last_login_at, created_at, updated_at
		FROM users
		WHERE handle = $1
	`

	var user models.User
	err := s.db.QueryRowContext(ctx, query, handle).Scan(
		&user.ID,
		&user.Email,
		&user.PasswordHash,
		&user.APIKey,
		&user.Handle,
		&user.Preset,
		&user.Active,
		&user.EmailVerified,
		&user.VerificationToken,
		&user.ResetToken,
		&user.ResetTokenExpires,
		&user.CountryCode,
		&user.DetectedCurrency,
		&user.LastLoginAt,
		&user.CreatedAt,
		&user.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, models.ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user by handle: %w", err)
	}

	return &user, nil
}

// GetUserByEmailOrHandle retrieves a user by email OR handle (for login flexibility)
func (s *PostgresStore) GetUserByEmailOrHandle(ctx context.Context, identifier string) (*models.User, error) {
	query := `
		SELECT id, email, password_hash, api_key, handle, plan, active, email_verified, 
		       verification_token, reset_token, reset_token_expires, country_code, 
		       detected_currency, last_login_at, created_at, updated_at
		FROM users
		WHERE email = $1 OR handle = $1
	`

	var user models.User
	err := s.db.QueryRowContext(ctx, query, identifier).Scan(
		&user.ID,
		&user.Email,
		&user.PasswordHash,
		&user.APIKey,
		&user.Handle,
		&user.Preset,
		&user.Active,
		&user.EmailVerified,
		&user.VerificationToken,
		&user.ResetToken,
		&user.ResetTokenExpires,
		&user.CountryCode,
		&user.DetectedCurrency,
		&user.LastLoginAt,
		&user.CreatedAt,
		&user.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, models.ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user by email or handle: %w", err)
	}

	return &user, nil
}

// CheckHandleAvailability checks if a handle is available for use
// Returns true if available, false if taken
func (s *PostgresStore) CheckHandleAvailability(ctx context.Context, handle string) (bool, error) {
	// Check both users table and reserved_handles table
	query := `
		SELECT EXISTS(
			SELECT 1 FROM users WHERE handle = $1
			UNION ALL
			SELECT 1 FROM reserved_handles WHERE handle = $1
		)
	`

	var exists bool
	err := s.db.QueryRowContext(ctx, query, handle).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("failed to check handle availability: %w", err)
	}

	// Return true if NOT exists (available)
	return !exists, nil
}

// IsReservedHandle checks if a handle is reserved and cannot be used
func (s *PostgresStore) IsReservedHandle(ctx context.Context, handle string) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM reserved_handles WHERE handle = $1)`

	var reserved bool
	err := s.db.QueryRowContext(ctx, query, handle).Scan(&reserved)
	if err != nil {
		return false, fmt.Errorf("failed to check reserved handle: %w", err)
	}

	return reserved, nil
}

// UpdateUserHandle updates a user's handle (rare operation)
func (s *PostgresStore) UpdateUserHandle(ctx context.Context, userID uuid.UUID, newHandle string) error {
	// Check if handle is reserved before availability lookup so we preserve the
	// more specific error for system handles.
	reserved, err := s.IsReservedHandle(ctx, newHandle)
	if err != nil {
		return err
	}
	if reserved {
		return models.ErrHandleReserved
	}

	// First check if new handle is available
	available, err := s.CheckHandleAvailability(ctx, newHandle)
	if err != nil {
		return err
	}
	if !available {
		return models.ErrHandleTaken
	}

	// Update handle
	query := `
		UPDATE users
		SET handle = $1, updated_at = NOW()
		WHERE id = $2
	`

	result, err := s.db.ExecContext(ctx, query, newHandle, userID)
	if err != nil {
		return fmt.Errorf("failed to update handle: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return models.ErrUserNotFound
	}

	logger.Info("User handle updated",
		zap.String("user_id", userID.String()),
		zap.String("new_handle", newHandle),
	)

	return nil
}
