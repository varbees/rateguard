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

// RazorpayHandler handles Razorpay billing endpoints
type RazorpayHandler struct {
	service       *billing.RazorpayService
	webhookSecret string
	logger        *zap.Logger
	db            *sql.DB
}

// NewRazorpayHandler creates a new Razorpay handler
func NewRazorpayHandler(service *billing.RazorpayService, webhookSecret string, db *sql.DB, logger *zap.Logger) *RazorpayHandler {
	return &RazorpayHandler{
		service:       service,
		webhookSecret: webhookSecret,
		db:            db,
		logger:        logger,
	}
}

// CreateCheckoutRequest represents checkout creation request
type CreateCheckoutRequest struct {
	Preset       string `json:"preset"`
	BillingCycle string `json:"billing_cycle" validate:"required,oneof=monthly annual"`
}

// CreateCheckoutResponse represents checkout creation response
type CreateCheckoutResponse struct {
	CheckoutURL    string `json:"checkout_url"`
	SubscriptionID string `json:"subscription_id"`
	Preset         string `json:"preset"`
	BillingCycle   string `json:"billing_cycle"`
	Amount         string `json:"amount"`
	Currency       string `json:"currency"`
}

// CreateCheckout creates a Razorpay checkout session
// @Summary Create Razorpay checkout
// @Description Creates a Razorpay subscription and returns checkout URL
// @Tags billing
// @Accept json
// @Produce json
// @Param request body CreateCheckoutRequest true "Checkout request"
// @Success 200 {object} CreateCheckoutResponse
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/billing/razorpay/checkout [post]
func (h *RazorpayHandler) CreateCheckout(c *fiber.Ctx) error {
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

	// Create subscription
	subscriptionID, checkoutURL, err := h.service.CreateSubscription(c.Context(), billing.CreateSubscriptionRequest{
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
	pricing := models.GetPricingByRegion(preset, "INR")

	h.logger.Info("Checkout created",
		zap.String("user_id", user.ID.String()),
		zap.String("subscription_id", subscriptionID),
		zap.String("preset", preset),
	)

	return c.JSON(CreateCheckoutResponse{
		CheckoutURL:    checkoutURL,
		SubscriptionID: subscriptionID,
		Preset:         preset,
		BillingCycle:   req.BillingCycle,
		Amount:         pricing.DisplayAmount,
		Currency:       pricing.Currency,
	})
}

// HandleWebhook processes Razorpay webhook events
// @Summary Handle Razorpay webhook
// @Description Processes webhook events from Razorpay (no auth required)
// @Tags billing
// @Accept json
// @Produce json
// @Success 200 {object} map[string]string
// @Router /api/v1/billing/razorpay/webhook [post]
func (h *RazorpayHandler) HandleWebhook(c *fiber.Ctx) error {
	// Get signature from header
	signature := c.Get("X-Razorpay-Signature")
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
		// IMPORTANT: Always return 200 to Razorpay to prevent retries
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

// CancelSubscription cancels a user's active subscription
// @Summary Cancel subscription
// @Description Cancels the user's active Razorpay subscription
// @Tags billing
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /api/v1/billing/razorpay/cancel [post]
func (h *RazorpayHandler) CancelSubscription(c *fiber.Ctx) error {
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
		  AND payment_provider = 'razorpay'
		  AND status IN ('active', 'past_due')
		ORDER BY created_at DESC
		LIMIT 1
	`

	var externalSubID *string
	err = h.service.GetDB().QueryRowContext(ctx, query, user.ID).Scan(&externalSubID)
	if err != nil || externalSubID == nil {
		return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
			Error:     "No active subscription",
			Message:   "No active Razorpay subscription found",
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
		"message":         "Subscription canceled successfully",
	})
}

// PaymentProvider represents an available payment provider
type PaymentProvider struct {
	Provider         string   `json:"provider"`
	Name             string   `json:"name"`
	SupportedMethods []string `json:"supported_methods"`
	Currency         string   `json:"currency"`
	Enabled          bool     `json:"enabled"`
}

// PricingDetails represents pricing for a specific tier and cycle
type PricingDetails struct {
	AmountMinorUnits int    `json:"amount_minor_units"`
	DisplayAmount    string `json:"display_amount"`
	Currency         string `json:"currency"`
}

// PaymentProvidersResponse represents the response for available providers
type PaymentProvidersResponse struct {
	DetectedCurrency   string                               `json:"detected_currency"`
	DetectedCountry    string                               `json:"detected_country"`
	AvailableProviders []PaymentProvider                    `json:"available_providers"`
	Pricing            map[string]map[string]PricingDetails `json:"pricing"`
}

// GetPortal returns a link to manage Razorpay subscription
// @Summary Get Razorpay portal link
// @Description Returns a link for managing Razorpay subscription (Razorpay doesn't have a portal API)
// @Tags billing
// @Produce json
// @Success 200 {object} map[string]string
// @Failure 401 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /api/v1/billing/razorpay/portal [post]
func (h *RazorpayHandler) GetPortal(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	// Get user's Razorpay subscription ID from database
	ctx := c.Context()
	query := `
		SELECT external_subscription_id
		FROM subscriptions
		WHERE user_id = $1
		  AND payment_provider = 'razorpay'
		  AND external_subscription_id IS NOT NULL
		ORDER BY created_at DESC
		LIMIT 1
	`

	var subscriptionID *string
	err = h.service.GetDB().QueryRowContext(ctx, query, user.ID).Scan(&subscriptionID)
	if err != nil || subscriptionID == nil {
		return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
			Error:     "No subscription found",
			Message:   "No Razorpay subscription found for this user",
			Timestamp: time.Now(),
		})
	}

	h.logger.Info("Portal link requested",
		zap.String("user_id", user.ID.String()),
		zap.String("subscription_id", *subscriptionID),
	)

	// Razorpay doesn't have a customer portal API, so we return a support email link
	// Users can contact support to manage their subscription
	return c.JSON(fiber.Map{
		"portal_url":      "mailto:support@rateguard.com?subject=Manage%20Razorpay%20Subscription",
		"message":         "Contact support to manage your Razorpay subscription",
		"subscription_id": *subscriptionID,
	})
}

// GetPaymentProviders returns available payment providers based on user's region
// @Summary Get available payment providers
// @Description Returns payment providers and pricing based on user's detected region
// @Tags billing
// @Produce json
// @Success 200 {object} PaymentProvidersResponse
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/billing/providers [get]
func (h *RazorpayHandler) GetPaymentProviders(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	// Get user's detected currency from database
	query := `SELECT detected_currency, country_code FROM users WHERE id = $1`
	var detectedCurrency, countryCode sql.NullString
	err = h.db.QueryRowContext(c.Context(), query, user.ID).Scan(&detectedCurrency, &countryCode)
	if err != nil {
		// Default to USD if not detected
		detectedCurrency.String = "USD"
		detectedCurrency.Valid = true
		countryCode.String = "US"
		countryCode.Valid = true
	}

	currency := "USD"
	country := "US"
	if detectedCurrency.Valid && detectedCurrency.String != "" {
		currency = detectedCurrency.String
	}
	if countryCode.Valid && countryCode.String != "" {
		country = countryCode.String
	}

	// Build list of available providers based on currency
	var providers []PaymentProvider

	if currency == "INR" && h.service != nil {
		// Razorpay for India
		providers = append(providers, PaymentProvider{
			Provider:         "razorpay",
			Name:             "Razorpay",
			SupportedMethods: []string{"UPI", "Cards", "Net Banking", "Wallets"},
			Currency:         "INR",
			Enabled:          true,
		})
	} else {
		// Stripe for global
		providers = append(providers, PaymentProvider{
			Provider:         "stripe",
			Name:             "Stripe",
			SupportedMethods: []string{"Cards", "Digital Wallets"},
			Currency:         "USD",
			Enabled:          true, // ✅ Now implemented
		})
	}

	// Build pricing map
	pricing := make(map[string]map[string]PricingDetails)

	for _, tier := range []string{"starter", "pro"} {
		pricing[tier] = make(map[string]PricingDetails)

		for _, cycle := range []string{"monthly", "annual"} {
			pricingInfo := models.GetPricingByRegion(tier, currency)

			// Adjust for annual (12x monthly)
			amount := pricingInfo.AmountMinorUnits
			display := pricingInfo.DisplayAmount

			if cycle == "annual" {
				amount = amount * 10 // 10x = ~17% discount vs 12x
				if currency == "INR" {
					if tier == "starter" {
						display = "₹4,990"
					} else {
						display = "₹14,990"
					}
				} else {
					if tier == "starter" {
						display = "$290"
					} else {
						display = "$790"
					}
				}
			}

			pricing[tier][cycle] = PricingDetails{
				AmountMinorUnits: amount,
				DisplayAmount:    display,
				Currency:         currency,
			}
		}
	}

	response := PaymentProvidersResponse{
		DetectedCurrency:   currency,
		DetectedCountry:    country,
		AvailableProviders: providers,
		Pricing:            pricing,
	}

	return c.JSON(response)
}
