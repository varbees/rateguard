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

// CreateSubscription creates a new subscription
func (s *PostgresStore) CreateSubscription(ctx context.Context, sub *models.Subscription) error {
	query := `
		INSERT INTO subscriptions (
			id, user_id, plan_tier, billing_cycle, amount_minor_units, currency,
			payment_provider, external_subscription_id, external_customer_id,
			status, trial_ends_at, current_period_start, current_period_end,
			created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
		)
	`

	_, err := s.db.ExecContext(
		ctx, query,
		sub.ID, sub.UserID, sub.PlanTier, sub.BillingCycle, sub.AmountMinorUnits, sub.Currency,
		sub.PaymentProvider, sub.ExternalSubscriptionID, sub.ExternalCustomerID,
		sub.Status, sub.TrialEndsAt, sub.CurrentPeriodStart, sub.CurrentPeriodEnd,
		sub.CreatedAt, sub.UpdatedAt,
	)

	if err != nil {
		return fmt.Errorf("failed to create subscription: %w", err)
	}

	logger.Info("Subscription created",
		zap.String("subscription_id", sub.ID.String()),
		zap.String("user_id", sub.UserID.String()),
		zap.String("plan", sub.PlanTier),
	)

	return nil
}

// GetSubscriptionByUserID retrieves the active subscription for a user
func (s *PostgresStore) GetSubscriptionByUserID(ctx context.Context, userID uuid.UUID) (*models.Subscription, error) {
	query := `
		SELECT id, user_id, plan_tier, billing_cycle, amount_minor_units, currency,
		       payment_provider, external_subscription_id, external_customer_id,
		       status, trial_ends_at, current_period_start, current_period_end,
		       canceled_at, created_at, updated_at
		FROM subscriptions
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`

	var sub models.Subscription
	err := s.db.QueryRowContext(ctx, query, userID).Scan(
		&sub.ID, &sub.UserID, &sub.PlanTier, &sub.BillingCycle, &sub.AmountMinorUnits, &sub.Currency,
		&sub.PaymentProvider, &sub.ExternalSubscriptionID, &sub.ExternalCustomerID,
		&sub.Status, &sub.TrialEndsAt, &sub.CurrentPeriodStart, &sub.CurrentPeriodEnd,
		&sub.CanceledAt, &sub.CreatedAt, &sub.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, models.ErrSubscriptionNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get subscription: %w", err)
	}

	return &sub, nil
}

// UpdateSubscription updates an existing subscription
func (s *PostgresStore) UpdateSubscription(ctx context.Context, sub *models.Subscription) error {
	query := `
		UPDATE subscriptions
		SET plan_tier = $1, billing_cycle = $2, amount_minor_units = $3, currency = $4,
		    payment_provider = $5, external_subscription_id = $6, external_customer_id = $7,
		    status = $8, trial_ends_at = $9, current_period_start = $10, current_period_end = $11,
		    canceled_at = $12, updated_at = $13
		WHERE id = $14
	`

	_, err := s.db.ExecContext(
		ctx, query,
		sub.PlanTier, sub.BillingCycle, sub.AmountMinorUnits, sub.Currency,
		sub.PaymentProvider, sub.ExternalSubscriptionID, sub.ExternalCustomerID,
		sub.Status, sub.TrialEndsAt, sub.CurrentPeriodStart, sub.CurrentPeriodEnd,
		sub.CanceledAt, time.Now(), sub.ID,
	)

	if err != nil {
		return fmt.Errorf("failed to update subscription: %w", err)
	}

	return nil
}

// CreateInvoice creates a new invoice
func (s *PostgresStore) CreateInvoice(ctx context.Context, inv *models.Invoice) error {
	query := `
		INSERT INTO invoices (
			id, subscription_id, user_id, amount_minor_units, currency,
			status, payment_provider, external_invoice_id, hosted_invoice_url,
			invoice_pdf_url, due_date, paid_at, created_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
		)
	`

	_, err := s.db.ExecContext(
		ctx, query,
		inv.ID, inv.SubscriptionID, inv.UserID, inv.AmountMinorUnits, inv.Currency,
		inv.Status, inv.PaymentProvider, inv.ExternalInvoiceID, inv.HostedInvoiceURL,
		inv.InvoicePDFURL, inv.DueDate, inv.PaidAt, inv.CreatedAt,
	)

	if err != nil {
		return fmt.Errorf("failed to create invoice: %w", err)
	}

	return nil
}
