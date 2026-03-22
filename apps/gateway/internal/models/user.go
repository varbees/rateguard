package models

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	ErrUserNotFound       = errors.New("user not found")
	ErrInvalidAPIKey      = errors.New("invalid API key")
	ErrUserAlreadyExists  = errors.New("user already exists")
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrInvalidResetToken  = errors.New("invalid or expired reset token")
	ErrEmailNotVerified   = errors.New("email not verified")
)

// User represents a RateGuard customer
type User struct {
	ID                       uuid.UUID  `json:"id" db:"id"`
	Email                    string     `json:"email" db:"email"`
	PasswordHash             string     `json:"-" db:"password_hash"` // Never expose in JSON
	APIKey                   string     `json:"api_key" db:"api_key"`
	Handle                   string     `json:"handle" db:"handle"`         // User-friendly URL handle (e.g., "johndoe")
	Preset                   string     `json:"preset,omitempty" db:"plan"` // Canonical policy preset persisted in the users table.
	Active                   bool       `json:"active" db:"active"`
	EmailVerified            bool       `json:"email_verified" db:"email_verified"`
	VerificationToken        *string    `json:"-" db:"verification_token"`
	VerificationTokenExpires *time.Time `json:"-" db:"verification_token_expires"`
	ResetToken               *string    `json:"-" db:"reset_token"`
	ResetTokenExpires        *time.Time `json:"-" db:"reset_token_expires"`
	CountryCode              *string    `json:"country_code,omitempty" db:"country_code"`           // ISO 3166-1 alpha-2
	DetectedCurrency         *string    `json:"detected_currency,omitempty" db:"detected_currency"` // INR, USD, etc.
	LastLoginAt              *time.Time `json:"last_login_at,omitempty" db:"last_login_at"`
	CreatedAt                time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt                time.Time  `json:"updated_at" db:"updated_at"`
}

// RefreshToken represents a JWT refresh token for rotation
type RefreshToken struct {
	ID        uuid.UUID `json:"id" db:"id"`
	UserID    uuid.UUID `json:"user_id" db:"user_id"`
	TokenHash string    `json:"-" db:"token_hash"`
	FamilyID  uuid.UUID `json:"family_id" db:"family_id"`
	IsRevoked bool      `json:"is_revoked" db:"is_revoked"`
	ExpiresAt time.Time `json:"expires_at" db:"expires_at"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	Used      bool      `json:"used" db:"used"`
}

// CreateUserRequest represents user registration payload.
type CreateUserRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=8"`
	Handle   string `json:"handle" validate:"required,min=3,max=30,alphanum_hyphen_underscore"`
	Preset   string `json:"preset,omitempty" validate:"omitempty,oneof=dev standard high-throughput llm-heavy strict-upstream-protection free starter pro business enterprise"`
}

// LoginRequest represents user login payload
type LoginRequest struct {
	Identifier string `json:"identifier" validate:"required"`
	Email      string `json:"email,omitempty" validate:"omitempty,email"`
	Password   string `json:"password" validate:"required"`
}

// LoginResponse represents successful login response
type LoginResponse struct {
	User   *User  `json:"user"`
	APIKey string `json:"api_key"`
	Token  string `json:"token,omitempty"` // JWT token if implemented later
}

// PasswordResetRequestPayload represents password reset request
type PasswordResetRequestPayload struct {
	Email string `json:"email" validate:"required,email"`
}

// PasswordResetPayload represents password reset with token
type PasswordResetPayload struct {
	Token       string `json:"token" validate:"required"`
	NewPassword string `json:"new_password" validate:"required,min=8"`
}

// UpdateUserRequest represents user update payload
type UpdateUserRequest struct {
	Preset *string `json:"preset,omitempty" validate:"omitempty,oneof=dev standard high-throughput llm-heavy strict-upstream-protection free starter pro business enterprise"`
	Active *bool   `json:"active,omitempty"`
}

// UpdateHandleRequest represents handle update payload
type UpdateHandleRequest struct {
	Handle string `json:"handle" validate:"required,min=3,max=30,alphanum_hyphen_underscore"`
}
