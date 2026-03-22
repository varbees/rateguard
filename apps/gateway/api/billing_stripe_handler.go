//go:build commercial

package api

import (
	"database/sql"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/varbees/rateguard/api/middleware"
	"github.com/varbees/rateguard/internal/billing"
	"github.com/varbees/rateguard/internal/models"
	"go.uber.org/zap"
)

// StripeHandler handles Stripe billing endpoints
type StripeHandler struct {
	service       *billing.StripeService
	webhookSecret string
	logger        *zap.Logger
	db            *sql.DB
}

// NewStripeHandler creates a new Stripe handler
func NewStripeHandler(service *billing.StripeService, webhookSecret string, db *sql.DB, logger *zap.Logger) *StripeHandler {
	return &StripeHandler{
		service:       service,
		webhookSecret: webhookSecret,
		db:            db,
		logger:        logger,
	}
}

// CreateCheckout creates a Stripe checkout session
// @Summary Create Stripe checkout
// @Description Creates a Stripe subscription and returns checkout URL
// @Tags billing
// @Accept json
// @Produce json
// @Param request body CreateCheckoutRequest true "Checkout request"
// @Success 200 {object} CreateCheckoutResponse
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/billing/stripe/checkout [post]
func (h *StripeHandler) CreateCheckout(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	// Parse request
	var req CreateCheckoutRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request body",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	preset := resolveCheckoutPreset(req.Preset)

	// Validate preset (only starter and pro can be purchased).
	if preset != "starter" && preset != "pro" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid preset",
			Message:   "Only starter and pro presets can be purchased",
			Timestamp: time.Now(),
		})
	}

	// Create checkout session
	sessionID, checkoutURL, err := h.service.CreateCheckoutSession(c.Context(), billing.CreateSubscriptionRequest{
		Preset:       preset,
		UserID:       user.ID,
		BillingCycle: req.BillingCycle,
	})
	if err != nil {
		h.logger.Error("Failed to create checkout",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to create checkout",
			Message:   "Unable to create payment session",
			Timestamp: time.Now(),
		})
	}

	// Get pricing info for response
	pricing := models.GetPricingByRegion(preset, "USD")

	// Adjust for annual
	displayAmount := pricing.DisplayAmount
	if req.BillingCycle == "annual" {
		if preset == "starter" {
			displayAmount = "$290"
		} else {
			displayAmount = "$790"
		}
	}

	h.logger.Info("Checkout created",
		zap.String("user_id", user.ID.String()),
		zap.String("session_id", sessionID),
		zap.String("preset", preset),
	)

	return c.JSON(CreateCheckoutResponse{
		CheckoutURL:    checkoutURL,
		SubscriptionID: sessionID,
		Preset:         preset,
		BillingCycle:   req.BillingCycle,
		Amount:         displayAmount,
		Currency:       pricing.Currency,
	})
}

// HandleWebhook processes Stripe webhook events
// @Summary Handle Stripe webhook
// @Description Processes webhook events from Stripe (no auth required)
// @Tags billing
// @Accept json
// @Produce json
// @Success 200 {object} map[string]string
// @Router /api/v1/billing/stripe/webhook [post]
func (h *StripeHandler) HandleWebhook(c *fiber.Ctx) error {
	// Get signature from header
	signature := c.Get("Stripe-Signature")
	if signature == "" {
		h.logger.Warn("Webhook received without signature")
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing signature",
		})
	}

	// Read raw body (important: do not parse as JSON yet)
	body := c.Body()
	if len(body) == 0 {
		h.logger.Warn("Webhook received with empty body")
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Empty body",
		})
	}

	// Process webhook (verification happens inside)
	err := h.service.HandleWebhook(c.Context(), body, signature, h.webhookSecret)
	if err != nil {
		h.logger.Error("Webhook processing failed",
			zap.Error(err),
		)
		// IMPORTANT: Always return 200 to Stripe to prevent retries
		// Log the error but don't expose internal details
		return c.JSON(fiber.Map{
			"status": "error",
			"error":  "Processing failed",
		})
	}

	h.logger.Info("Webhook processed successfully")
	return c.JSON(fiber.Map{
		"status": "success",
	})
}

// CreatePortal creates a Stripe Customer Portal session
// @Summary Create Stripe portal session
// @Description Creates a Stripe Customer Portal session for subscription management
// @Tags billing
// @Produce json
// @Success 200 {object} map[string]string
// @Failure 401 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /api/v1/billing/stripe/portal [post]
func (h *StripeHandler) CreatePortal(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	// Get user's Stripe customer ID from database
	ctx := c.Context()
	query := `
		SELECT external_customer_id
		FROM subscriptions
		WHERE user_id = $1
		  AND payment_provider = 'stripe'
		  AND external_customer_id IS NOT NULL
		ORDER BY created_at DESC
		LIMIT 1
	`

	var customerID *string
	err = h.service.GetDB().QueryRowContext(ctx, query, user.ID).Scan(&customerID)
	if err != nil || customerID == nil {
		return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
			Error:     "No customer found",
			Message:   "No Stripe customer found for this user",
			Timestamp: time.Now(),
		})
	}

	// Create portal session
	portalURL, err := h.service.CreatePortalSession(ctx, *customerID)
	if err != nil {
		h.logger.Error("Failed to create portal session",
			zap.String("user_id", user.ID.String()),
			zap.String("customer_id", *customerID),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to create portal session",
			Message:   "Unable to create customer portal session",
			Timestamp: time.Now(),
		})
	}

	h.logger.Info("Portal session created",
		zap.String("user_id", user.ID.String()),
		zap.String("customer_id", *customerID),
	)

	return c.JSON(fiber.Map{
		"portal_url": portalURL,
	})
}

// CancelSubscription cancels a user's active Stripe subscription
// @Summary Cancel Stripe subscription
// @Description Cancels the user's active Stripe subscription
// @Tags billing
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /api/v1/billing/stripe/cancel [post]
func (h *StripeHandler) CancelSubscription(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	// Get user's active subscription from database
	ctx := c.Context()
	query := `
		SELECT external_subscription_id
		FROM subscriptions
		WHERE user_id = $1
		  AND payment_provider = 'stripe'
		  AND status IN ('active', 'past_due')
		ORDER BY created_at DESC
		LIMIT 1
	`

	var externalSubID *string
	err = h.service.GetDB().QueryRowContext(ctx, query, user.ID).Scan(&externalSubID)
	if err != nil || externalSubID == nil {
		return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
			Error:     "No active subscription",
			Message:   "No active Stripe subscription found",
			Timestamp: time.Now(),
		})
	}

	// Cancel the subscription
	err = h.service.CancelSubscription(ctx, *externalSubID)
	if err != nil {
		h.logger.Error("Failed to cancel subscription",
			zap.String("user_id", user.ID.String()),
			zap.String("subscription_id", *externalSubID),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to cancel subscription",
			Message:   "Unable to cancel subscription at this time",
			Timestamp: time.Now(),
		})
	}

	h.logger.Info("Subscription canceled",
		zap.String("user_id", user.ID.String()),
		zap.String("subscription_id", *externalSubID),
	)

	return c.JSON(fiber.Map{
		"status":          "canceled",
		"subscription_id": *externalSubID,
		"message":         "Subscription will be canceled at period end",
	})
}
