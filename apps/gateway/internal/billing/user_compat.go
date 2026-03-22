//go:build commercial

package billing

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/models"
)

// loadBillingUser loads the user record needed by commercial billing flows.
// It reads the stored users.plan column into the canonical preset field.
func loadBillingUser(ctx context.Context, db *sql.DB, userID uuid.UUID) (*models.User, error) {
	query := `SELECT id, email, password_hash, api_key, plan FROM users WHERE id = $1`

	var user models.User
	if err := db.QueryRowContext(ctx, query, userID).Scan(
		&user.ID,
		&user.Email,
		&user.PasswordHash,
		&user.APIKey,
		&user.Preset,
	); err != nil {
		return nil, fmt.Errorf("failed to fetch user: %w", err)
	}

	return &user, nil
}

// persistUserPreset writes the canonical preset into the stored users.plan column.
func persistUserPreset(ctx context.Context, db *sql.DB, userID uuid.UUID, preset string) error {
	query := `
		UPDATE users
		SET plan = $1,
		    updated_at = NOW()
		WHERE id = $2
	`

	if _, err := db.ExecContext(ctx, query, preset, userID); err != nil {
		return fmt.Errorf("failed to update user preset: %w", err)
	}

	return nil
}
