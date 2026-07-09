package rateguard

import (
	"encoding/base64"
	"encoding/csv"
	"fmt"
	"io"
	"time"
)

// ── FOCUS export — spend data in the FinOps interchange shape ──
//
// FOCUS (FinOps Open Cost and Usage Specification, focus.finops.org) is
// the column contract enterprise cost tooling ingests. This export is
// FOCUS-ALIGNED: core columns follow the spec (ConsumedQuantity/
// ConsumedUnit are the spec's own home for token usage — FOCUS 1.2's
// virtual-currency work uses GPT tokens as its worked example), and
// RateGuard-specific detail rides in `x_`-prefixed columns, the spec's
// sanctioned extension convention. When FOCUS publishes native token
// columns, this export adopts them — the x_ columns then become aliases.
//
// Honest scope: costs here are RateGuard's pricing-table ESTIMATES of
// LLM spend observed in-process, not a provider invoice. BilledCost is
// deliberately 0 — RateGuard bills nothing; EffectiveCost carries the
// estimate. Reconcile against provider billing for accounting truth.

// FOCUSRow is one charge-period row. Field order here is the CSV column
// order.
type FOCUSRow struct {
	ChargePeriodStart string  // ISO 8601 UTC
	ChargePeriodEnd   string  // ISO 8601 UTC
	ChargeCategory    string  // "Usage"
	ChargeDescription string
	BilledCost        float64 // always 0 — RateGuard is not the biller
	EffectiveCost     float64 // estimated USD
	BillingCurrency   string  // "USD"
	ProviderName      string  // LLM provider ("openai", ...)
	ServiceName       string  // "LLM Inference"
	ServiceCategory   string  // "AI and Machine Learning" (FOCUS category)
	ResourceID        string  // the RateGuard key
	SkuID             string  // model name
	ConsumedQuantity  float64 // total tokens
	ConsumedUnit      string  // "tokens"

	// x_ extension columns (FOCUS custom-column convention).
	XInputTokens        int64
	XOutputTokens       int64
	XPolicyPreset       string
	XAttestationTokenID string
	XReceiptSignature   string // base64; ties the row back to its receipt
}

// focusHeader is the exact CSV header row, in FOCUSRow field order.
var focusHeader = []string{
	"ChargePeriodStart", "ChargePeriodEnd", "ChargeCategory", "ChargeDescription",
	"BilledCost", "EffectiveCost", "BillingCurrency",
	"ProviderName", "ServiceName", "ServiceCategory",
	"ResourceId", "SkuId", "ConsumedQuantity", "ConsumedUnit",
	"x_rateguard_input_tokens", "x_rateguard_output_tokens",
	"x_rateguard_policy_preset", "x_rateguard_attestation_token_id",
	"x_rateguard_receipt_signature",
}

// FOCUSRowFromReceipt maps a spend receipt onto a FOCUS row.
func FOCUSRowFromReceipt(r *SpendReceipt) FOCUSRow {
	desc := "LLM token usage metered in-process by RateGuard"
	if r.Claims.Model != "" {
		desc = fmt.Sprintf("LLM token usage (%s) metered in-process by RateGuard", r.Claims.Model)
	}
	return FOCUSRow{
		ChargePeriodStart: time.Unix(r.Claims.WindowStartUnix, 0).UTC().Format(time.RFC3339),
		ChargePeriodEnd:   time.Unix(r.Claims.WindowEndUnix, 0).UTC().Format(time.RFC3339),
		ChargeCategory:    "Usage",
		ChargeDescription: desc,
		BilledCost:        0,
		EffectiveCost:     float64(r.Claims.EstimatedCostMicroUSD) / 1e6,
		BillingCurrency:   "USD",
		ProviderName:      r.Claims.Provider,
		ServiceName:       "LLM Inference",
		ServiceCategory:   "AI and Machine Learning",
		ResourceID:        r.Claims.Key,
		SkuID:             r.Claims.Model,
		ConsumedQuantity:  float64(r.Claims.TotalTokens),
		ConsumedUnit:      "tokens",

		XInputTokens:        r.Claims.InputTokens,
		XOutputTokens:       r.Claims.OutputTokens,
		XPolicyPreset:       r.Claims.PolicyPreset,
		XAttestationTokenID: r.Claims.AttestationTokenID,
		XReceiptSignature:   encodeBase64(r.Signature),
	}
}

// WriteFOCUSCSV writes a header plus one line per row.
func WriteFOCUSCSV(w io.Writer, rows []FOCUSRow) error {
	cw := csv.NewWriter(w)
	if err := cw.Write(focusHeader); err != nil {
		return fmt.Errorf("rateguard: write FOCUS header: %w", err)
	}
	for i, r := range rows {
		record := []string{
			r.ChargePeriodStart, r.ChargePeriodEnd, r.ChargeCategory, r.ChargeDescription,
			formatFloat(r.BilledCost), formatFloat(r.EffectiveCost), r.BillingCurrency,
			r.ProviderName, r.ServiceName, r.ServiceCategory,
			r.ResourceID, r.SkuID, formatFloat(r.ConsumedQuantity), r.ConsumedUnit,
			fmt.Sprintf("%d", r.XInputTokens), fmt.Sprintf("%d", r.XOutputTokens),
			r.XPolicyPreset, r.XAttestationTokenID, r.XReceiptSignature,
		}
		if err := cw.Write(record); err != nil {
			return fmt.Errorf("rateguard: write FOCUS row %d: %w", i, err)
		}
	}
	cw.Flush()
	return cw.Error()
}

func formatFloat(f float64) string {
	return fmt.Sprintf("%g", f)
}

func encodeBase64(b []byte) string {
	if len(b) == 0 {
		return ""
	}
	return base64.StdEncoding.EncodeToString(b)
}
