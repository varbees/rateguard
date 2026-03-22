package models

import (
	"time"

	"github.com/google/uuid"
)

// APITemplate represents a marketplace template for instant API integrations
type APITemplate struct {
	ID                 uuid.UUID         `json:"id" db:"id"`
	Provider           string            `json:"provider" db:"provider"`               // URL-safe provider name (e.g., "openai", "stripe")
	DisplayName        string            `json:"display_name" db:"display_name"`       // Human-readable name (e.g., "OpenAI GPT")
	Description        string            `json:"description" db:"description"`         // Template description
	IconURL            *string           `json:"icon_url,omitempty" db:"icon_url"`     // Optional icon/logo URL
	Category           string            `json:"category" db:"category"`               // Category ("ai", "payments", etc.)
	TargetURL          string            `json:"target_url" db:"target_url"`           // Base API URL
	AuthType           string            `json:"auth_type" db:"auth_type"`             // "bearer", "api_key", "custom"
	RequiredHeaders    map[string]string `json:"required_headers" db:"required_headers"` // Default headers (JSONB)
	RateLimitPerSecond int               `json:"rate_limit_per_second" db:"rate_limit_per_second"`
	BurstSize          int               `json:"burst_size" db:"burst_size"`
	PopularityScore    int               `json:"popularity_score" db:"popularity_score"` // For sorting
	IsActive           bool              `json:"is_active" db:"is_active"`            // Enable/disable
	CreatedAt          time.Time         `json:"created_at" db:"created_at"`
	UpdatedAt          time.Time         `json:"updated_at" db:"updated_at"`
}

// CreateTemplateRequest represents admin template creation payload
type CreateTemplateRequest struct {
	Provider           string            `json:"provider" validate:"required,min=3,max=100,alphanum_hyphen_underscore"`
	DisplayName        string            `json:"display_name" validate:"required,min=1,max=255"`
	Description        string            `json:"description" validate:"omitempty,max=1000"`
	IconURL            *string           `json:"icon_url,omitempty" validate:"omitempty,url"`
	Category           string            `json:"category" validate:"required,oneof=ai payments communication developer analytics other"`
	TargetURL          string            `json:"target_url" validate:"required,url"`
	AuthType           string            `json:"auth_type" validate:"required,oneof=bearer api_key custom"`
	RequiredHeaders    map[string]string `json:"required_headers,omitempty"`
	RateLimitPerSecond int               `json:"rate_limit_per_second" validate:"min=1,max=1000"`
	BurstSize          int               `json:"burst_size" validate:"min=1,max=1000"`
}

// UpdateTemplateRequest represents admin template update payload
type UpdateTemplateRequest struct {
	DisplayName        *string            `json:"display_name,omitempty" validate:"omitempty,min=1,max=255"`
	Description        *string            `json:"description,omitempty" validate:"omitempty,max=1000"`
	IconURL            *string            `json:"icon_url,omitempty" validate:"omitempty,url"`
	Category           *string            `json:"category,omitempty" validate:"omitempty,oneof=ai payments communication developer analytics other"`
	TargetURL          *string            `json:"target_url,omitempty" validate:"omitempty,url"`
	AuthType           *string            `json:"auth_type,omitempty" validate:"omitempty,oneof=bearer api_key custom"`
	RequiredHeaders    map[string]string  `json:"required_headers,omitempty"`
	RateLimitPerSecond *int               `json:"rate_limit_per_second,omitempty" validate:"omitempty,min=1,max=1000"`
	BurstSize          *int               `json:"burst_size,omitempty" validate:"omitempty,min=1,max=1000"`
	PopularityScore    *int               `json:"popularity_score,omitempty"`
	IsActive           *bool              `json:"is_active,omitempty"`
}

// TemplateListResponse represents a list of marketplace templates
type TemplateListResponse struct {
	Templates []APITemplate `json:"templates"`
	Total     int           `json:"total"`
	Category  string        `json:"category,omitempty"` // Filter applied
	Timestamp time.Time     `json:"timestamp"`
}

// ReservedHandle represents a handle that cannot be claimed by users
type ReservedHandle struct {
	Handle     string    `json:"handle" db:"handle"`
	Reason     string    `json:"reason" db:"reason"`
	ReservedAt time.Time `json:"reserved_at" db:"reserved_at"`
}

// TemplateUsage tracks user usage of marketplace templates
type TemplateUsage struct {
	ID               int64     `json:"id" db:"id"`
	UserID           uuid.UUID `json:"user_id" db:"user_id"`
	TemplateProvider string    `json:"template_provider" db:"template_provider"`
	Requests         int64     `json:"requests" db:"requests"`
	UsageDate        time.Time `json:"usage_date" db:"usage_date"`
}
