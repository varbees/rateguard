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

// GetUserByEmail retrieves a user by email address
func (s *PostgresStore) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	query := `
		SELECT id, email, password_hash, api_key, plan, active, email_verified, 
		       verification_token, reset_token, reset_token_expires, country_code, 
		       detected_currency, last_login_at, created_at, updated_at
		FROM users
		WHERE email = $1
	`

	var user models.User
	err := s.db.QueryRowContext(ctx, query, email).Scan(
		&user.ID,
		&user.Email,
		&user.PasswordHash,
		&user.APIKey,
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
		return nil, fmt.Errorf("failed to get user by email: %w", err)
	}

	return &user, nil
}

// GetUserByResetToken retrieves a user by password reset token
func (s *PostgresStore) GetUserByResetToken(ctx context.Context, token string) (*models.User, error) {
	query := `
		SELECT id, email, password_hash, api_key, plan, active, email_verified,
		       verification_token, reset_token, reset_token_expires, country_code,
		       detected_currency, last_login_at, created_at, updated_at
		FROM users
		WHERE reset_token = $1
	`

	var user models.User
	err := s.db.QueryRowContext(ctx, query, token).Scan(
		&user.ID,
		&user.Email,
		&user.PasswordHash,
		&user.APIKey,
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
		return nil, models.ErrInvalidResetToken
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user by reset token: %w", err)
	}

	return &user, nil
}

// GetUserByVerificationToken retrieves a user by verification token
func (s *PostgresStore) GetUserByVerificationToken(ctx context.Context, token string) (*models.User, error) {
	query := `
		SELECT id, email, password_hash, api_key, handle, plan, active, email_verified,
		       verification_token, verification_token_expires, reset_token, reset_token_expires, 
		       country_code, detected_currency, last_login_at, created_at, updated_at
		FROM users
		WHERE verification_token = $1
	`

	var user models.User
	err := s.db.QueryRowContext(ctx, query, token).Scan(
		&user.ID,
		&user.Email,
		&user.PasswordHash,
		&user.APIKey,
		&user.Handle,
		&user.Preset,
		&user.Active,
		&user.EmailVerified,
		&user.VerificationToken,
		&user.VerificationTokenExpires,
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
		return nil, fmt.Errorf("failed to get user by verification token: %w", err)
	}

	return &user, nil
}

// UpdateVerificationToken updates the verification token for a user
func (s *PostgresStore) UpdateVerificationToken(ctx context.Context, userID uuid.UUID, token string, expiresAt time.Time) error {
	query := `
		UPDATE users
		SET verification_token = $1,
		    verification_token_expires = $2,
		    updated_at = $3
		WHERE id = $4
	`

	_, err := s.db.ExecContext(ctx, query, token, expiresAt, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to update verification token: %w", err)
	}

	logger.Info("Verification token updated",
		zap.String("user_id", userID.String()),
		zap.Time("expires_at", expiresAt),
	)
	return nil
}

// UpdateUserLastLogin updates the last login timestamp for a user
func (s *PostgresStore) UpdateUserLastLogin(ctx context.Context, userID uuid.UUID) error {
	query := `
		UPDATE users
		SET last_login_at = $1,
		    updated_at = $1
		WHERE id = $2
	`

	_, err := s.db.ExecContext(ctx, query, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to update last login: %w", err)
	}

	logger.Debug("Updated last login", zap.String("user_id", userID.String()))
	return nil
}

// SetPasswordResetToken sets a password reset token for a user
func (s *PostgresStore) SetPasswordResetToken(ctx context.Context, userID uuid.UUID, token string, expiresAt time.Time) error {
	query := `
		UPDATE users
		SET reset_token = $1,
		    reset_token_expires = $2,
		    updated_at = $3
		WHERE id = $4
	`

	_, err := s.db.ExecContext(ctx, query, token, expiresAt, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to set reset token: %w", err)
	}

	logger.Info("Password reset token set",
		zap.String("user_id", userID.String()),
		zap.Time("expires_at", expiresAt),
	)
	return nil
}

// ResetPassword updates user password and clears reset token
func (s *PostgresStore) ResetPassword(ctx context.Context, userID uuid.UUID, passwordHash string) error {
	query := `
		UPDATE users
		SET password_hash = $1,
		    reset_token = NULL,
		    reset_token_expires = NULL,
		    updated_at = $2
		WHERE id = $3
	`

	_, err := s.db.ExecContext(ctx, query, passwordHash, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to reset password: %w", err)
	}

	logger.Info("Password reset successfully", zap.String("user_id", userID.String()))
	return nil
}

// VerifyEmail marks user email as verified
func (s *PostgresStore) VerifyEmail(ctx context.Context, userID uuid.UUID) error {
	query := `
		UPDATE users
		SET email_verified = true,
		    verification_token = NULL,
		    updated_at = $1
		WHERE id = $2
	`

	_, err := s.db.ExecContext(ctx, query, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to verify email: %w", err)
	}

	logger.Info("Email verified", zap.String("user_id", userID.String()))
	return nil
}

// UpdateUserGeoData updates user's country code and detected currency
// Non-critical operation - logs errors but doesn't fail the calling operation
func (s *PostgresStore) UpdateUserGeoData(ctx context.Context, userID uuid.UUID, countryCode, currency string) error {
	query := `
		UPDATE users
		SET country_code = $1,
		    detected_currency = $2,
		    updated_at = $3
		WHERE id = $4
	`

	_, err := s.db.ExecContext(ctx, query, countryCode, currency, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to update user geo data: %w", err)
	}

	logger.Debug("User geo data updated",
		zap.String("user_id", userID.String()),
		zap.String("country_code", countryCode),
		zap.String("currency", currency),
	)
	return nil
}

// --- Refresh Token Operations ---

// StoreRefreshToken stores a new refresh token
func (s *PostgresStore) StoreRefreshToken(ctx context.Context, token *models.RefreshToken) error {
	query := `
		INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, is_revoked, expires_at, created_at, used)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`

	_, err := s.db.ExecContext(
		ctx,
		query,
		token.ID,
		token.UserID,
		token.TokenHash,
		token.FamilyID,
		token.IsRevoked,
		token.ExpiresAt,
		token.CreatedAt,
		token.Used,
	)

	if err != nil {
		return fmt.Errorf("failed to store refresh token: %w", err)
	}

	return nil
}

// GetRefreshToken retrieves a refresh token by its hash
func (s *PostgresStore) GetRefreshToken(ctx context.Context, tokenHash string) (*models.RefreshToken, error) {
	query := `
		SELECT id, user_id, token_hash, family_id, is_revoked, expires_at, created_at, used
		FROM refresh_tokens
		WHERE token_hash = $1
	`

	var token models.RefreshToken
	err := s.db.QueryRowContext(ctx, query, tokenHash).Scan(
		&token.ID,
		&token.UserID,
		&token.TokenHash,
		&token.FamilyID,
		&token.IsRevoked,
		&token.ExpiresAt,
		&token.CreatedAt,
		&token.Used,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("refresh token not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get refresh token: %w", err)
	}

	return &token, nil
}

// RevokeRefreshTokenFamily revokes all tokens in a family (used when theft detected)
func (s *PostgresStore) RevokeRefreshTokenFamily(ctx context.Context, familyID uuid.UUID) error {
	query := `
		UPDATE refresh_tokens
		SET is_revoked = true
		WHERE family_id = $1
	`

	_, err := s.db.ExecContext(ctx, query, familyID)
	if err != nil {
		return fmt.Errorf("failed to revoke token family: %w", err)
	}

	logger.Warn("Refresh token family revoked", zap.String("family_id", familyID.String()))
	return nil
}

// MarkRefreshTokenUsed marks a refresh token as used (rotation)
func (s *PostgresStore) MarkRefreshTokenUsed(ctx context.Context, id uuid.UUID) error {
	query := `
		UPDATE refresh_tokens
		SET used = true
		WHERE id = $1
	`

	_, err := s.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to mark token as used: %w", err)
	}

	return nil
}
