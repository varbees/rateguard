//go:build commercial

package billing

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	razorpay "github.com/razorpay/razorpay-go"
	"github.com/varbees/rateguard/internal/models"
	"go.uber.org/zap"
)

// RazorpayService handles Razorpay payment operations
type RazorpayService struct {
	client *razorpay.Client
	db     *sql.DB
	logger *zap.Logger
}

// NewRazorpayService creates a new Razorpay service instance
func NewRazorpayService(keyID, keySecret string, db *sql.DB, logger *zap.Logger) *RazorpayService {
	client := razorpay.NewClient(keyID, keySecret)

	return &RazorpayService{
		client: client,
		db:     db,
		logger: logger,
	}
}

// GetDB returns the database connection
func (s *RazorpayService) GetDB() *sql.DB {
	return s.db
}

// CreateCustomer creates a Razorpay customer for a user
func (s *RazorpayService) CreateCustomer(ctx context.Context, user *models.User) (string, error) {
	data := map[string]interface{}{
		"name":  user.Email,
		"email": user.Email,
	}

	body, err := s.client.Customer.Create(data, nil)
	if err != nil {
		s.logger.Error("Failed to create Razorpay customer",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return "", fmt.Errorf("failed to create customer: %w", err)
	}

	customerID, ok := body["id"].(string)
	if !ok {
		return "", fmt.Errorf("invalid customer ID in response")
	}

	s.logger.Info("Razorpay customer created",
		zap.String("user_id", user.ID.String()),
		zap.String("customer_id", customerID),
	)

	return customerID, nil
}

// CreateSubscriptionRequest represents subscription creation parameters
type CreateSubscriptionRequest struct {
	UserID       uuid.UUID
	Preset       string
	BillingCycle string
}

// CreateSubscription creates a Razorpay subscription and returns checkout URL
func (s *RazorpayService) CreateSubscription(ctx context.Context, req CreateSubscriptionRequest) (string, string, error) {
	// Get pricing for INR region
	preset := req.Preset
	pricing := models.GetPricingByRegion(preset, "INR")

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

	// Create Razorpay subscription using the selected preset.
	data := map[string]interface{}{
		"plan_id":         s.getPlanID(preset, req.BillingCycle),
		"customer_id":     customerID,
		"total_count":     12, // 12 billing cycles for annual, renews monthly for monthly
		"quantity":        1,
		"start_at":        periodStart.Unix(),
		"customer_notify": 1,
		"notes": map[string]interface{}{
			"user_id":       req.UserID.String(),
			"preset":        preset,
			"billing_cycle": req.BillingCycle,
		},
	}

	body, err := s.client.Subscription.Create(data, nil)
	if err != nil {
		s.logger.Error("Failed to create Razorpay subscription",
			zap.String("user_id", req.UserID.String()),
			zap.Error(err),
		)
		return "", "", fmt.Errorf("failed to create subscription: %w", err)
	}

	subscriptionID, ok := body["id"].(string)
	if !ok {
		return "", "", fmt.Errorf("invalid subscription ID in response")
	}

	// Get short URL for checkout
	shortURL, _ := body["short_url"].(string)
	if shortURL == "" {
		shortURL = fmt.Sprintf("https://razorpay.com/subscription/%s", subscriptionID)
	}

	// Insert into database with status "pending"
	dbSubscriptionID := uuid.New()
	err = s.createSubscriptionRecord(ctx, dbSubscriptionID, req, subscriptionID, customerID, pricing, periodStart, periodEnd)
	if err != nil {
		s.logger.Error("Failed to create subscription record",
			zap.String("user_id", req.UserID.String()),
			zap.Error(err),
		)
		return "", "", err
	}

	s.logger.Info("Razorpay subscription created",
		zap.String("user_id", req.UserID.String()),
		zap.String("subscription_id", subscriptionID),
		zap.String("checkout_url", shortURL),
	)

	return subscriptionID, shortURL, nil
}

// HandleWebhook processes Razorpay webhook events
func (s *RazorpayService) HandleWebhook(ctx context.Context, payload []byte, signature, secret string) error {
	// Step 1: Verify signature
	if err := VerifyRazorpaySignature(payload, signature, secret); err != nil {
		s.logger.Error("Webhook signature verification failed", zap.Error(err))
		return err
	}

	// Step 2: Parse event
	var event map[string]interface{}
	if err := json.Unmarshal(payload, &event); err != nil {
		s.logger.Error("Failed to parse webhook payload", zap.Error(err))
		return fmt.Errorf("invalid JSON payload: %w", err)
	}

	eventType, _ := event["event"].(string)
	eventID, _ := event["event_id"].(string)

	s.logger.Info("Processing Razorpay webhook",
		zap.String("event_type", eventType),
		zap.String("event_id", eventID),
	)

	// Step 3: Idempotency check
	exists, err := s.checkWebhookEventExists(ctx, eventID)
	if err != nil {
		return err
	}
	if exists {
		s.logger.Info("Webhook event already processed, skipping",
			zap.String("event_id", eventID),
		)
		return nil
	}

	// Step 4: Handle event
	var handleErr error
	switch eventType {
	case "subscription.charged":
		handleErr = s.handleSubscriptionCharged(ctx, event)
	case "subscription.cancelled":
		handleErr = s.handleSubscriptionCancelled(ctx, event)
	case "subscription.activated":
		handleErr = s.handleSubscriptionActivated(ctx, event)
	case "payment.failed":
		handleErr = s.handlePaymentFailed(ctx, event)
	default:
		s.logger.Warn("Unhandled webhook event type",
			zap.String("event_type", eventType),
		)
		handleErr = nil // Not an error, just log it
	}

	// Store webhook event for audit
	if err := s.storeWebhookEvent(ctx, eventID, eventType, payload, handleErr); err != nil {
		s.logger.Error("Failed to store webhook event", zap.Error(err))
		// Don't return error - we already processed the event
	}

	return handleErr
}

// CancelSubscription cancels a Razorpay subscription
func (s *RazorpayService) CancelSubscription(ctx context.Context, subscriptionID string) error {
	// Cancel in Razorpay
	data := map[string]interface{}{
		"cancel_at_cycle_end": 0, // Cancel immediately
	}

	_, err := s.client.Subscription.Cancel(subscriptionID, data, nil)
	if err != nil {
		s.logger.Error("Failed to cancel Razorpay subscription",
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

func (s *RazorpayService) getOrCreateCustomer(ctx context.Context, userID uuid.UUID) (string, error) {
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

func (s *RazorpayService) getPlanID(tier, cycle string) string {
	// In production, these would be created in the Razorpay dashboard.
	// Format: preset_{tier}_{cycle}
	return fmt.Sprintf("preset_%s_%s", tier, cycle)
}

func (s *RazorpayService) createSubscriptionRecord(
	ctx context.Context,
	id uuid.UUID,
	req CreateSubscriptionRequest,
	externalSubID string,
	customerID string,
	pricing models.PricingInfo,
	periodStart, periodEnd time.Time,
) error {
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
		pricing.AmountMinorUnits,
		pricing.Currency,
		"razorpay",
		externalSubID,
		customerID,
		"pending",
		periodStart,
		periodEnd,
	)

	return err
}

func (s *RazorpayService) checkWebhookEventExists(ctx context.Context, eventID string) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM webhook_events WHERE provider = 'razorpay' AND external_id = $1)`

	var exists bool
	err := s.db.QueryRowContext(ctx, query, eventID).Scan(&exists)
	return exists, err
}

func (s *RazorpayService) storeWebhookEvent(ctx context.Context, eventID, eventType string, payload []byte, processErr error) error {
	query := `
		INSERT INTO webhook_events (provider, external_id, event_type, payload, processed, error_message)
		VALUES ('razorpay', $1, $2, $3, $4, $5)
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

func (s *RazorpayService) handleSubscriptionCharged(ctx context.Context, event map[string]interface{}) error {
	payload, ok := event["payload"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("invalid payload structure")
	}

	subscription, ok := payload["subscription"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("invalid subscription structure")
	}

	payment, ok := payload["payment"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("invalid payment structure")
	}

	externalSubID, _ := subscription["entity"].(map[string]interface{})["id"].(string)
	paymentID, _ := payment["entity"].(map[string]interface{})["id"].(string)
	amountPaise := 0
	if amt, ok := payment["entity"].(map[string]interface{})["amount"].(float64); ok {
		amountPaise = int(amt)
	}

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
	err := s.db.QueryRowContext(ctx, query, externalSubID).Scan(&subID, &userID, &planTier)
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
		amountPaise,
		"INR",
		"paid",
		"razorpay",
		paymentID,
	)
	if err != nil {
		return fmt.Errorf("failed to create invoice: %w", err)
	}

	s.logger.Info("Subscription charged successfully",
		zap.String("subscription_id", externalSubID),
		zap.String("payment_id", paymentID),
		zap.String("user_id", userID.String()),
	)

	return nil
}

func (s *RazorpayService) handleSubscriptionCancelled(ctx context.Context, event map[string]interface{}) error {
	payload, ok := event["payload"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("invalid payload structure")
	}

	subscription, ok := payload["subscription"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("invalid subscription structure")
	}

	entity, ok := subscription["entity"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("invalid entity structure")
	}

	externalSubID, _ := entity["id"].(string)

	query := `
		UPDATE subscriptions
		SET status = 'canceled',
		    canceled_at = NOW(),
		    updated_at = NOW()
		WHERE external_subscription_id = $1
	`

	_, err := s.db.ExecContext(ctx, query, externalSubID)
	if err != nil {
		return fmt.Errorf("failed to update subscription: %w", err)
	}

	s.logger.Info("Subscription cancelled",
		zap.String("subscription_id", externalSubID),
	)

	return nil
}

func (s *RazorpayService) handleSubscriptionActivated(ctx context.Context, event map[string]interface{}) error {
	payload, ok := event["payload"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("invalid payload structure")
	}

	subscription, ok := payload["subscription"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("invalid subscription structure")
	}

	entity, ok := subscription["entity"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("invalid entity structure")
	}

	externalSubID, _ := entity["id"].(string)

	query := `
		UPDATE subscriptions
		SET status = 'active',
		    updated_at = NOW()
		WHERE external_subscription_id = $1
	`

	_, err := s.db.ExecContext(ctx, query, externalSubID)
	if err != nil {
		return fmt.Errorf("failed to update subscription: %w", err)
	}

	s.logger.Info("Subscription activated",
		zap.String("subscription_id", externalSubID),
	)

	return nil
}

func (s *RazorpayService) handlePaymentFailed(ctx context.Context, event map[string]interface{}) error {
	payload, ok := event["payload"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("invalid payload structure")
	}

	payment, ok := payload["payment"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("invalid payment structure")
	}

	entity, ok := payment["entity"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("invalid entity structure")
	}

	paymentID, _ := entity["id"].(string)
	notes, _ := entity["notes"].(map[string]interface{})
	subscriptionID, _ := notes["subscription_id"].(string)

	if subscriptionID != "" {
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
	}

	s.logger.Warn("Payment failed",
		zap.String("payment_id", paymentID),
		zap.String("subscription_id", subscriptionID),
	)

	return nil
}
