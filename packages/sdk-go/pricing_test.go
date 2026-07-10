package rateguard

import "testing"

func TestNormalizeModelID(t *testing.T) {
	cases := map[string]string{
		"gpt-4o-2024-08-06":        "gpt-4o",                // OpenAI ISO snapshot
		"gpt-4.1-2025-04-14":       "gpt-4.1",               // OpenAI, dotted version kept
		"o3-2025-04-16":            "o3",                    // OpenAI reasoning snapshot
		"claude-sonnet-4-20250514": "claude-sonnet-4",       // Anthropic compact date
		"claude-opus-4-5-20251101": "claude-opus-4-5",       // Anthropic date, minor kept
		"gemini-2.5-flash-09-2025": "gemini-2.5-flash",      // Gemini MM-YYYY
		"gemini-2.5-flash-preview": "gemini-2.5-flash",      // Gemini preview alias
		"gemini-2.5-flash-latest":  "gemini-2.5-flash",      // Gemini latest alias
		"GPT-4O":                   "gpt-4o",                // case-folded
		"gpt-4o-mini":              "gpt-4o-mini",           // meaningful word NOT stripped
		"o4-mini":                  "o4-mini",               // meaningful word NOT stripped
		"claude-sonnet-4-5":        "claude-sonnet-4-5",     // bare minor version NOT stripped
		"gemini-2.5-flash-lite":    "gemini-2.5-flash-lite", // lite NOT stripped
		"my-custom-finetune":       "my-custom-finetune",    // unknown left intact
	}
	for in, want := range cases {
		if got := normalizeModelID(in); got != want {
			t.Errorf("normalizeModelID(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestBuiltinPricingMatchesDatedSnapshot(t *testing.T) {
	// A provider-reported dated ID must resolve to the base table entry —
	// otherwise every real streaming response prices at $0.
	bare := EstimateCost("gpt-4o", 1000, 1000)
	dated := EstimateCost("gpt-4o-2024-08-06", 1000, 1000)
	if bare == 0 {
		t.Fatal("gpt-4o should have a built-in price")
	}
	if dated != bare {
		t.Errorf("dated snapshot priced %v, base priced %v — normalization not applied", dated, bare)
	}
}

func TestStaticPricingProviderOverridesAndFallsThrough(t *testing.T) {
	p := StaticPricing{
		"my-model": {PromptUSDPer1K: 0.001, CompletionUSDPer1K: 0.002},
		"gpt-4o":   {PromptUSDPer1K: 1.0, CompletionUSDPer1K: 2.0}, // override the built-in
	}

	// Custom model the built-in table has never heard of.
	if got := estimateCostWith(p, "my-model", 1000, 1000); got != 0.001+0.002 {
		t.Errorf("custom model cost = %v, want %v", got, 0.003)
	}
	// User override wins over the built-in table.
	if got := estimateCostWith(p, "gpt-4o", 1000, 1000); got != 1.0+2.0 {
		t.Errorf("override cost = %v, want 3.0", got)
	}
	// A dated snapshot of the overridden model still resolves via normalization.
	if got := estimateCostWith(p, "gpt-4o-2024-08-06", 1000, 1000); got != 3.0 {
		t.Errorf("dated override cost = %v, want 3.0", got)
	}
	// Provider miss falls through to the built-in table.
	if got := estimateCostWith(p, "claude-sonnet-4", 1000, 1000); got == 0 {
		t.Error("provider miss should fall through to the built-in table, got 0")
	}
	// Genuinely unknown everywhere → zero, never fabricated.
	if got := estimateCostWith(p, "totally-unknown-model", 1000, 1000); got != 0 {
		t.Errorf("unknown model cost = %v, want 0", got)
	}
}
