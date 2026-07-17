package rateguard

import (
	"testing"
	"time"
)

// ── Adversarial inputs — hostile provider responses ──
//
// A provider is not an adversary; a COMPROMISED or BUGGY provider is. These
// probe what happens when the bytes coming back are malformed or malicious.
// The bar is fail-SAFE: when RateGuard cannot trust what it parsed, it must err
// toward CHARGING (protecting the budget), never toward refunding or crashing.
//
// The threat model matters here, because the obvious worry is the wrong one.
// A provider reporting *low* usage (10 tokens for a 10k prompt) is NOT a
// denial-of-wallet: the provider bills what it reports, so under-reporting
// means you are under-billed — the provider's problem, not yours. The budget
// correctly tracks the provider's number because that number IS the money.
//
// The REAL vector is a *negative* or *overflowed* value. If output_tokens=-1e6
// were committed, it would REDUCE recorded usage — a budget refund — and let a
// runaway agent spend more, forever. That is the case these pin.

func TestAdversarialNegativeUsageCannotRefundBudget(t *testing.T) {
	// The dangerous one. A hostile negative must never decrease recorded usage.
	body := []byte(`{"model":"gpt-4o","usage":{"prompt_tokens":-1000000,"completion_tokens":-1000000,"total_tokens":-2000000}}`)

	usage, ok := extractTokenUsageFromBody(body)
	if !ok {
		// Rejecting a nonsensical body outright is a valid fail-safe.
		return
	}
	if usage.InputTokens < 0 || usage.OutputTokens < 0 || usage.TotalTokens < 0 {
		t.Fatalf("negative usage survived extraction (in=%d out=%d total=%d) — committing this "+
			"would REFUND the budget and let an agent spend past its cap",
			usage.InputTokens, usage.OutputTokens, usage.TotalTokens)
	}
}

func TestAdversarialNegativeUsageThroughTheBudget(t *testing.T) {
	// End to end: even if a negative slips through extraction, recording it must
	// not increase the remaining budget. This is the assertion that actually
	// protects money.
	clock := &fakeBudgetClock{now: time.Unix(1_700_000_000, 0)}
	m := newTokenBudgetManager(clock)
	policy := hardStopHourPolicy(1000)

	// Spend 600 legitimately.
	m.record(concurrencyBudgetKey, 600)
	afterLegit := m.check(concurrencyBudgetKey, policy)

	// Now a hostile negative "usage" arrives.
	m.record(concurrencyBudgetKey, -500)
	afterHostile := m.check(concurrencyBudgetKey, policy)

	if afterHostile.Remaining > afterLegit.Remaining {
		t.Fatalf("a negative usage recording INCREASED remaining budget (%d -> %d) — "+
			"that is a refund an attacker controls", afterLegit.Remaining, afterHostile.Remaining)
	}
}

func TestAdversarialHostileUsageValues(t *testing.T) {
	cases := []struct {
		name string
		body string
	}{
		{"string where int", `{"usage":{"prompt_tokens":"99999999","completion_tokens":"1","total_tokens":"1"}}`},
		{"float tokens", `{"usage":{"prompt_tokens":1.5,"completion_tokens":2.5,"total_tokens":4.0}}`},
		{"int64 overflow +1", `{"usage":{"prompt_tokens":9223372036854775808,"completion_tokens":0,"total_tokens":9223372036854775808}}`},
		{"scientific notation", `{"usage":{"prompt_tokens":1e18,"completion_tokens":0,"total_tokens":1e18}}`},
		{"null usage object", `{"usage":null}`},
		{"usage not an object", `{"usage":"lots"}`},
		{"deeply nested garbage", `{"usage":{"prompt_tokens":{"nested":{"evil":true}}}}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// The bar is simply: does not panic, and never yields a negative.
			usage, ok := extractTokenUsageFromBody([]byte(tc.body))
			if ok && (usage.InputTokens < 0 || usage.OutputTokens < 0 || usage.TotalTokens < 0) {
				t.Fatalf("%s produced a negative usage (in=%d out=%d total=%d)",
					tc.name, usage.InputTokens, usage.OutputTokens, usage.TotalTokens)
			}
		})
	}
}

func TestAdversarialMalformedSSE(t *testing.T) {
	// Hostile SSE framing must not crash and must not fabricate usage. The
	// caller's fail-safe (commit the reserved estimate on no-usage) depends on
	// extraction honestly reporting "found nothing" rather than a wrong number.
	cases := []struct {
		name string
		sse  string
	}{
		{"truncated mid-json", "data: {\"usage\":{\"prompt_tokens\":10,\"comple"},
		{"no DONE sentinel", "data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\n"},
		{"data with no space", "data:{\"usage\":{\"total_tokens\":5}}\n\n"},
		{"bare CRLF, no data", "\r\n\r\n\r\n"},
		{"data: prefix only", "data: \n\ndata: \n\n"},
		{"comment lines only", ": keepalive\n: keepalive\n\n"},
		{"event without data", "event: message_start\n\nevent: ping\n\n"},
		{"embedded null bytes", "data: {\"usage\":\x00{\"total_tokens\":5}}\n\n"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// Must not panic. Whatever it returns, a negative is never acceptable.
			usage, ok := extractTokenUsageFromBody([]byte(tc.sse))
			if ok && (usage.InputTokens < 0 || usage.OutputTokens < 0 || usage.TotalTokens < 0) {
				t.Fatalf("%s produced negative usage", tc.name)
			}
		})
	}
}
