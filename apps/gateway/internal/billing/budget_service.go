//go:build commercial

package billing

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// BudgetConfig represents user budget configuration
type BudgetConfig struct {
	ID                 uuid.UUID `json:"id" db:"id"`
	UserID             uuid.UUID `json:"user_id" db:"user_id"`
	MonthlyBudgetCents int       `json:"monthly_budget_cents" db:"monthly_budget_cents"`
	AlertThresholdPct  int       `json:"alert_threshold_pct" db:"alert_threshold_pct"`
	HardLimitPct       int       `json:"hard_limit_pct" db:"hard_limit_pct"`
	NotifyEmail        bool      `json:"notify_email" db:"notify_email"`
	NotifyWebhook      bool      `json:"notify_webhook" db:"notify_webhook"`
	WebhookURL         *string   `json:"webhook_url,omitempty" db:"webhook_url"`
	Enabled            bool      `json:"enabled" db:"enabled"`
	CreatedAt          time.Time `json:"created_at" db:"created_at"`
	UpdatedAt          time.Time `json:"updated_at" db:"updated_at"`
}

// BudgetAlert represents a budget alert
type BudgetAlert struct {
	ID                uuid.UUID                `json:"id" db:"id"`
	UserID            uuid.UUID                `json:"user_id" db:"user_id"`
	BudgetConfigID    uuid.UUID                `json:"budget_config_id" db:"budget_config_id"`
	AlertType         string                   `json:"alert_type" db:"alert_type"`
	ThresholdPct      int                      `json:"threshold_pct" db:"threshold_pct"`
	CurrentSpendCents int                      `json:"current_spend_cents" db:"current_spend_cents"`
	BudgetCents       int                      `json:"budget_cents" db:"budget_cents"`
	Suggestions       []OptimizationSuggestion `json:"suggestions,omitempty"`
	Acknowledged      bool                     `json:"acknowledged" db:"acknowledged"`
	AcknowledgedAt    *time.Time               `json:"acknowledged_at,omitempty" db:"acknowledged_at"`
	CreatedAt         time.Time                `json:"created_at" db:"created_at"`
}

// OptimizationSuggestion represents a cost optimization suggestion
type OptimizationSuggestion struct {
	Type          string  `json:"type"` // "model_switch", "rate_limit", "cache"
	CurrentCost   float64 `json:"current_cost"`
	ProjectedCost float64 `json:"projected_cost"`
	Savings       float64 `json:"savings"`
	Description   string  `json:"description"`
}

// BudgetService handles budget management
type BudgetService struct {
	db     *sql.DB
	logger *zap.Logger
}

// NewBudgetService creates a new budget service
func NewBudgetService(db *sql.DB, logger *zap.Logger) *BudgetService {
	return &BudgetService{
		db:     db,
		logger: logger,
	}
}

// CreateBudgetConfig creates or updates a budget configuration
func (s *BudgetService) CreateBudgetConfig(ctx context.Context, config BudgetConfig) (*BudgetConfig, error) {
	query := `
		INSERT INTO budget_configs (
			id, user_id, monthly_budget_cents, alert_threshold_pct, hard_limit_pct,
			notify_email, notify_webhook, webhook_url, enabled, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			monthly_budget_cents = EXCLUDED.monthly_budget_cents,
			alert_threshold_pct = EXCLUDED.alert_threshold_pct,
			hard_limit_pct = EXCLUDED.hard_limit_pct,
			notify_email = EXCLUDED.notify_email,
			notify_webhook = EXCLUDED.notify_webhook,
			webhook_url = EXCLUDED.webhook_url,
			enabled = EXCLUDED.enabled,
			updated_at = NOW()
		RETURNING id, user_id, monthly_budget_cents, alert_threshold_pct, hard_limit_pct,
				  notify_email, notify_webhook, webhook_url, enabled, created_at, updated_at
	`

	if config.ID == uuid.Nil {
		config.ID = uuid.New()
	}

	var result BudgetConfig
	err := s.db.QueryRowContext(
		ctx, query,
		config.ID,
		config.UserID,
		config.MonthlyBudgetCents,
		config.AlertThresholdPct,
		config.HardLimitPct,
		config.NotifyEmail,
		config.NotifyWebhook,
		config.WebhookURL,
		config.Enabled,
	).Scan(
		&result.ID,
		&result.UserID,
		&result.MonthlyBudgetCents,
		&result.AlertThresholdPct,
		&result.HardLimitPct,
		&result.NotifyEmail,
		&result.NotifyWebhook,
		&result.WebhookURL,
		&result.Enabled,
		&result.CreatedAt,
		&result.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to create budget config: %w", err)
	}

	return &result, nil
}

// GetBudgetConfig retrieves user's budget configuration
func (s *BudgetService) GetBudgetConfig(ctx context.Context, userID uuid.UUID) (*BudgetConfig, error) {
	query := `
		SELECT id, user_id, monthly_budget_cents, alert_threshold_pct, hard_limit_pct,
			   notify_email, notify_webhook, webhook_url, enabled, created_at, updated_at
		FROM budget_configs
		WHERE user_id = $1
	`

	var config BudgetConfig
	err := s.db.QueryRowContext(ctx, query, userID).Scan(
		&config.ID,
		&config.UserID,
		&config.MonthlyBudgetCents,
		&config.AlertThresholdPct,
		&config.HardLimitPct,
		&config.NotifyEmail,
		&config.NotifyWebhook,
		&config.WebhookURL,
		&config.Enabled,
		&config.CreatedAt,
		&config.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get budget config: %w", err)
	}

	return &config, nil
}

// CreateAlert creates a new budget alert
func (s *BudgetService) CreateAlert(ctx context.Context, alert BudgetAlert) error {
	// Marshal suggestions to JSON
	suggestionsJSON, err := json.Marshal(alert.Suggestions)
	if err != nil {
		return fmt.Errorf("failed to marshal suggestions: %w", err)
	}

	query := `
		INSERT INTO budget_alerts (
			id, user_id, budget_config_id, alert_type, threshold_pct,
			current_spend_cents, budget_cents, suggestions, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
	`

	if alert.ID == uuid.Nil {
		alert.ID = uuid.New()
	}

	_, err = s.db.ExecContext(
		ctx, query,
		alert.ID,
		alert.UserID,
		alert.BudgetConfigID,
		alert.AlertType,
		alert.ThresholdPct,
		alert.CurrentSpendCents,
		alert.BudgetCents,
		suggestionsJSON,
	)

	if err != nil {
		return fmt.Errorf("failed to create alert: %w", err)
	}

	s.logger.Info("Budget alert created",
		zap.String("user_id", alert.UserID.String()),
		zap.String("type", alert.AlertType),
		zap.Int("threshold_pct", alert.ThresholdPct),
	)

	return nil
}

// GetAlerts retrieves user's budget alerts
func (s *BudgetService) GetAlerts(ctx context.Context, userID uuid.UUID, includeAcknowledged bool) ([]BudgetAlert, error) {
	query := `
		SELECT id, user_id, budget_config_id, alert_type, threshold_pct,
			   current_spend_cents, budget_cents, suggestions, acknowledged,
			   acknowledged_at, created_at
		FROM budget_alerts
		WHERE user_id = $1
	`

	if !includeAcknowledged {
		query += " AND acknowledged = FALSE"
	}

	query += " ORDER BY created_at DESC LIMIT 100"

	rows, err := s.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get alerts: %w", err)
	}
	defer rows.Close()

	var alerts []BudgetAlert
	for rows.Next() {
		var alert BudgetAlert
		var suggestionsJSON []byte

		err := rows.Scan(
			&alert.ID,
			&alert.UserID,
			&alert.BudgetConfigID,
			&alert.AlertType,
			&alert.ThresholdPct,
			&alert.CurrentSpendCents,
			&alert.BudgetCents,
			&suggestionsJSON,
			&alert.Acknowledged,
			&alert.AcknowledgedAt,
			&alert.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan alert: %w", err)
		}

		// Unmarshal suggestions
		if suggestionsJSON != nil {
			json.Unmarshal(suggestionsJSON, &alert.Suggestions)
		}

		alerts = append(alerts, alert)
	}

	return alerts, nil
}

// AcknowledgeAlert marks an alert as acknowledged
func (s *BudgetService) AcknowledgeAlert(ctx context.Context, alertID uuid.UUID, userID uuid.UUID) error {
	query := `
		UPDATE budget_alerts
		SET acknowledged = TRUE,
			acknowledged_at = NOW()
		WHERE id = $1 AND user_id = $2
	`

	result, err := s.db.ExecContext(ctx, query, alertID, userID)
	if err != nil {
		return fmt.Errorf("failed to acknowledge alert: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("alert not found")
	}

	return nil
}
