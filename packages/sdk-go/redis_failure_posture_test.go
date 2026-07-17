package rateguard

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

// ── What happens when Redis dies ──
//
// RateGuard fails CLOSED inbound and OPEN outbound, from the same limiter, on
// the same error. That asymmetry was real, deliberate-looking, and completely
// unstated — an unreviewed security posture is a bug regardless of which way it
// points, so these tests state it.
//
// The reasoning, now that it is written down:
//
//	INBOUND (your API, your server) — FAIL CLOSED, 503.
//	  Nothing else stands between a flood and your handlers. Rejecting is
//	  strictly safer than admitting an unmeasured flood.
//	  Asserted by TestHTTPMiddlewareFailsClosedWhenRedisLimiterErrors.
//
//	OUTBOUND (your agent, your wallet) — FAIL OPEN, call proceeds.
//	  Failing closed would break every LLM call over a Redis blip. And the
//	  thing Redis guards here is request PACING, not SPEND: token budgets are
//	  in-memory (newTokenBudgetManager) and never touch Redis, so a Redis
//	  outage cannot uncap the money. You lose pacing; you keep the cap.
//
// That last clause is the whole justification for fail-open, so it is not left
// as an argument — TestOutboundBudgetStillCapsSpendWhenRedisIsDown proves it.
// If budgets ever gain a Redis backend, the justification evaporates and that
// test is where it breaks.

func TestOutboundRateLimitFailsOpenWhenRedisIsDown(t *testing.T) {
	t.Parallel()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"model": "gpt-4o",
			"usage": map[string]int{"prompt_tokens": 5, "completion_tokens": 5, "total_tokens": 10},
		})
	}))
	defer upstream.Close()

	sdk := New(Config{
		Preset:            PresetDev,
		RequestsPerSecond: 1, // would rate-limit immediately if Redis worked
		Burst:             1,
		RedisClient:       failingRedisLimiterClient{},
	})
	client := wrapForHost(t, sdk, upstream)

	// Far more calls than the 1 RPS / burst 1 policy would ever permit.
	for i := 0; i < 5; i++ {
		req, err := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions",
			strings.NewReader(`{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}`))
		if err != nil {
			t.Fatal(err)
		}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("call %d: %v", i, err)
		}
		code := resp.StatusCode
		_ = resp.Body.Close()

		if code == http.StatusTooManyRequests {
			t.Fatalf("call %d was rate-limited: outbound must FAIL OPEN when Redis is "+
				"unreachable, or a Redis blip breaks every LLM call in the process", i)
		}
		if code != http.StatusOK {
			t.Fatalf("call %d: HTTP %d, want 200", i, code)
		}
	}
}

// TestOutboundBudgetStillCapsSpendWhenRedisIsDown is the test that earns the
// fail-open decision above.
//
// Fail-open is only defensible because Redis guards PACING, not SPEND. If a
// Redis outage also uncapped the budget, "fail open" would mean "a Redis blip
// disables denial-of-wallet protection" — indefensible for this product. It
// does not, because budgets are in-memory. This proves it rather than asserting
// it in a comment.
func TestOutboundBudgetStillCapsSpendWhenRedisIsDown(t *testing.T) {
	t.Parallel()

	var upstreamCalls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"model": "gpt-4o",
			"usage": map[string]int{"prompt_tokens": 40, "completion_tokens": 10, "total_tokens": 50},
		})
	}))
	defer upstream.Close()

	sdk := New(Config{
		Preset:             PresetDev,
		RequestsPerSecond:  1000, // pacing is irrelevant here
		Burst:              1000,
		TokenBudgetPerHour: 60, // one 50-token call fits; the next must not
		TokenBudgetMode:    TokenBudgetModeHardStop,
		RedisClient:        failingRedisLimiterClient{}, // Redis is DOWN
	})
	client := wrapForHost(t, sdk, upstream)

	blocked := false
	for i := 0; i < 6; i++ {
		req, err := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions",
			strings.NewReader(`{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}],"max_tokens":10}`))
		if err != nil {
			t.Fatal(err)
		}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("call %d: %v", i, err)
		}
		code := resp.StatusCode
		_ = resp.Body.Close()
		if code == http.StatusTooManyRequests {
			blocked = true
			break
		}
	}

	if !blocked {
		t.Fatal("with Redis DOWN, a 60-token/hour budget never blocked across 6 calls — " +
			"a Redis outage must not uncap spend. Budgets are in-memory precisely so that " +
			"losing Redis costs pacing, not the money cap. If budgets gained a Redis " +
			"backend, outbound fail-open is no longer defensible.")
	}

	// The enforcement trail must show a budget stop, not a rate limit: the
	// distinction is the whole point — one control failed, the other held.
	events := sdk.EnforcementEvents(0)
	if len(events) == 0 {
		t.Fatal("a budget block must leave an audit trail even with Redis down")
	}
	sawBudget := false
	for _, e := range events {
		if strings.Contains(e.Type, "budget") {
			sawBudget = true
		}
		if e.Type == "rate_limited" {
			t.Fatalf("recorded a rate_limited event while Redis was down — the limiter " +
				"failed open, so it must not claim to have limited anything")
		}
	}
	if !sawBudget {
		t.Fatalf("expected a token_budget event, got %+v", events)
	}
}
