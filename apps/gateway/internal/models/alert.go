package models

import (
	"time"

	"github.com/google/uuid"
)

// AlertType represents the severity level of an alert
type AlertType string

const (
	AlertTypeCritical AlertType = "critical" // 429s happening now
	AlertTypeWarning  AlertType = "warning"  // Approaching limit
	AlertTypeInfo     AlertType = "info"     // New patterns detected
)

// Alert represents a real-time dashboard alert
type Alert struct {
	ID          string    `json:"id"`
	Type        AlertType `json:"type"`
	Title       string    `json:"title"`
	Message     string    `json:"message"`
	APIID       uuid.UUID `json:"api_id,omitempty"`
	APIName     string    `json:"api_name,omitempty"`
	Metric      string    `json:"metric,omitempty"`      // e.g., "429_rate", "usage_percent"
	MetricValue float64   `json:"metric_value,omitempty"` // e.g., 0.85 for 85%
	DetectedAt  time.Time `json:"detected_at"`
	Dismissible bool      `json:"dismissible"`
}

// AlertsResponse represents the response for the alerts endpoint
type AlertsResponse struct {
	Alerts []Alert `json:"alerts"`
	Count  int     `json:"count"`
}
