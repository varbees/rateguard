package rateguard

import (
	"regexp"
	"strings"
)

// ModelPrice is the USD cost per 1,000 tokens for one model, split into the
// prompt (input) and completion (output) rates.
type ModelPrice struct {
	PromptUSDPer1K     float64
	CompletionUSDPer1K float64
}

// PricingProvider resolves a per-1K-token price for a model name. Return
// ok=false to fall through to RateGuard's built-in starter table (and then to
// zero for genuinely unknown models — costs are never fabricated).
//
// This is the same optional-interface pattern as Embedder and EventEmitter:
// bring your own implementation, or use the StaticPricing helper. Costs are
// display/observability estimates only — they never drive enforcement (the
// token budget is token-count based) and never claim to be invoice truth.
type PricingProvider interface {
	PriceFor(model string) (price ModelPrice, ok bool)
}

// StaticPricing is a PricingProvider backed by a fixed map the caller owns —
// the answer to "the model I use isn't in your table." Prices whatever you
// are actually billed, with no network call, no fetched file, no dependency.
//
// Lookups are model-ID normalized: a dated snapshot the provider reports back
// ("gpt-4o-2024-08-06", "claude-sonnet-4-5-20250929", "gemini-2.5-flash-09-2025")
// resolves to the base key you registered ("gpt-4o", ...). Register base names.
type StaticPricing map[string]ModelPrice

// PriceFor implements PricingProvider.
func (p StaticPricing) PriceFor(model string) (ModelPrice, bool) {
	if price, ok := p[model]; ok {
		return price, true
	}
	if price, ok := p[normalizeModelID(model)]; ok {
		return price, true
	}
	return ModelPrice{}, false
}

// Trailing version/date/preview noise that a provider appends to a base model
// ID. Stripped so a dated snapshot matches its base entry. Deliberately does
// NOT strip a bare "-N" segment: that is a minor version ("claude-sonnet-4-5"),
// not noise, and stripping it would resolve to a different, wrong model.
var (
	reISODate     = regexp.MustCompile(`-\d{4}-\d{2}-\d{2}$`) // OpenAI: -2024-08-06
	reCompactDate = regexp.MustCompile(`-\d{8}$`)             // Anthropic: -20250929
	reMonthYear   = regexp.MustCompile(`-\d{2}-\d{4}$`)       // Gemini: -09-2025
)

// normalizeModelID lower-cases a model name and strips trailing date/preview
// suffixes so provider-reported snapshot IDs match a base pricing key. It is
// intentionally conservative — it only removes recognizable date shapes and
// the -preview/-latest/-exp aliases, never meaningful words (mini, nano, lite,
// pro) or minor-version digits.
func normalizeModelID(model string) string {
	m := strings.ToLower(strings.TrimSpace(model))
	for {
		orig := m
		m = reISODate.ReplaceAllString(m, "")
		m = reCompactDate.ReplaceAllString(m, "")
		m = reMonthYear.ReplaceAllString(m, "")
		for _, suffix := range []string{"-preview", "-latest", "-exp"} {
			m = strings.TrimSuffix(m, suffix)
		}
		if m == orig {
			return m
		}
	}
}

// builtinPriceFor looks up the shipped starter table, normalized.
func builtinPriceFor(model string) (ModelPrice, bool) {
	if p, ok := modelPricing2026[model]; ok {
		return ModelPrice{PromptUSDPer1K: p.PromptUSD, CompletionUSDPer1K: p.CompletionUSD}, true
	}
	if p, ok := modelPricing2026[normalizeModelID(model)]; ok {
		return ModelPrice{PromptUSDPer1K: p.PromptUSD, CompletionUSDPer1K: p.CompletionUSD}, true
	}
	return ModelPrice{}, false
}

// estimateCostWith prices a call: caller's PricingProvider first, then the
// built-in starter table (normalized), then zero. Never fabricates a cost.
func estimateCostWith(pricing PricingProvider, model string, promptTokens, completionTokens int64) float64 {
	var price ModelPrice
	var ok bool
	if pricing != nil {
		price, ok = pricing.PriceFor(model)
	}
	if !ok {
		price, ok = builtinPriceFor(model)
	}
	if !ok {
		return 0
	}
	return float64(promptTokens)/1000*price.PromptUSDPer1K + float64(completionTokens)/1000*price.CompletionUSDPer1K
}
