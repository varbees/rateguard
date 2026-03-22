//go:build commercial

package billing

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

// VerifyRazorpaySignature verifies the webhook signature from Razorpay
// Uses HMAC-SHA256 with constant-time comparison to prevent timing attacks
func VerifyRazorpaySignature(payload []byte, signature, secret string) error {
	if secret == "" {
		return fmt.Errorf("webhook secret not configured")
	}

	if signature == "" {
		return fmt.Errorf("missing signature header")
	}

	// Create HMAC-SHA256 hash
	h := hmac.New(sha256.New, []byte(secret))
	h.Write(payload)
	expectedSignature := hex.EncodeToString(h.Sum(nil))

	// Constant-time comparison to prevent timing attacks
	if !hmac.Equal([]byte(signature), []byte(expectedSignature)) {
		return fmt.Errorf("signature mismatch: webhook authentication failed")
	}

	return nil
}
