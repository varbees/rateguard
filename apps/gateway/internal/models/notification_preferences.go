package models

import (
	"time"

	"github.com/google/uuid"
)

// NotificationPreferences represents user notification settings
type NotificationPreferences struct {
	ID                    uuid.UUID `json:"id" db:"id"`
	UserID                uuid.UUID `json:"user_id" db:"user_id"`
	EmailAlerts           bool      `json:"email_alerts" db:"email_alerts"`
	UsageThresholdPercent int       `json:"usage_threshold_percent" db:"usage_threshold_percent"`
	ErrorAlerts           bool      `json:"error_alerts" db:"error_alerts"`
	WeeklyReport          bool      `json:"weekly_report" db:"weekly_report"`
	CreatedAt             time.Time `json:"created_at" db:"created_at"`
	UpdatedAt             time.Time `json:"updated_at" db:"updated_at"`
}
