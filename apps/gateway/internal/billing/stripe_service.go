//go:build commercial

package billing

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/stripe/stripe-go/v81"
	portalsession "github.com/stripe/stripe-go/v81/billingportal/session"
	checkoutsession "github.com/stripe/stripe-go/v81/checkout/session"
	"github.com/stripe/stripe-go/v81/customer"
	"github.com/stripe/stripe-go/v81/subscription"
	"github.com/varbees/rateguard/internal/models"
	"go.uber.org/zap"
)

// StripeService handles Stripe payment operations
type StripeService struct {
	db     *sql.DB
	logger *zap.Logger
}

// NewStripeService creates a new Stripe service instance
func NewStripeService(secretKey string, db *sql.DB, logger *zap.Logger) *StripeService {
	// Set the Stripe API key
	stripe.Key = secretKey

	return &StripeService{
		db:     db,
		logger: logger,
	}
}

// GetDB returns the database connection
func (s *StripeService) GetDB() *sql.DB {
	return s.db
}

// CreateCustomer creates a Stripe customer for a user
func (s *StripeService) CreateCustomer(ctx context.Context, user *models.User) (string, error) {
	params := &stripe.CustomerParams{
		Email: stripe.String(user.Email),
		Name:  stripe.String(user.Email),
		Metadata: map[string]string{
			"user_id": user.ID.String(),
		},
	}

	cust, err := customer.New(params)
	if err != nil {
		s.logger.Error("Failed to create Stripe customer",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return "", fmt.Errorf("failed to create customer: %w", err)
	}

	s.logger.Info("Stripe customer created",
		zap.String("user_id", user.ID.String()),
		zap.String("customer_id", cust.ID),
	)

	return cust.ID, nil
}

// CreateCheckoutSession creates a Stripe Checkout session and returns the URL
func (s *StripeService) CreateCheckoutSession(ctx context.Context, req CreateSubscriptionRequest) (string, string, error) {
	// Get pricing for USD region
	preset := req.Preset
	pricing := models.GetPricingByRegion(preset, "USD")

	// Calculate period end based on billing cycle
	periodStart := time.Now()
	var periodEnd time.Time
	if req.BillingCycle == "annual" {
		periodEnd = periodStart.AddDate(1, 0, 0)
	} else {
		periodEnd = periodStart.AddDate(0, 1, 0)
	}

	// Get or create customer
	customerID, err := s.getOrCreateCustomer(ctx, req.UserID)
	if err != nil {
		return "", "", err
	}

	// Calculate amount (Stripe uses cents/minor units)
	amountMinorUnits := int64(pricing.AmountMinorUnits)
	if req.BillingCycle == "annual" {
		// 10x monthly for annual (same as Razorpay pattern)
		amountMinorUnits = amountMinorUnits * 10
	}

	// Create Stripe Price for this subscription
	priceParams := &stripe.PriceParams{
		Currency:   stripe.String(string(stripe.CurrencyUSD)),
		UnitAmount: stripe.Int64(amountMinorUnits),
		Recurring: &stripe.PriceRecurringParams{
			Interval: stripe.String(string(stripe.PriceRecurringIntervalMonth)),
		},
		ProductData: &stripe.PriceProductDataParams{
			Name: stripe.String(fmt.Sprintf("RateGuard %s Preset", preset)),
			Metadata: map[string]string{
				"preset":        preset,
				"billing_cycle": req.BillingCycle,
			},
		},
	}

	// For annual, set interval to year
	if req.BillingCycle == "annual" {
		priceParams.Recurring.Interval = stripe.String(string(stripe.PriceRecurringIntervalYear))
	}

	// Create Checkout Session
	sessionParams := &stripe.CheckoutSessionParams{
		Customer: stripe.String(customerID),
		Mode:     stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Price:    stripe.String(""), // Will be created inline
				Quantity: stripe.Int64(1),
				PriceData: &stripe.CheckoutSessionLineItemPriceDataParams{
					Currency:   stripe.String(string(stripe.CurrencyUSD)),
					UnitAmount: stripe.Int64(amountMinorUnits),
					Recurring: &stripe.CheckoutSessionLineItemPriceDataRecurringParams{
						Interval: priceParams.Recurring.Interval,
					},
					ProductData: &stripe.CheckoutSessionLineItemPriceDataProductDataParams{
						Name:        stripe.String(fmt.Sprintf("RateGuard %s Preset (%s)", preset, req.BillingCycle)),
						Description: stripe.String(fmt.Sprintf("RateGuard %s preset - %s billing", preset, req.BillingCycle)),
						Metadata: map[string]string{
							"preset":        preset,
							"billing_cycle": req.BillingCycle,
						},
					},
				},
			},
		},
		SuccessURL: stripe.String("http://localhost:3000/dashboard/billing/success?session_id={CHECKOUT_SESSION_ID}"),
		CancelURL:  stripe.String("http://localhost:3000/dashboard/billing"),
		Metadata: map[string]string{
			"user_id":       req.UserID.String(),
			"preset":        preset,
			"billing_cycle": req.BillingCycle,
		},
	}

	sess, err := checkoutsession.New(sessionParams)
	if err != nil {
		s.logger.Error("Failed to create Stripe checkout session",
			zap.String("user_id", req.UserID.String()),
			zap.Error(err),
		)
		return "", "", fmt.Errorf("failed to create checkout session: %w", err)
	}

	// Insert into database with status "pending"
	dbSubscriptionID := uuid.New()
	err = s.createSubscriptionRecord(ctx, dbSubscriptionID, req, sess.ID, customerID, pricing, periodStart, periodEnd)
	if err != nil {
		s.logger.Error("Failed to create subscription record",
			zap.String("user_id", req.UserID.String()),
			zap.Error(err),
		)
		return "", "", err
	}

	s.logger.Info("Stripe checkout session created",
		zap.String("user_id", req.UserID.String()),
		zap.String("session_id", sess.ID),
		zap.String("checkout_url", sess.URL),
	)

	return sess.ID, sess.URL, nil
}

// HandleWebhook processes Stripe webhook events
func (s *StripeService) HandleWebhook(ctx context.Context, payload []byte, signature, secret string) error {
	// Step 1: Verify signature
	event, err := VerifyStripeSignature(payload, signature, secret)
	if err != nil {
		s.logger.Error("Webhook signature verification failed", zap.Error(err))
		return err
	}

	s.logger.Info("Processing Stripe webhook",
		zap.String("event_type", string(event.Type)),
		zap.String("event_id", event.ID),
	)

	// Step 2: Idempotency check
	exists, err := s.checkWebhookEventExists(ctx, event.ID)
	if err != nil {
		return err
	}
	if exists {
		s.logger.Info("Webhook event already processed, skipping",
			zap.String("event_id", event.ID),
		)
		return nil
	}

	// Step 3: Handle event
	var handleErr error
	switch event.Type {
	case "checkout.session.completed":
		handleErr = s.handleCheckoutCompleted(ctx, event)
	case "invoice.paid":
		handleErr = s.handleInvoicePaid(ctx, event)
	case "invoice.payment_failed":
		handleErr = s.handlePaymentFailed(ctx, event)
	case "customer.subscription.updated":
		handleErr = s.handleSubscriptionUpdated(ctx, event)
	case "customer.subscription.deleted":
		handleErr = s.handleSubscriptionDeleted(ctx, event)
	default:
		s.logger.Warn("Unhandled webhook event type",
			zap.String("event_type", string(event.Type)),
		)
		handleErr = nil // Not an error, just log it
	}

	// Store webhook event for audit
	if err := s.storeWebhookEvent(ctx, event.ID, string(event.Type), payload, handleErr); err != nil {
		s.logger.Error("Failed to store webhook event", zap.Error(err))
		// Don't return error - we already processed the event
	}

	return handleErr
}

// CreatePortalSession creates a Stripe Customer Portal session
func (s *StripeService) CreatePortalSession(ctx context.Context, customerID string) (string, error) {
	params := &stripe.BillingPortalSessionParams{
		Customer:  stripe.String(customerID),
		ReturnURL: stripe.String("http://localhost:3000/dashboard/billing"),
	}

	sess, err := portalsession.New(params)
	if err != nil {
		s.logger.Error("Failed to create Stripe portal session",
			zap.String("customer_id", customerID),
			zap.Error(err),
		)
		return "", fmt.Errorf("failed to create portal session: %w", err)
	}

	s.logger.Info("Stripe portal session created",
		zap.String("customer_id", customerID),
		zap.String("portal_url", sess.URL),
	)

	return sess.URL, nil
}

// CancelSubscription cancels a Stripe subscription
func (s *StripeService) CancelSubscription(ctx context.Context, subscriptionID string) error {
	// Cancel in Stripe (at period end)
	params := &stripe.SubscriptionParams{
		CancelAtPeriodEnd: stripe.Bool(true),
	}

	_, err := subscription.Update(subscriptionID, params)
	if err != nil {
		s.logger.Error("Failed to cancel Stripe subscription",
			zap.String("subscription_id", subscriptionID),
			zap.Error(err),
		)
		return fmt.Errorf("failed to cancel subscription: %w", err)
	}

	// Update database
	query := `
		UPDATE subscriptions
		SET status = 'canceled',
		    canceled_at = NOW(),
		    updated_at = NOW()
		WHERE external_subscription_id = $1
	`

	_, err = s.db.ExecContext(ctx, query, subscriptionID)
	if err != nil {
		return fmt.Errorf("failed to update subscription status: %w", err)
	}

	s.logger.Info("Subscription canceled",
		zap.String("subscription_id", subscriptionID),
	)

	return nil
}

// --- Private Helper Methods ---

func (s *StripeService) getOrCreateCustomer(ctx context.Context, userID uuid.UUID) (string, error) {
	// Check if customer already exists in subscriptions table
	query := `
		SELECT external_customer_id
		FROM subscriptions
		WHERE user_id = $1 AND external_customer_id IS NOT NULL
		ORDER BY created_at DESC
		LIMIT 1
	`

	var customerID *string
	err := s.db.QueryRowContext(ctx, query, userID).Scan(&customerID)
	if err == nil && customerID != nil {
		return *customerID, nil
	}

	// Customer doesn't exist, need to fetch user and create.
	user, err := loadBillingUser(ctx, s.db, userID)
	if err != nil {
		return "", err
	}

	return s.CreateCustomer(ctx, user)
}

func (s *StripeService) createSubscriptionRecord(
	ctx context.Context,
	id uuid.UUID,
	req CreateSubscriptionRequest,
	externalSubID string,
	customerID string,
	pricing models.PricingInfo,
	periodStart, periodEnd time.Time,
) error {
	// Adjust amount for annual
	amount := pricing.AmountMinorUnits
	if req.BillingCycle == "annual" {
		amount = amount * 10
	}

	query := `
		INSERT INTO subscriptions (
			id, user_id, plan_tier, billing_cycle, amount_minor_units, currency,
			payment_provider, external_subscription_id, external_customer_id,
			status, current_period_start, current_period_end, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
	`

	_, err := s.db.ExecContext(
		ctx,
		query,
		id,
		req.UserID,
		req.Preset,
		req.BillingCycle,
		amount,
		pricing.Currency,
		"stripe",
		externalSubID,
		customerID,
		"pending",
		periodStart,
		periodEnd,
	)

	return err
}

func (s *StripeService) checkWebhookEventExists(ctx context.Context, eventID string) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM webhook_events WHERE provider = 'stripe' AND external_id = $1)`

	var exists bool
	err := s.db.QueryRowContext(ctx, query, eventID).Scan(&exists)
	return exists, err
}

func (s *StripeService) storeWebhookEvent(ctx context.Context, eventID, eventType string, payload []byte, processErr error) error {
	query := `
		INSERT INTO webhook_events (provider, external_id, event_type, payload, processed, error_message)
		VALUES ('stripe', $1, $2, $3, $4, $5)
		ON CONFLICT (provider, external_id) DO NOTHING
	`

	var errMsg *string
	processed := processErr == nil
	if processErr != nil {
		msg := processErr.Error()
		errMsg = &msg
	}

	_, err := s.db.ExecContext(ctx, query, eventID, eventType, payload, processed, errMsg)
	return err
}

// --- Webhook Event Handlers ---

func (s *StripeService) handleCheckoutCompleted(ctx context.Context, event *stripe.Event) error {
	var sess stripe.CheckoutSession
	if err := json.Unmarshal(event.Data.Raw, &sess); err != nil {
		return fmt.Errorf("failed to unmarshal checkout session: %w", err)
	}

	// Get subscription ID from session
	if sess.Subscription == nil {
		return fmt.Errorf("no subscription in checkout session")
	}

	subscriptionID := sess.Subscription.ID
	customerID := sess.Customer.ID

	// Update subscription record with external subscription ID
	query := `
		UPDATE subscriptions
		SET external_subscription_id = $1,
		    external_customer_id = $2,
		    updated_at = NOW()
		WHERE id::text = $3 OR external_subscription_id = $4
	`

	// Try to find by session ID (stored as external_subscription_id during creation)
	result, err := s.db.ExecContext(ctx, query, subscriptionID, customerID, sess.ID, sess.ID)
	if err != nil {
		return fmt.Errorf("failed to update subscription: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		s.logger.Warn("No subscription found for checkout session",
			zap.String("session_id", sess.ID),
		)
	}

	s.logger.Info("Checkout session completed",
		zap.String("session_id", sess.ID),
		zap.String("subscription_id", subscriptionID),
		zap.String("customer_id", customerID),
	)

	return nil
}

func (s *StripeService) handleInvoicePaid(ctx context.Context, event *stripe.Event) error {
	var invoice stripe.Invoice
	if err := json.Unmarshal(event.Data.Raw, &invoice); err != nil {
		return fmt.Errorf("failed to unmarshal invoice: %w", err)
	}

	if invoice.Subscription == nil {
		return fmt.Errorf("no subscription in invoice")
	}

	subscriptionID := invoice.Subscription.ID

	// Update subscription status to active
	query := `
		UPDATE subscriptions
		SET status = 'active',
		    updated_at = NOW()
		WHERE external_subscription_id = $1
		RETURNING id, user_id, plan_tier
	`

	var subID, userID uuid.UUID
	var planTier string
	err := s.db.QueryRowContext(ctx, query, subscriptionID).Scan(&subID, &userID, &planTier)
	if err != nil {
		return fmt.Errorf("failed to update subscription: %w", err)
	}

	if err := persistUserPreset(ctx, s.db, userID, planTier); err != nil {
		return err
	}

	// Create invoice record
	invoiceQuery := `
		INSERT INTO invoices (
			id, subscription_id, user_id, amount_minor_units, currency,
			status, payment_provider, external_invoice_id, paid_at, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
	`

	_, err = s.db.ExecContext(
		ctx,
		invoiceQuery,
		uuid.New(),
		subID,
		userID,
		invoice.AmountPaid,
		string(invoice.Currency),
		"paid",
		"stripe",
		invoice.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to create invoice: %w", err)
	}

	s.logger.Info("Invoice paid successfully",
		zap.String("subscription_id", subscriptionID),
		zap.String("invoice_id", invoice.ID),
		zap.String("user_id", userID.String()),
	)

	return nil
}

func (s *StripeService) handlePaymentFailed(ctx context.Context, event *stripe.Event) error {
	var invoice stripe.Invoice
	if err := json.Unmarshal(event.Data.Raw, &invoice); err != nil {
		return fmt.Errorf("failed to unmarshal invoice: %w", err)
	}

	if invoice.Subscription == nil {
		return fmt.Errorf("no subscription in invoice")
	}

	subscriptionID := invoice.Subscription.ID

	query := `
		UPDATE subscriptions
		SET status = 'past_due',
		    updated_at = NOW()
		WHERE external_subscription_id = $1
	`

	_, err := s.db.ExecContext(ctx, query, subscriptionID)
	if err != nil {
		return fmt.Errorf("failed to update subscription: %w", err)
	}

	s.logger.Warn("Payment failed",
		zap.String("invoice_id", invoice.ID),
		zap.String("subscription_id", subscriptionID),
	)

	return nil
}

func (s *StripeService) handleSubscriptionUpdated(ctx context.Context, event *stripe.Event) error {
	var sub stripe.Subscription
	if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
		return fmt.Errorf("failed to unmarshal subscription: %w", err)
	}

	// Update subscription status and period
	query := `
		UPDATE subscriptions
		SET status = $1,
		    current_period_start = $2,
		    current_period_end = $3,
		    updated_at = NOW()
		WHERE external_subscription_id = $4
	`

	status := "active"
	if sub.Status == stripe.SubscriptionStatusCanceled {
		status = "canceled"
	} else if sub.Status == stripe.SubscriptionStatusPastDue {
		status = "past_due"
	}

	_, err := s.db.ExecContext(
		ctx,
		query,
		status,
		time.Unix(sub.CurrentPeriodStart, 0),
		time.Unix(sub.CurrentPeriodEnd, 0),
		sub.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update subscription: %w", err)
	}

	s.logger.Info("Subscription updated",
		zap.String("subscription_id", sub.ID),
		zap.String("status", string(sub.Status)),
	)

	return nil
}

func (s *StripeService) handleSubscriptionDeleted(ctx context.Context, event *stripe.Event) error {
	var sub stripe.Subscription
	if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
		return fmt.Errorf("failed to unmarshal subscription: %w", err)
	}

	query := `
		UPDATE subscriptions
		SET status = 'canceled',
		    canceled_at = NOW(),
		    updated_at = NOW()
		WHERE external_subscription_id = $1
	`

	_, err := s.db.ExecContext(ctx, query, sub.ID)
	if err != nil {
		return fmt.Errorf("failed to update subscription: %w", err)
	}

	s.logger.Info("Subscription deleted",
		zap.String("subscription_id", sub.ID),
	)

	return nil
}
