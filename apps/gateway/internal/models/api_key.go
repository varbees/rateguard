package models

import (
	"time"

	"github.com/google/uuid"
)

// APIKey represents a user's API authentication key
type APIKey struct {
	ID         uuid.UUID  `json:"id" db:"id"`
	UserID     uuid.UUID  `json:"user_id" db:"user_id"`
	KeyName    string     `json:"key_name" db:"key_name"`
	APIKey     string     `json:"api_key" db:"api_key"`
	CreatedAt  time.Time  `json:"created_at" db:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty" db:"last_used_at"`
	RevokedAt  *time.Time `json:"revoked_at,omitempty" db:"revoked_at"`
}

// IsActive returns true if the key is not revoked
func (k *APIKey) IsActive() bool {
	return k.RevokedAt == nil
}

// MaskedKey returns first 6 and last 4 characters for display
// Example: "rg_abc123...xyz789"
func (k *APIKey) MaskedKey() string {
	if len(k.APIKey) < 10 {
		return "***"
	}
	return k.APIKey[:6] + "..." + k.APIKey[len(k.APIKey)-4:]
}

// APIKeyResponse is returned to frontend (excludes full key except on creation)
type APIKeyResponse struct {
	ID         uuid.UUID  `json:"id"`
	KeyName    string     `json:"key_name"`
	MaskedKey  string     `json:"masked_key"`
	CreatedAt  time.Time  `json:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	RevokedAt  *time.Time `json:"revoked_at,omitempty"`
	IsActive   bool       `json:"is_active"`
}

// ToResponse converts APIKey to APIKeyResponse with masked key
func (k *APIKey) ToResponse() APIKeyResponse {
	return APIKeyResponse{
		ID:         k.ID,
		KeyName:    k.KeyName,
		MaskedKey:  k.MaskedKey(),
		CreatedAt:  k.CreatedAt,
		LastUsedAt: k.LastUsedAt,
		RevokedAt:  k.RevokedAt,
		IsActive:   k.IsActive(),
	}
}
