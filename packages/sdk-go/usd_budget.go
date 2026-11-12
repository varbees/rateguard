package rateguard

import (
	"fmt"
	"math"
	"time"
)

// USD budgets (0.6, docs/specs/0.6-usd-budgets.md).
//
// Money is integer micro-USD everywhere after config load. Two float steps are
// DEFINED as IEEE-754 double operations, identical in Go, Node and Python:
//
//	USDToMicro(usd)          = floor(usd*1e6 + 0.5)
//	rateMicroPerM(usdPer1K)  = floor(usdPer1K*1e9 + 0.5)   // micro-USD per 1M tokens
//
// Everything after that is exact integer arithmetic, rounded UP once:
//
//	reserve = ceil((prompt*max(input, cacheWrite, cacheWriteLongTTL) + output*output) / 1e6)
//	cost    = ceil((fresh*input + read*cacheRead + (write-writeLong)*cacheWrite
//	               + writeLong*cacheWriteLongTTL + output*output) / 1e6)
//
// The reservation prices every prompt token at the HIGHEST input rate the call
// could be billed at, so a cache-write premium can never push the real cost past
// what was reserved. conformance/usd_budget_vectors.json pins all of it.
//
// These are estimates from RateGuard's price table, not the provider's invoice.

// USDBudgetConfig is the estimated-USD budget for outbound LLM calls. Off unless
// a limit is set. Limits are dollars; New converts them once to micro-USD and
// panics on an invalid config (call Validate first to check). Mirrors Node's
// usdBudget option.
type USDBudgetConfig struct {
	HourLimitUSD  float64
	DayLimitUSD   float64
	MonthLimitUSD float64
	// Mode: hard-stop (default) denies; soft-stop only warns.
	Mode TokenBudgetMode
	// SoftStopAt is the soft-stop warning threshold, a fraction of the limit (default 0.8).
	SoftStopAt float64
	// Scope: "customer" (default; tenant when no customer header), "tenant", or "model".
	Scope string
	// Unpriced: "deny" (default) or "allow-uncounted" (sent, counted as zero, logged).
	Unpriced string
}

// MicroRates is a ModelPrice as integer micro-USD per 1M tokens.
type MicroRates struct {
	Input, Output, CacheRead, CacheWrite, CacheWriteLongTTL int64
}

// USDBudgetState is a read of the estimated-USD budget, in integer micro-USD.
type USDBudgetState struct {
	Applied           bool          `json:"applied"`
	Allowed           bool          `json:"allowed"`
	Key               string        `json:"key"`
	LimitMicroUSD     int64         `json:"limit_micro_usd"`
	RemainingMicroUSD int64         `json:"remaining_micro_usd"` // -1 when no budget applies
	Window            string        `json:"window"`
	RetryAfter        time.Duration `json:"retry_after"`
	Warning           bool          `json:"warning"`
}

const microPerUSD = 1_000_000

// USDToMicro converts dollars to integer micro-USD.
func USDToMicro(usd float64) (int64, error) {
	if math.IsNaN(usd) || math.IsInf(usd, 0) || usd < 0 {
		return 0, fmt.Errorf("rateguard: USD amount must be a finite number >= 0, got %v", usd)
	}
	return int64(math.Floor(usd*1e6 + 0.5)), nil
}

func rateMicroPerM(usdPer1K float64) int64 {
	if usdPer1K <= 0 {
		return 0
	}
	return int64(math.Floor(usdPer1K*1e9 + 0.5))
}

func orMicro(v, fallback int64) int64 {
	if v > 0 {
		return v
	}
	return fallback
}

// MicroRatesFor turns a ModelPrice into integer rates. A missing cache read or
// write rate bills at the input rate; a missing long-TTL write rate at the write rate.
func MicroRatesFor(p ModelPrice) MicroRates {
	in := rateMicroPerM(p.PromptUSDPer1K)
	cw := orMicro(rateMicroPerM(p.CacheWriteUSDPer1K), in)
	return MicroRates{
		Input:             in,
		Output:            rateMicroPerM(p.CompletionUSDPer1K),
		CacheRead:         orMicro(rateMicroPerM(p.CacheReadUSDPer1K), in),
		CacheWrite:        cw,
		CacheWriteLongTTL: orMicro(rateMicroPerM(p.CacheWriteLongTTLUSDPer1K), cw),
	}
}

func ceilMicro(n int64) int64 { return (n + microPerUSD - 1) / microPerUSD }

func nonNeg(n int64) int64 {
	if n > 0 {
		return n
	}
	return 0
}

// ReserveMicroUSD is the micro-USD to hold for a call before it is sent.
func ReserveMicroUSD(r MicroRates, promptTokens, outputTokens int64) int64 {
	inRate := max(r.Input, r.CacheWrite, r.CacheWriteLongTTL)
	return ceilMicro(nonNeg(promptTokens)*inRate + nonNeg(outputTokens)*r.Output)
}

// CostMicroUSD is the estimated micro-USD a call actually cost, from its measured usage.
func CostMicroUSD(r MicroRates, u TokenUsage) int64 {
	read := nonNeg(u.CacheReadTokens)
	write := nonNeg(u.CacheWriteTokens)
	writeLong := min(nonNeg(u.CacheWriteLongTTLTokens), write)
	fresh := max(nonNeg(u.InputTokens)-read-write, 0)
	return ceilMicro(fresh*r.Input + read*r.CacheRead + (write-writeLong)*r.CacheWrite +
		writeLong*r.CacheWriteLongTTL + nonNeg(u.OutputTokens)*r.Output)
}

// USDBudgetKey is the budget key a call draws from. Dollars are comparable across
// models, so the default scope ("customer") drops provider and model.
func USDBudgetKey(scope, tenant, customer, provider, model string) string {
	cust := ""
	if customer != "" {
		cust = ":customer=" + customer
	}
	switch scope {
	case "tenant":
		return tenant + ":usd"
	case "model":
		return tenant + cust + ":" + provider + ":" + nonEmpty(model, "default") + ":usd"
	default:
		return tenant + cust + ":usd"
	}
}

type resolvedUSDBudget struct {
	hour, day, month int64
	mode             TokenBudgetMode
	softStopAt       float64
	scope            string
	unpriced         string
}

// Validate reports why a USDBudgetConfig would be refused by New.
func (c USDBudgetConfig) Validate() error {
	_, err := c.resolve()
	return err
}

func (c USDBudgetConfig) resolve() (*resolvedUSDBudget, error) {
	r := &resolvedUSDBudget{mode: c.Mode, softStopAt: c.SoftStopAt, scope: c.Scope, unpriced: c.Unpriced}
	var err error
	if r.hour, err = USDToMicro(c.HourLimitUSD); err != nil {
		return nil, err
	}
	if r.day, err = USDToMicro(c.DayLimitUSD); err != nil {
		return nil, err
	}
	if r.month, err = USDToMicro(c.MonthLimitUSD); err != nil {
		return nil, err
	}
	if r.mode == "" {
		r.mode = TokenBudgetModeHardStop
	}
	if r.softStopAt == 0 {
		r.softStopAt = 0.8
	}
	if r.scope == "" {
		r.scope = "customer"
	}
	if r.scope != "tenant" && r.scope != "customer" && r.scope != "model" {
		return nil, fmt.Errorf("rateguard: USDBudget.Scope must be tenant, customer or model, got %q", r.scope)
	}
	if r.unpriced == "" {
		r.unpriced = "deny"
	}
	if r.unpriced != "deny" && r.unpriced != "allow-uncounted" {
		return nil, fmt.Errorf("rateguard: USDBudget.Unpriced must be deny or allow-uncounted, got %q", r.unpriced)
	}
	if r.hour <= 0 && r.day <= 0 && r.month <= 0 {
		return nil, nil // no limit: off
	}
	return r, nil
}

func (r *resolvedUSDBudget) policy() PolicyPreset {
	return PolicyPreset{TokenBudgetPerHour: r.hour, TokenBudgetPerDay: r.day, TokenBudgetPerMonth: r.month, TokenBudgetMode: r.mode}
}

// priceForCall: the caller's PricingProvider first, then the built-in table at the
// long-context rate when promptTokens is past the model's threshold.
func priceForCall(pricing PricingProvider, model string, promptTokens int64) (ModelPrice, bool) {
	if pricing != nil {
		if p, ok := pricing.PriceFor(model); ok {
			return p, true
		}
	}
	return builtinPriceForPrompt(model, promptTokens)
}

// USDBudgetState reads the estimated-USD budget a call would draw from, without
// reserving anything (a pre-flight query never consumes). Pass the customer
// (and, under scope "model", provider and model) a call would carry.
func (s *SDK) USDBudgetState(customer, provider, model string) USDBudgetState {
	if s.usdCfg == nil {
		return USDBudgetState{Allowed: true, RemainingMicroUSD: -1}
	}
	key := USDBudgetKey(s.usdCfg.scope, s.tenantID(), customer, provider, model)
	d := s.usd.check(key, s.usdCfg.policy())
	warning := false
	if s.usdCfg.mode == TokenBudgetModeSoftStop && d.Limit > 0 {
		used := d.Limit - max(d.Remaining, 0)
		warning = float64(used) >= float64(d.Limit)*s.usdCfg.softStopAt
	}
	return USDBudgetState{
		Applied: d.Applied, Allowed: d.Allowed || s.usdCfg.mode == TokenBudgetModeSoftStop, Key: key,
		LimitMicroUSD: d.Limit, RemainingMicroUSD: d.Remaining, Window: d.Window, RetryAfter: d.RetryAfter, Warning: warning,
	}
}
