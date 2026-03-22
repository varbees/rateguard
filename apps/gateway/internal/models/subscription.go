package models

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	ErrSubscriptionNotFound = errors.New("subscription not found")
)

// Subscription represents a user's billing subscription
type Subscription struct {
	ID                     uuid.UUID  `json:"id" db:"id"`
	UserID                 uuid.UUID  `json:"user_id" db:"user_id"`
	PlanTier               string     `json:"plan_tier" db:"plan_tier" validate:"oneof=free starter pro"`
	BillingCycle           string     `json:"billing_cycle" db:"billing_cycle" validate:"oneof=monthly annual"`
	AmountMinorUnits       int        `json:"amount_minor_units" db:"amount_minor_units"` // cents/paise
	Currency               string     `json:"currency" db:"currency" validate:"oneof=INR USD"`
	PaymentProvider        string     `json:"payment_provider" db:"payment_provider" validate:"oneof=stripe razorpay manual"`
	ExternalSubscriptionID *string    `json:"external_subscription_id,omitempty" db:"external_subscription_id"`
	ExternalCustomerID     *string    `json:"external_customer_id,omitempty" db:"external_customer_id"`
	Status                 string     `json:"status" db:"status" validate:"oneof=active past_due canceled trial"`
	TrialEndsAt            *time.Time `json:"trial_ends_at,omitempty" db:"trial_ends_at"`
	CurrentPeriodStart     time.Time  `json:"current_period_start" db:"current_period_start"`
	CurrentPeriodEnd       time.Time  `json:"current_period_end" db:"current_period_end"`
	CanceledAt             *time.Time `json:"canceled_at,omitempty" db:"canceled_at"`
	CreatedAt              time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt              time.Time  `json:"updated_at" db:"updated_at"`
}

// Invoice represents a billing invoice
type Invoice struct {
	ID                   uuid.UUID  `json:"id" db:"id"`
	SubscriptionID       uuid.UUID  `json:"subscription_id" db:"subscription_id"`
	UserID               uuid.UUID  `json:"user_id" db:"user_id"`
	AmountMinorUnits     int        `json:"amount_minor_units" db:"amount_minor_units"`
	Currency             string     `json:"currency" db:"currency" validate:"oneof=INR USD"`
	Status               string     `json:"status" db:"status" validate:"oneof=draft open paid void uncollectible"`
	PaymentProvider      string     `json:"payment_provider" db:"payment_provider"`
	ExternalInvoiceID    *string    `json:"external_invoice_id,omitempty" db:"external_invoice_id"`
	HostedInvoiceURL     *string    `json:"hosted_invoice_url,omitempty" db:"hosted_invoice_url"`
	InvoicePDFURL        *string    `json:"invoice_pdf_url,omitempty" db:"invoice_pdf_url"`
	DueDate              *time.Time `json:"due_date,omitempty" db:"due_date"`
	PaidAt               *time.Time `json:"paid_at,omitempty" db:"paid_at"`
	CreatedAt            time.Time  `json:"created_at" db:"created_at"`
}

// PaymentMethod represents a stored payment method
type PaymentMethod struct {
	ID                        uuid.UUID `json:"id" db:"id"`
	UserID                    uuid.UUID `json:"user_id" db:"user_id"`
	PaymentProvider           string    `json:"payment_provider" db:"payment_provider"`
	ExternalPaymentMethodID   string    `json:"external_payment_method_id" db:"external_payment_method_id"`
	Type                      string    `json:"type" db:"type" validate:"oneof=card upi netbanking"`
	Last4                     *string   `json:"last4,omitempty" db:"last4"`
	Brand                     *string   `json:"brand,omitempty" db:"brand"` // visa, mastercard, upi
	ExpMonth                  *int      `json:"exp_month,omitempty" db:"exp_month"`
	ExpYear                   *int      `json:"exp_year,omitempty" db:"exp_year"`
	IsDefault                 bool      `json:"is_default" db:"is_default"`
	CreatedAt                 time.Time `json:"created_at" db:"created_at"`
}

// Coupon represents a discount code
type Coupon struct {
	ID                   uuid.UUID  `json:"id" db:"id"`
	Code                 string     `json:"code" db:"code" validate:"required,min=3,max=50"`
	PercentOff           *int       `json:"percent_off,omitempty" db:"percent_off" validate:"omitempty,min=1,max=100"`
	AmountOffMinorUnits  *int       `json:"amount_off_minor_units,omitempty" db:"amount_off_minor_units"`
	Currency             *string    `json:"currency,omitempty" db:"currency" validate:"omitempty,oneof=INR USD"`
	ValidFrom            time.Time  `json:"valid_from" db:"valid_from"`
	ValidUntil           *time.Time `json:"valid_until,omitempty" db:"valid_until"`
	MaxRedemptions       *int       `json:"max_redemptions,omitempty" db:"max_redemptions"`
	TimesRedeemed        int        `json:"times_redeemed" db:"times_redeemed"`
	CreatedAt            time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at" db:"updated_at"`
}

// CouponRedemption tracks which users used which coupons
type CouponRedemption struct {
	ID             uuid.UUID `json:"id" db:"id"`
	CouponID       uuid.UUID `json:"coupon_id" db:"coupon_id"`
	SubscriptionID uuid.UUID `json:"subscription_id" db:"subscription_id"`
	UserID         uuid.UUID `json:"user_id" db:"user_id"`
	RedeemedAt     time.Time `json:"redeemed_at" db:"redeemed_at"`
}

// PlanFeatures defines feature limits per plan tier
type PlanFeatures struct {
	MaxAPIs              int   `json:"max_apis"`
	MaxRequestsPerDay    int64 `json:"max_requests_per_day"`
	MaxRequestsPerMonth  int64 `json:"max_requests_per_month"`
	MaxTokensPerMonth    int64 `json:"max_tokens_per_month"`
	AdvancedAnalytics    bool  `json:"advanced_analytics"`
	PrioritySupport      bool  `json:"priority_support"`
	CustomRateLimits     bool  `json:"custom_rate_limits"`
	Webhooks             bool  `json:"webhooks"`
	APIAccess            bool  `json:"api_access"`
	AnalyticsRetentionDays int `json:"analytics_retention_days"`
}

// PlanLimits defines the feature matrix for each plan tier
var PlanLimits = map[string]PlanFeatures{
	"free": {
		MaxAPIs:              3,
		MaxRequestsPerDay:    1000000, // High limit to avoid daily lockouts, monthly is primary limit
		MaxRequestsPerMonth:  100000,
		MaxTokensPerMonth:    100000, // 100K tokens (~50 GPT-3.5 conversations)
		AdvancedAnalytics:    false,
		PrioritySupport:      false,
		CustomRateLimits:     false,
		Webhooks:             false,
		APIAccess:            false,
		AnalyticsRetentionDays: 7,
	},
	"starter": {
		MaxAPIs:              10,
		MaxRequestsPerDay:    10000000, // High limit to avoid daily lockouts, monthly is primary limit
		MaxRequestsPerMonth:  1000000,
		MaxTokensPerMonth:    10000000, // 10M tokens (moderate LLM usage)
		AdvancedAnalytics:    true,
		PrioritySupport:      false,
		CustomRateLimits:     true,
		Webhooks:             false,
		APIAccess:            false,
		AnalyticsRetentionDays: 30,
	},
	"pro": {
		MaxAPIs:              0, // 0 = unlimited
		MaxRequestsPerDay:    100000000, // Very high limit to avoid daily lockouts
		MaxRequestsPerMonth:  10000000,
		MaxTokensPerMonth:    100000000, // 100M tokens (enterprise-grade)
		AdvancedAnalytics:    true,
		PrioritySupport:      true,
		CustomRateLimits:     true,
		Webhooks:             true,
		APIAccess:            true,
		AnalyticsRetentionDays: 90,
	},
}

// GetPlanFeatures returns features for a given plan tier
func GetPlanFeatures(tier string) PlanFeatures {
	if features, ok := PlanLimits[tier]; ok {
		return features
	}
	return PlanLimits["free"]
}

// PricingInfo represents pricing for a plan in a specific region
type PricingInfo struct {
	PlanTier         string `json:"plan_tier"`
	Currency         string `json:"currency"`
	AmountMinorUnits int    `json:"amount_minor_units"`
	DisplayAmount    string `json:"display_amount"` // "₹499" or "$19"
}

// GetPricingByRegion returns pricing based on currency
func GetPricingByRegion(tier string, currency string) PricingInfo {
	pricing := map[string]map[string]PricingInfo{
		"INR": {
			"free":    {PlanTier: "free", Currency: "INR", AmountMinorUnits: 0, DisplayAmount: "₹0"},
			"starter": {PlanTier: "starter", Currency: "INR", AmountMinorUnits: 49900, DisplayAmount: "₹499"},
			"pro":     {PlanTier: "pro", Currency: "INR", AmountMinorUnits: 149900, DisplayAmount: "₹1,499"},
		},
		"USD": {
			"free":    {PlanTier: "free", Currency: "USD", AmountMinorUnits: 0, DisplayAmount: "$0"},
			"starter": {PlanTier: "starter", Currency: "USD", AmountMinorUnits: 2900, DisplayAmount: "$29"},
			"pro":     {PlanTier: "pro", Currency: "USD", AmountMinorUnits: 7900, DisplayAmount: "$79"},
		},
	}

	if currencyPricing, ok := pricing[currency]; ok {
		if price, ok := currencyPricing[tier]; ok {
			return price
		}
	}

	// Default to USD free plan
	return pricing["USD"]["free"]
}

// CreateSubscriptionRequest represents subscription creation payload
type CreateSubscriptionRequest struct {
	PlanTier        string `json:"plan_tier" validate:"required,oneof=free starter pro"`
	BillingCycle    string `json:"billing_cycle" validate:"required,oneof=monthly annual"`
	PaymentMethodID string `json:"payment_method_id" validate:"required_if=PlanTier starter pro"`
	CouponCode      string `json:"coupon_code,omitempty"`
}

// UpdateSubscriptionRequest represents subscription update payload
type UpdateSubscriptionRequest struct {
	PlanTier     *string `json:"plan_tier,omitempty" validate:"omitempty,oneof=free starter pro"`
	BillingCycle *string `json:"billing_cycle,omitempty" validate:"omitempty,oneof=monthly annual"`
	CancelAtEnd  *bool   `json:"cancel_at_end,omitempty"`
}

// SubscriptionResponse includes subscription with pricing info
type SubscriptionResponse struct {
	Subscription *Subscription `json:"subscription"`
	Features     PlanFeatures  `json:"features"`
	Pricing      PricingInfo   `json:"pricing"`
}
