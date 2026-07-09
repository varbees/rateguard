package rateguard

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

// ── Spend Receipts — signed proof of what was actually spent ──
//
// Budget attestation (budget_attestation.go) answers "was this agent
// AUTHORIZED to spend?" A spend receipt answers the other half: "what DID
// it spend?" — an Ed25519-signed, offline-verifiable statement that a key
// consumed N tokens at an estimated cost over a window. Together they
// close the loop: grant → spend → proof. Binding a receipt to the
// attestation chain that authorized the spend is the AttestationTokenID
// field (groundwork — full chain binding lands with attestation v2).
//
// Receipts are caller-fed primitives, like GenAI spans: the caller
// supplies the claims (from its own metering — the outbound transport,
// GenAI spans, or the token budget manager) and a signing key it
// controls. RateGuard does not hold signing keys.
//
// Cross-language discipline (the budget-attestation lesson, learned the
// hard way): the signing payload contains ONLY integers and strings —
// timestamps are unix seconds, money is integer micro-USD. No floats, no
// formatted dates, nothing a runtime can render two ways.
// conformance/spend_receipt_vectors.json holds byte-exact payload and
// signature vectors all three SDKs must reproduce.

// SpendReceiptClaims is the statement a receipt signs.
type SpendReceiptClaims struct {
	// Key is the budget/limiter key the spend was accounted under.
	Key string `json:"key"`
	// Provider and Model scope the claim; empty means an aggregate over
	// the key.
	Provider string `json:"provider,omitempty"`
	Model    string `json:"model,omitempty"`
	// Window bounds in unix seconds UTC: [start, end).
	WindowStartUnix int64 `json:"window_start_unix"`
	WindowEndUnix   int64 `json:"window_end_unix"`
	InputTokens     int64 `json:"input_tokens"`
	OutputTokens    int64 `json:"output_tokens"`
	TotalTokens     int64 `json:"total_tokens"`
	// EstimatedCostMicroUSD is integer micro-USD (1 USD = 1_000_000).
	// Estimates come from the pricing table — this is an estimate, not a
	// provider invoice; reconcile against billing for accounting truth.
	EstimatedCostMicroUSD int64 `json:"estimated_cost_micro_usd"`
	// PolicyPreset names the policy active during the window.
	PolicyPreset string `json:"policy_preset,omitempty"`
	// AttestationTokenID optionally binds this receipt to the budget
	// attestation token that authorized the spend. Empty = unbound.
	AttestationTokenID string `json:"attestation_token_id,omitempty"`
}

func (c SpendReceiptClaims) validate() error {
	if c.Key == "" {
		return errors.New("rateguard: receipt claims need a key")
	}
	if c.WindowEndUnix <= c.WindowStartUnix {
		return fmt.Errorf("rateguard: receipt window end (%d) must be after start (%d)", c.WindowEndUnix, c.WindowStartUnix)
	}
	if c.InputTokens < 0 || c.OutputTokens < 0 || c.TotalTokens < 0 || c.EstimatedCostMicroUSD < 0 {
		return errors.New("rateguard: receipt token/cost claims must be non-negative")
	}
	return nil
}

// SpendReceipt is a signed SpendReceiptClaims.
type SpendReceipt struct {
	Claims       SpendReceiptClaims `json:"claims"`
	IssuedAtUnix int64              `json:"issued_at_unix"`
	// IssuerPublicKey is the Ed25519 public key the signature verifies
	// under (base64 raw 32 bytes in JSON). Carried for transport;
	// verifiers must still pin the key they trust — see
	// VerifySpendReceipt.
	IssuerPublicKey []byte `json:"issuer_public_key"`
	Signature       []byte `json:"signature"`
}

// receiptSigningPayload builds the canonical bytes the signature covers.
// Fixed-field struct marshal — field order is fixed by the struct, every
// value is an integer or string, so all three SDKs produce identical
// bytes (asserted by conformance vectors).
func receiptSigningPayload(claims SpendReceiptClaims, issuedAtUnix int64, issuerPub ed25519.PublicKey) []byte {
	payload := struct {
		V                     string `json:"v"`
		Key                   string `json:"key"`
		Provider              string `json:"provider"`
		Model                 string `json:"model"`
		WindowStartUnix       int64  `json:"window_start_unix"`
		WindowEndUnix         int64  `json:"window_end_unix"`
		InputTokens           int64  `json:"input_tokens"`
		OutputTokens          int64  `json:"output_tokens"`
		TotalTokens           int64  `json:"total_tokens"`
		EstimatedCostMicroUSD int64  `json:"estimated_cost_micro_usd"`
		PolicyPreset          string `json:"policy_preset"`
		AttestationTokenID    string `json:"attestation_token_id"`
		IssuedAtUnix          int64  `json:"issued_at_unix"`
		IssuerPublicKey       string `json:"issuer_public_key"`
	}{
		V:                     "rateguard-spend-receipt/1",
		Key:                   claims.Key,
		Provider:              claims.Provider,
		Model:                 claims.Model,
		WindowStartUnix:       claims.WindowStartUnix,
		WindowEndUnix:         claims.WindowEndUnix,
		InputTokens:           claims.InputTokens,
		OutputTokens:          claims.OutputTokens,
		TotalTokens:           claims.TotalTokens,
		EstimatedCostMicroUSD: claims.EstimatedCostMicroUSD,
		PolicyPreset:          claims.PolicyPreset,
		AttestationTokenID:    claims.AttestationTokenID,
		IssuedAtUnix:          issuedAtUnix,
		IssuerPublicKey:       base64.StdEncoding.EncodeToString(issuerPub),
	}
	// Marshal of this fixed, map-free struct cannot fail.
	encoded, _ := json.Marshal(payload)
	return encoded
}

// IssueSpendReceipt signs claims with the issuer's private key, stamped
// with the current time.
func IssueSpendReceipt(issuerPrivateKey ed25519.PrivateKey, claims SpendReceiptClaims) (*SpendReceipt, error) {
	return IssueSpendReceiptAt(issuerPrivateKey, claims, time.Now())
}

// IssueSpendReceiptAt is IssueSpendReceipt with an explicit issue time —
// for deterministic tests and conformance vectors.
func IssueSpendReceiptAt(issuerPrivateKey ed25519.PrivateKey, claims SpendReceiptClaims, issuedAt time.Time) (*SpendReceipt, error) {
	if len(issuerPrivateKey) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("rateguard: issuer private key must be %d bytes", ed25519.PrivateKeySize)
	}
	if err := claims.validate(); err != nil {
		return nil, err
	}
	pub, ok := issuerPrivateKey.Public().(ed25519.PublicKey)
	if !ok {
		return nil, errors.New("rateguard: issuer key has no ed25519 public key")
	}
	issuedAtUnix := issuedAt.UTC().Unix()
	payload := receiptSigningPayload(claims, issuedAtUnix, pub)
	return &SpendReceipt{
		Claims:          claims,
		IssuedAtUnix:    issuedAtUnix,
		IssuerPublicKey: append([]byte(nil), pub...),
		Signature:       ed25519.Sign(issuerPrivateKey, payload),
	}, nil
}

// VerifySpendReceipt checks the receipt's signature and claim sanity.
// trustedIssuer pins the public key the caller trusts: when non-nil, the
// receipt's embedded key must match it byte-for-byte. Passing nil skips
// the pinning and proves only integrity under the EMBEDDED key — enough
// for tamper detection, NOT for authenticity (anyone can mint a keypair).
func VerifySpendReceipt(trustedIssuer ed25519.PublicKey, receipt *SpendReceipt) error {
	if receipt == nil {
		return errors.New("rateguard: nil receipt")
	}
	if len(receipt.IssuerPublicKey) != ed25519.PublicKeySize {
		return fmt.Errorf("rateguard: receipt issuer key must be %d bytes", ed25519.PublicKeySize)
	}
	if trustedIssuer != nil && !trustedIssuer.Equal(ed25519.PublicKey(receipt.IssuerPublicKey)) {
		return errors.New("rateguard: receipt issuer key does not match the trusted issuer")
	}
	if err := receipt.Claims.validate(); err != nil {
		return err
	}
	payload := receiptSigningPayload(receipt.Claims, receipt.IssuedAtUnix, receipt.IssuerPublicKey)
	if !ed25519.Verify(ed25519.PublicKey(receipt.IssuerPublicKey), payload, receipt.Signature) {
		return errors.New("rateguard: receipt signature verification failed")
	}
	return nil
}
