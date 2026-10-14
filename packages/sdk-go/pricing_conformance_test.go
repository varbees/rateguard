package rateguard

import (
	"encoding/json"
	"math"
	"os"
	"testing"
)

// conformance/pricing.json is the single source of the built-in price table;
// all three SDKs replay it. A row that prices differently in any SDK, or a
// current model that prices at $0, fails here.
type pricingRow struct {
	ID          string  `json:"id"`
	Input       float64 `json:"input"`
	Output      float64 `json:"output"`
	ExactOnly   bool    `json:"exactOnly"`
	LongContext *struct {
		AboveTokens int64   `json:"aboveTokens"`
		Input       float64 `json:"input"`
		Output      float64 `json:"output"`
	} `json:"longContext"`
}

func loadPricingRows(t *testing.T) []pricingRow {
	t.Helper()
	data, err := os.ReadFile("../../conformance/pricing.json")
	if err != nil {
		t.Fatalf("read pricing.json: %v", err)
	}
	var doc struct {
		Models []pricingRow `json:"models"`
	}
	if err := json.Unmarshal(data, &doc); err != nil {
		t.Fatalf("parse pricing.json: %v", err)
	}
	return doc.Models
}

func approx(a, b float64) bool { return math.Abs(a-b) < 1e-12 }

func TestConformancePricingEveryRow(t *testing.T) {
	rows := loadPricingRows(t)
	if len(PricedModels()) != len(rows) {
		t.Fatalf("PricedModels() has %d keys, pricing.json has %d rows", len(PricedModels()), len(rows))
	}
	for _, r := range rows {
		want := (r.Input + r.Output) / 1000 // 1,000 tokens each way, price per 1M
		if got := EstimateCost(r.ID, 1000, 1000); !approx(got, want) {
			t.Errorf("%s: EstimateCost = %v, want %v", r.ID, got, want)
		}
		if r.LongContext == nil {
			continue
		}
		at := r.LongContext.AboveTokens
		// Exactly at the threshold is still the base rate.
		if got, want := EstimateCost(r.ID, at, 1000), (float64(at)*r.Input+1000*r.Output)/1e6; !approx(got, want) {
			t.Errorf("%s at %d tokens: %v, want base rate %v", r.ID, at, got, want)
		}
		// One token over and the whole request pays the long rates.
		if got, want := EstimateCost(r.ID, at+1, 1000), (float64(at+1)*r.LongContext.Input+1000*r.LongContext.Output)/1e6; !approx(got, want) {
			t.Errorf("%s at %d tokens: %v, want long rate %v", r.ID, at+1, got, want)
		}
	}
}

func TestConformancePricingCurrentModelsAreNeverFree(t *testing.T) {
	// The IDs providers report for the models people actually run. Each priced
	// at $0 before 0.5.3, which put $0 into signed spend receipts.
	for _, id := range []string{
		"claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1",
		"claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001",
		"gpt-6.1-sol", "gpt-6-astra", "gpt-5.5", "gpt-5.4-mini-2026-03-17",
		"gemini-4-argon", "gemini-3.1-pro-preview", "gemini-2.5-flash",
		"deepseek-v4-pro", "deepseek-flash",
	} {
		if EstimateCost(id, 1000, 1000) <= 0 {
			t.Errorf("%s priced at $0", id)
		}
	}
}

func TestConformancePricingExactOnlySnapshot(t *testing.T) {
	// gpt-4o-2024-05-13 is dearer than gpt-4o; other dated gpt-4o snapshots are not.
	if got := EstimateCost("gpt-4o-2024-05-13", 1000, 1000); !approx(got, (5.0+15.0)/1000) {
		t.Errorf("gpt-4o-2024-05-13 = %v", got)
	}
	if got := EstimateCost("gpt-4o-2024-08-06", 1000, 1000); !approx(got, (2.5+10.0)/1000) {
		t.Errorf("gpt-4o-2024-08-06 = %v", got)
	}
}

func TestConformancePricingProviderPriceIsFlat(t *testing.T) {
	// A caller's PricingProvider is used as given; the built-in long-context
	// tier never overrides a price the caller supplied.
	p := StaticPricing{"claude-haiku-5-5": {PromptUSDPer1K: 1, CompletionUSDPer1K: 1}}
	if got := estimateCostWith(p, "claude-haiku-5-5", 200000, 0); !approx(got, 200) {
		t.Errorf("caller price not applied flat: %v", got)
	}
}
