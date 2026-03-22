package guardrails

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// Config represents cost guardrail configuration.
type Config struct {
	ID                 uuid.UUID  `json:"id" db:"id"`
	UserID             uuid.UUID  `json:"user_id" db:"user_id"`
	MonthlyBudgetCents int        `json:"monthly_budget_cents" db:"monthly_budget_cents"`
	AlertThresholdPct  int        `json:"alert_threshold_pct" db:"alert_threshold_pct"`
	HardLimitPct       int        `json:"hard_limit_pct" db:"hard_limit_pct"`
	NotifyEmail        bool       `json:"notify_email" db:"notify_email"`
	NotifyWebhook      bool       `json:"notify_webhook" db:"notify_webhook"`
	WebhookURL         *string    `json:"webhook_url,omitempty" db:"webhook_url"`
	Enabled            bool       `json:"enabled" db:"enabled"`
	CreatedAt          time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at" db:"updated_at"`
}

// Alert represents a cost guardrail alert.
type Alert struct {
	ID                uuid.UUID               `json:"id" db:"id"`
	UserID            uuid.UUID               `json:"user_id" db:"user_id"`
	GuardrailConfigID uuid.UUID               `json:"guardrail_config_id" db:"budget_config_id"`
	AlertType         string                  `json:"alert_type" db:"alert_type"`
	ThresholdPct      int                     `json:"threshold_pct" db:"threshold_pct"`
	CurrentSpendCents int                     `json:"current_spend_cents" db:"current_spend_cents"`
	BudgetCents       int                     `json:"budget_cents" db:"budget_cents"`
	Suggestions       []OptimizationSuggestion `json:"suggestions,omitempty"`
	Acknowledged      bool                    `json:"acknowledged" db:"acknowledged"`
	AcknowledgedAt    *time.Time              `json:"acknowledged_at,omitempty" db:"acknowledged_at"`
	CreatedAt         time.Time               `json:"created_at" db:"created_at"`
}

// OptimizationSuggestion represents a cost optimization suggestion.
type OptimizationSuggestion struct {
	Type          string  `json:"type"`
	CurrentCost   float64 `json:"current_cost"`
	ProjectedCost float64 `json:"projected_cost"`
	Savings       float64 `json:"savings"`
	Description   string  `json:"description"`
}

// Service handles cost guardrail management.
type Service struct {
	db     *sql.DB
	logger *zap.Logger
}

// NewService creates a new cost guardrail service.
func NewService(db *sql.DB, logger *zap.Logger) *Service {
	return &Service{db: db, logger: logger}
}

// CreateConfig creates or updates a cost guardrail configuration.
func (s *Service) CreateConfig(ctx context.Context, config Config) (*Config, error) {
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

	var result Config
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
		return nil, fmt.Errorf("failed to create cost guardrail config: %w", err)
	}

	return &result, nil
}

// GetConfig retrieves a user's cost guardrail configuration.
func (s *Service) GetConfig(ctx context.Context, userID uuid.UUID) (*Config, error) {
	query := `
		SELECT id, user_id, monthly_budget_cents, alert_threshold_pct, hard_limit_pct,
			   notify_email, notify_webhook, webhook_url, enabled, created_at, updated_at
		FROM budget_configs
		WHERE user_id = $1
	`

	var config Config
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
		return nil, fmt.Errorf("failed to get cost guardrail config: %w", err)
	}

	return &config, nil
}

// CreateAlert creates a new cost guardrail alert.
func (s *Service) CreateAlert(ctx context.Context, alert Alert) error {
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
		alert.GuardrailConfigID,
		alert.AlertType,
		alert.ThresholdPct,
		alert.CurrentSpendCents,
		alert.BudgetCents,
		suggestionsJSON,
	)
	if err != nil {
		return fmt.Errorf("failed to create cost guardrail alert: %w", err)
	}

	s.logger.Info("Cost guardrail alert created",
		zap.String("user_id", alert.UserID.String()),
		zap.String("type", alert.AlertType),
		zap.Int("threshold_pct", alert.ThresholdPct),
	)
	return nil
}

// GetAlerts retrieves a user's cost guardrail alerts.
func (s *Service) GetAlerts(ctx context.Context, userID uuid.UUID, includeAcknowledged bool) ([]Alert, error) {
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

	var alerts []Alert
	for rows.Next() {
		var alert Alert
		var suggestionsJSON []byte
		if err := rows.Scan(
			&alert.ID,
			&alert.UserID,
			&alert.GuardrailConfigID,
			&alert.AlertType,
			&alert.ThresholdPct,
			&alert.CurrentSpendCents,
			&alert.BudgetCents,
			&suggestionsJSON,
			&alert.Acknowledged,
			&alert.AcknowledgedAt,
			&alert.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan alert: %w", err)
		}

		if len(suggestionsJSON) > 0 {
			if err := json.Unmarshal(suggestionsJSON, &alert.Suggestions); err != nil {
				s.logger.Warn("Failed to unmarshal guardrail suggestions", zap.Error(err))
			}
		}
		alerts = append(alerts, alert)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed iterating alerts: %w", err)
	}

	return alerts, nil
}

// AcknowledgeAlert marks a cost guardrail alert as acknowledged.
func (s *Service) AcknowledgeAlert(ctx context.Context, alertID uuid.UUID, userID uuid.UUID) error {
	query := `
		UPDATE budget_alerts
		SET acknowledged = TRUE, acknowledged_at = NOW()
		WHERE id = $1 AND user_id = $2
	`

	result, err := s.db.ExecContext(ctx, query, alertID, userID)
	if err != nil {
		return fmt.Errorf("failed to acknowledge alert: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return sql.ErrNoRows
	}

	return nil
}
