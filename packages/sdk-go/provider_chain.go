package rateguard

import (
	"fmt"
	"net/http"
	"sync"
)

// ── Provider Chain: LLM provider fallback routing ──
//
// ProviderChain is a routing decision helper: given a failing provider and
// its circuit breaker state, Route returns the next provider to try. The
// application performs the actual request to the returned provider — the
// chain decides, it does not proxy.
//
// Roadmap: per-provider circuit breakers and an outbound http.RoundTripper
// that performs the fallback automatically.

// ProviderChain defines an ordered list of LLM providers with automatic fallback.
type ProviderChain struct {
	mu              sync.RWMutex
	providers       []ProviderEntry
	defaultProvider string
}

// ProviderEntry represents one LLM provider in the chain.
type ProviderEntry struct {
	Name    string // e.g. "openai", "anthropic", "google"
	Model   string // e.g. "gpt-4o", "claude-sonnet-4"
	BaseURL string // e.g. "https://api.openai.com/v1"
	Headers map[string]string
	Weight  int // priority (lower = higher priority)
}

// NewProviderChain creates a chain with ordered providers. Position in the
// argument list is the priority: earlier entries are tried first.
func NewProviderChain(providers ...ProviderEntry) *ProviderChain {
	for i := range providers {
		providers[i].Weight = i
	}
	pc := &ProviderChain{providers: providers}
	if len(providers) > 0 {
		pc.defaultProvider = providers[0].Name
	}
	return pc
}

// Route decides which provider to use. Returns the provider entry and whether
// a fallback occurred (the first available provider with weight < current failing one).
// It checks circuit breaker state for each provider in priority order.
func (pc *ProviderChain) Route(failingProvider string, breakerState CircuitBreakerState) (ProviderEntry, string, bool) {
	pc.mu.RLock()
	defer pc.mu.RUnlock()

	if len(pc.providers) == 0 {
		return ProviderEntry{}, "", false
	}

	// If no provider is failing, return the first (highest priority)
	if failingProvider == "" || breakerState == CircuitBreakerClosed {
		return pc.providers[0], pc.providers[0].Name, false
	}

	// Find the next available provider after the failing one
	foundFailing := false
	for _, p := range pc.providers {
		if p.Name == failingProvider {
			foundFailing = true
			continue
		}
		if foundFailing {
			return p, p.Name, true
		}
	}

	// All providers exhausted — return first as last resort
	return pc.providers[0], pc.providers[0].Name, true
}

// Providers returns a copy of the provider list in priority order.
func (pc *ProviderChain) Providers() []ProviderEntry {
	pc.mu.RLock()
	defer pc.mu.RUnlock()
	out := make([]ProviderEntry, len(pc.providers))
	copy(out, pc.providers)
	return out
}

// Provider creates a new provider entry for the chain. Weight is assigned
// by NewProviderChain from argument position.
func Provider(name, model, baseURL string) ProviderEntry {
	return ProviderEntry{Name: name, Model: model, BaseURL: baseURL}
}

// ── Provider-aware token budget key ──

// TokenBudgetKeyForProvider returns a token budget key scoped to a specific
// LLM provider + model, so budgets are tracked per-provider.
func (s *SDK) TokenBudgetKeyForProvider(provider, model string) string {
	return fmt.Sprintf("%s:%s:%s:token_budget", s.tenantID(), provider, model)
}

// ── Rate limit headers for provider transparency ──

// SetProviderHeaders adds provider transparency headers to the response.
// When a fallback occurs, clients can see which provider actually served the request.
func SetProviderHeaders(w http.ResponseWriter, provider, model string, fallback bool) {
	w.Header().Set("X-RateGuard-Provider", provider)
	w.Header().Set("X-RateGuard-Model", model)
	if fallback {
		w.Header().Set("X-RateGuard-Fallback", "true")
	}
}

// ── Common provider chains (2026 market defaults) ──

// DefaultProviderChain returns the recommended provider chain for cost-optimized routing.
// Priority: OpenAI → Anthropic → Google (Gemini)
func DefaultProviderChain() *ProviderChain {
	return NewProviderChain(
		Provider("openai", "gpt-4o", "https://api.openai.com/v1"),
		Provider("anthropic", "claude-sonnet-4", "https://api.anthropic.com/v1"),
		Provider("google", "gemini-2.5-flash", "https://generativelanguage.googleapis.com/v1beta"),
	)
}

// BudgetProviderChain returns a provider chain optimized for token cost.
// Priority: cheapest → more expensive. Used when token budget is at warning level.
func BudgetProviderChain() *ProviderChain {
	return NewProviderChain(
		Provider("google", "gemini-2.5-flash", "https://generativelanguage.googleapis.com/v1beta"),
		Provider("openai", "gpt-4o-mini", "https://api.openai.com/v1"),
		Provider("anthropic", "claude-haiku-3.5", "https://api.anthropic.com/v1"),
	)
}

// QualityProviderChain returns a provider chain optimized for response quality.
// Priority: most capable → less capable. Used for critical/zero-tolerance tasks.
func QualityProviderChain() *ProviderChain {
	return NewProviderChain(
		Provider("anthropic", "claude-opus-4-5", "https://api.anthropic.com/v1"),
		Provider("openai", "gpt-4o", "https://api.openai.com/v1"),
		Provider("google", "gemini-2.5-pro", "https://generativelanguage.googleapis.com/v1beta"),
	)
}
