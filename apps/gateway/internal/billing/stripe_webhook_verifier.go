//go:build commercial

package billing

import (
	"fmt"

	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/webhook"
)

// VerifyStripeSignature verifies the webhook signature from Stripe
// Uses Stripe's built-in webhook signature verification
func VerifyStripeSignature(payload []byte, signature, secret string) (*stripe.Event, error) {
	if secret == "" {
		return nil, fmt.Errorf("webhook secret not configured")
	}

	if signature == "" {
		return nil, fmt.Errorf("missing signature header")
	}

	// Use Stripe's webhook.ConstructEvent to verify and parse
	event, err := webhook.ConstructEvent(payload, signature, secret)
	if err != nil {
		return nil, fmt.Errorf("webhook verification failed: %w", err)
	}

	return &event, nil
}
