package models

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

var (
	ErrAPIConfigNotFound      = errors.New("API configuration not found")
	ErrAPIConfigAlreadyExists = errors.New("API configuration already exists")
	ErrMaxAPIsReached         = errors.New("maximum number of APIs reached for plan")
	ErrInvalidAPIName         = errors.New("invalid API name: must contain only lowercase letters, numbers, hyphens, and underscores")
	ErrAPINameTooShort        = errors.New("API name too short: minimum 2 characters")
	ErrAPINameTooLong         = errors.New("API name too long: maximum 64 characters")
)

// Regular expression for validating slugified API names
// Only lowercase letters, numbers, hyphens, and underscores
var apiNameRegex = regexp.MustCompile(`^[a-z0-9_-]+$`)

// APIConfig represents a user's configured API to proxy
type APIConfig struct {
	ID                  uuid.UUID         `json:"id" db:"id"`
	UserID              uuid.UUID         `json:"user_id" db:"user_id"`
	Name                string            `json:"name" db:"name"`
	Slug                string            `json:"slug" db:"slug"` // URL-safe project slug (unique per user)
	TargetURL           string            `json:"target_url" db:"target_url"`
	ProxyURL            string            `json:"proxy_url" db:"-" ` // Computed field, not stored in DB
	RateLimitPerSecond  int               `json:"rate_limit_per_second" db:"rate_limit_per_second"`
	BurstSize           int               `json:"burst_size" db:"burst_size"`
	RateLimitPerHour    int               `json:"rate_limit_per_hour" db:"rate_limit_per_hour"`   // Hourly limit
	RateLimitPerDay     int               `json:"rate_limit_per_day" db:"rate_limit_per_day"`     // Daily limit
	RateLimitPerMonth   int               `json:"rate_limit_per_month" db:"rate_limit_per_month"` // Monthly limit
	Enabled             bool              `json:"enabled" db:"enabled"`
	AllowedOrigins      []string          `json:"allowed_origins,omitempty" db:"allowed_origins"`       // CORS whitelist, stored as JSONB
	CustomHeaders       map[string]string `json:"custom_headers,omitempty" db:"custom_headers"`         // Stored as JSONB
	AuthType            string            `json:"auth_type" db:"auth_type"`                             // none, bearer, api_key, basic
	AuthCredentials     map[string]string `json:"auth_credentials,omitempty" db:"auth_credentials"`     // Stored encrypted as JSONB
	TimeoutSeconds      int               `json:"timeout_seconds" db:"timeout_seconds"`
	RetryAttempts       int               `json:"retry_attempts" db:"retry_attempts"`
	// LLM-specific fields (added in migration 021)
	Provider            *string           `json:"provider,omitempty" db:"provider"`       // "openai", "anthropic", "groq", "cohere"
	Model               *string           `json:"model,omitempty" db:"model"`             // "gpt-4", "claude-3-opus", etc.
	IsLLMAPI            bool              `json:"is_llm_api" db:"is_llm_api"`             // Whether this API requires token tracking
	PricingModel        string            `json:"pricing_model" db:"pricing_model"`       // "request" or "token"
	CreatedAt           time.Time         `json:"created_at" db:"created_at"`
	UpdatedAt           time.Time         `json:"updated_at" db:"updated_at"`
}

// SetProxyURL sets the computed proxy URL field based on the API name
func (c *APIConfig) SetProxyURL(baseURL string) {
	// Format: https://rateguard.domain/proxy/:api_name
	c.ProxyURL = baseURL + "/proxy/" + c.Name
}

// SlugifyAPIName converts a user-friendly name to a URL-safe slug
// Examples:
//   "My GitHub API" -> "my-github-api"
//   "OpenAI GPT-4" -> "openai-gpt-4"
//   "Stripe Payments!!!" -> "stripe-payments"
func SlugifyAPIName(name string) string {
	// Convert to lowercase
	slug := strings.ToLower(name)
	
	// Replace spaces with hyphens
	slug = strings.ReplaceAll(slug, " ", "-")
	
	// Remove all characters except a-z, 0-9, hyphens, and underscores
	slug = regexp.MustCompile(`[^a-z0-9_-]+`).ReplaceAllString(slug, "")
	
	// Replace multiple consecutive hyphens with a single hyphen
	slug = regexp.MustCompile(`-+`).ReplaceAllString(slug, "-")
	
	// Trim hyphens from start and end
	slug = strings.Trim(slug, "-")
	
	return slug
}

// ValidateAPIName checks if an API name is valid (already slugified)
func ValidateAPIName(name string) error {
	if len(name) < 2 {
		return ErrAPINameTooShort
	}
	if len(name) > 64 {
		return ErrAPINameTooLong
	}
	if !apiNameRegex.MatchString(name) {
		return ErrInvalidAPIName
	}
	return nil
}

// NormalizeAndValidateAPIName slugifies and validates an API name
// Returns the normalized name and any validation error
func NormalizeAndValidateAPIName(name string) (string, error) {
	slug := SlugifyAPIName(name)
	if err := ValidateAPIName(slug); err != nil {
		return "", err
	}
	return slug, nil
}

// ValidateAllowedOrigins checks if the list of origins is valid
// Rules:
// 1. Max 10 origins
// 2. No wildcards (*) except for development (localhost)
// 3. Must be valid URLs (http/https)
func ValidateAllowedOrigins(origins []string) error {
	if len(origins) > 10 {
		return errors.New("maximum 10 allowed origins per API")
	}

	for _, origin := range origins {
		// Check for wildcard
		if origin == "*" {
			return errors.New("wildcard origin (*) is not allowed for security reasons. Please specify exact domains")
		}

		// Allow localhost with ports for development
		if strings.HasPrefix(origin, "http://localhost") || strings.HasPrefix(origin, "http://127.0.0.1") {
			continue
		}

		// Must start with http:// or https://
		if !strings.HasPrefix(origin, "http://") && !strings.HasPrefix(origin, "https://") {
			return fmt.Errorf("invalid origin '%s': must start with http:// or https://", origin)
		}
		
		// Basic URL validation (no spaces, etc)
		if strings.Contains(origin, " ") {
			return fmt.Errorf("invalid origin '%s': contains spaces", origin)
		}
	}

	return nil
}


// CreateAPIConfigRequest represents API configuration creation payload
type CreateAPIConfigRequest struct {
	Name               string            `json:"name" validate:"required,min=1,max=255"`
	Slug               string            `json:"slug" validate:"required,min=3,max=30,alphanum_hyphen_underscore"`
	TargetURL          string            `json:"target_url" validate:"required,url"`
	RateLimitPerSecond int               `json:"rate_limit_per_second" validate:"required,min=1,max=10000"`
	BurstSize          int               `json:"burst_size" validate:"required,min=1,max=20000"`
	RateLimitPerHour   int               `json:"rate_limit_per_hour" validate:"omitempty,min=0,max=1000000"` // 0 = unlimited
	RateLimitPerDay    int               `json:"rate_limit_per_day" validate:"omitempty,min=0,max=10000000"` // 0 = unlimited
	RateLimitPerMonth  int               `json:"rate_limit_per_month" validate:"omitempty,min=0,max=100000000"` // 0 = unlimited
	AllowedOrigins     []string          `json:"allowed_origins,omitempty"` // CORS whitelist
	CustomHeaders      map[string]string `json:"custom_headers,omitempty"`
	AuthType           string            `json:"auth_type" validate:"required,oneof=none bearer api_key basic"`
	AuthCredentials    map[string]string `json:"auth_credentials,omitempty"`
	TimeoutSeconds     int               `json:"timeout_seconds" validate:"min=1,max=300"`
	RetryAttempts      int               `json:"retry_attempts" validate:"min=0,max=5"`
}

// UpdateAPIConfigRequest represents API configuration update payload
type UpdateAPIConfigRequest struct {
	Name               *string            `json:"name,omitempty" validate:"omitempty,min=1,max=255"`
	Slug               *string            `json:"slug,omitempty" validate:"omitempty,min=3,max=30,alphanum_hyphen_underscore"`
	TargetURL          *string            `json:"target_url,omitempty" validate:"omitempty,url"`
	RateLimitPerSecond *int               `json:"rate_limit_per_second,omitempty" validate:"omitempty,min=1,max=10000"`
	BurstSize          *int               `json:"burst_size,omitempty" validate:"omitempty,min=1,max=20000"`
	RateLimitPerHour   *int               `json:"rate_limit_per_hour,omitempty" validate:"omitempty,min=0,max=1000000"`
	RateLimitPerDay    *int               `json:"rate_limit_per_day,omitempty" validate:"omitempty,min=0,max=10000000"`
	RateLimitPerMonth  *int               `json:"rate_limit_per_month,omitempty" validate:"omitempty,min=0,max=100000000"`
	Enabled            *bool              `json:"enabled,omitempty"`
	AllowedOrigins     []string           `json:"allowed_origins,omitempty"`
	CustomHeaders      map[string]string  `json:"custom_headers,omitempty"`
	AuthType           *string            `json:"auth_type,omitempty" validate:"omitempty,oneof=none bearer api_key basic"`
	AuthCredentials    map[string]string  `json:"auth_credentials,omitempty"`
	TimeoutSeconds     *int               `json:"timeout_seconds,omitempty" validate:"omitempty,min=1,max=300"`
	RetryAttempts      *int               `json:"retry_attempts,omitempty" validate:"omitempty,min=0,max=5"`
}

// APIConfigListResponse represents a list of API configurations
type APIConfigListResponse struct {
	Configs   []APIConfig `json:"configs"`
	Total     int         `json:"total"`
	Page      int         `json:"page"`
	PageSize  int         `json:"page_size"`
	Timestamp time.Time   `json:"timestamp"`
}
