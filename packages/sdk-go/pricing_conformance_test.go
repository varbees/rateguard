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
type pricingTier struct {
	Input             float64  `json:"input"`
	Output            float64  `json:"output"`
	CacheRead         *float64 `json:"cacheRead"`
	CacheWrite        *float64 `json:"cacheWrite"`
	CacheWriteLongTTL *float64 `json:"cacheWriteLongTTL"`
}

// cacheRates returns input, cache-read, write and long-TTL write with the
// documented fallbacks: no cacheRead/cacheWrite → input rate, no
// cacheWriteLongTTL → cacheWrite.
func (t pricingTier) cacheRates() (in, read, write, writeLong float64) {
	in, read, write = t.Input, t.Input, t.Input
	if t.CacheRead != nil {
		read = *t.CacheRead
	}
	if t.CacheWrite != nil {
		write = *t.CacheWrite
	}
	writeLong = write
	if t.CacheWriteLongTTL != nil {
		writeLong = *t.CacheWriteLongTTL
	}
	return in, read, write, writeLong
}

type pricingRow struct {
	pricingTier
	ID          string `json:"id"`
	ExactOnly   bool   `json:"exactOnly"`
	LongContext *struct {
		pricingTier
		AboveTokens int64 `json:"aboveTokens"`
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

func TestConformancePricingCacheRates(t *testing.T) {
	for _, r := range loadPricingRows(t) {
		// 1,000 fresh + 2,000 read + 3,000 written (1,000 of them at the long TTL).
		in, read, write, writeLong := r.cacheRates()
		u := TokenUsage{InputTokens: 6000, CacheReadTokens: 2000, CacheWriteTokens: 3000, CacheWriteLongTTLTokens: 1000}
		want := (1000*in + 2000*read + 2000*write + 1000*writeLong) / 1e6
		if got := EstimateUsageCost(r.ID, u); !approx(got, want) {
			t.Errorf("%s: cache cost = %v, want %v", r.ID, got, want)
		}
		if r.LongContext == nil {
			continue
		}
		// The tier is chosen on the whole prompt, cached parts included.
		at := r.LongContext.AboveTokens
		in, read, write, writeLong = r.LongContext.cacheRates()
		u.InputTokens = at + 1
		want = (float64(at+1-5000)*in + 2000*read + 2000*write + 1000*writeLong) / 1e6
		if got := EstimateUsageCost(r.ID, u); !approx(got, want) {
			t.Errorf("%s long tier: cache cost = %v, want %v", r.ID, got, want)
		}
	}
}

func TestConformancePricingProviderCacheRates(t *testing.T) {
	u := TokenUsage{InputTokens: 3000, CacheReadTokens: 1000, CacheWriteTokens: 1000, CacheWriteLongTTLTokens: 500}
	// A caller's ModelPrice without cache rates (every pre-0.5.3 literal)
	// bills cache tokens at the input rate.
	plain := StaticPricing{"m": {PromptUSDPer1K: 1, CompletionUSDPer1K: 2}}
	if got := estimateUsageCostWith(plain, "m", u); !approx(got, 3) {
		t.Errorf("plain caller price: %v, want 3", got)
	}
	cached := StaticPricing{"m": {PromptUSDPer1K: 1, CompletionUSDPer1K: 2, CacheReadUSDPer1K: 0.1, CacheWriteUSDPer1K: 1.25, CacheWriteLongTTLUSDPer1K: 2}}
	if got, want := estimateUsageCostWith(cached, "m", u), 1+0.1+0.625+1.0; !approx(got, want) {
		t.Errorf("caller cache rates: %v, want %v", got, want)
	}
}
