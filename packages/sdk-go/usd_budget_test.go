package rateguard

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// conformance/usd_budget_vectors.json: the same file Node and Python replay.
type usdVectors struct {
	Prices     map[string]ModelPrice `json:"prices"`
	USDToMicro []struct {
		USD   float64 `json:"usd"`
		Micro int64   `json:"micro"`
	} `json:"usd_to_micro"`
	MicroRates []struct {
		Price string `json:"price"`
		Rates struct {
			Input             int64 `json:"input"`
			Output            int64 `json:"output"`
			CacheRead         int64 `json:"cacheRead"`
			CacheWrite        int64 `json:"cacheWrite"`
			CacheWriteLongTTL int64 `json:"cacheWriteLongTTL"`
		} `json:"rates"`
	} `json:"micro_rates"`
	Reserve []struct {
		Price        string `json:"price"`
		PromptTokens int64  `json:"promptTokens"`
		OutputTokens int64  `json:"outputTokens"`
		Micro        int64  `json:"micro"`
	} `json:"reserve"`
	Cost []struct {
		Price string `json:"price"`
		Usage struct {
			InputTokens             int64 `json:"inputTokens"`
			OutputTokens            int64 `json:"outputTokens"`
			CacheReadTokens         int64 `json:"cacheReadTokens"`
			CacheWriteTokens        int64 `json:"cacheWriteTokens"`
			CacheWriteLongTTLTokens int64 `json:"cacheWriteLongTTLTokens"`
		} `json:"usage"`
		Micro int64 `json:"micro"`
	} `json:"cost"`
	Keys []struct {
		Scope, Tenant, Customer, Provider, Model, Key string
	} `json:"keys"`
	Sequence struct {
		DayLimitMicro int64            `json:"dayLimitMicro"`
		Steps         []map[string]any `json:"steps"`
	} `json:"sequence"`
}

// ModelPrice has no JSON tags; the vectors use the Node/Python field names.
func (v *usdVectors) UnmarshalJSON(data []byte) error {
	type alias usdVectors
	aux := struct {
		*alias
		Prices map[string]struct {
			Prompt     float64 `json:"promptUSDPer1K"`
			Completion float64 `json:"completionUSDPer1K"`
			CacheRead  float64 `json:"cacheReadUSDPer1K"`
			CacheWrite float64 `json:"cacheWriteUSDPer1K"`
			LongWrite  float64 `json:"cacheWriteLongTTLUSDPer1K"`
		} `json:"prices"`
	}{alias: (*alias)(v)}
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}
	v.Prices = map[string]ModelPrice{}
	for k, p := range aux.Prices {
		v.Prices[k] = ModelPrice{PromptUSDPer1K: p.Prompt, CompletionUSDPer1K: p.Completion, CacheReadUSDPer1K: p.CacheRead, CacheWriteUSDPer1K: p.CacheWrite, CacheWriteLongTTLUSDPer1K: p.LongWrite}
	}
	return nil
}

func TestConformanceUSDBudget(t *testing.T) {
	data, err := os.ReadFile("../../conformance/usd_budget_vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v usdVectors
	if err := json.Unmarshal(data, &v); err != nil {
		t.Fatal(err)
	}
	for _, c := range v.USDToMicro {
		if got, _ := USDToMicro(c.USD); got != c.Micro {
			t.Errorf("USDToMicro(%v) = %d, want %d", c.USD, got, c.Micro)
		}
	}
	for _, c := range v.MicroRates {
		got := MicroRatesFor(v.Prices[c.Price])
		want := MicroRates{c.Rates.Input, c.Rates.Output, c.Rates.CacheRead, c.Rates.CacheWrite, c.Rates.CacheWriteLongTTL}
		if got != want {
			t.Errorf("MicroRatesFor(%s) = %+v, want %+v", c.Price, got, want)
		}
	}
	for _, c := range v.Reserve {
		if got := ReserveMicroUSD(MicroRatesFor(v.Prices[c.Price]), c.PromptTokens, c.OutputTokens); got != c.Micro {
			t.Errorf("ReserveMicroUSD(%s, %d, %d) = %d, want %d", c.Price, c.PromptTokens, c.OutputTokens, got, c.Micro)
		}
	}
	for _, c := range v.Cost {
		u := TokenUsage{InputTokens: c.Usage.InputTokens, OutputTokens: c.Usage.OutputTokens, CacheReadTokens: c.Usage.CacheReadTokens, CacheWriteTokens: c.Usage.CacheWriteTokens, CacheWriteLongTTLTokens: c.Usage.CacheWriteLongTTLTokens}
		if got := CostMicroUSD(MicroRatesFor(v.Prices[c.Price]), u); got != c.Micro {
			t.Errorf("CostMicroUSD(%s, %+v) = %d, want %d", c.Price, u, got, c.Micro)
		}
	}
	for _, c := range v.Keys {
		if got := USDBudgetKey(c.Scope, c.Tenant, c.Customer, c.Provider, c.Model); got != c.Key {
			t.Errorf("USDBudgetKey(%+v) = %q, want %q", c, got, c.Key)
		}
	}

	m := newTokenBudgetManager(&fakeClock{now: time.Unix(1_700_000_000, 0)})
	policy := PolicyPreset{TokenBudgetPerDay: v.Sequence.DayLimitMicro, TokenBudgetMode: TokenBudgetModeHardStop}
	ids := map[string]string{}
	num := func(x any) int64 { return int64(x.(float64)) }
	for _, s := range v.Sequence.Steps {
		note := fmt.Sprint(s)
		switch s["op"] {
		case "reserve":
			d := m.reserveWithEstimate("k", policy, TokenBudgetModeHardStop, num(s["estimate"]))
			if d.Allowed != s["allowed"].(bool) {
				t.Fatalf("%s: allowed = %v", note, d.Allowed)
			}
			if d.Allowed {
				if d.reserved != num(s["reserved"]) || d.Remaining != num(s["remaining"]) {
					t.Fatalf("%s: reserved %d remaining %d", note, d.reserved, d.Remaining)
				}
			}
			ids[s["id"].(string)] = d.reservationID
		case "commit":
			id := ""
			if s["id"] != nil {
				id = ids[s["id"].(string)]
			}
			m.commitReservation("k", id, num(s["micro"]))
		case "release":
			m.releaseReservation("k", ids[s["id"].(string)])
		case "check":
			d := m.check("k", policy)
			if d.Remaining != num(s["remaining"]) {
				t.Fatalf("%s: remaining = %d", note, d.Remaining)
			}
			if a, ok := s["allowed"]; ok && d.Allowed != a.(bool) {
				t.Fatalf("%s: allowed = %v", note, d.Allowed)
			}
		}
	}
}

// ── through the public surface: WrapClient + USDBudgetState ──

var usdTestPricing = StaticPricing{
	"vec-full":  {PromptUSDPer1K: 0.003, CompletionUSDPer1K: 0.015, CacheReadUSDPer1K: 0.0003, CacheWriteUSDPer1K: 0.00375, CacheWriteLongTTLUSDPer1K: 0.006},
	"vec-cheap": {PromptUSDPer1K: 0.00015, CompletionUSDPer1K: 0.0006},
}

// echoModelHandler answers for the model the request asked for, 1000 in / 200 out.
func echoModelHandler(status int, calls *atomic.Int64) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		var req struct {
			Model string `json:"model"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		if status != http.StatusOK {
			w.WriteHeader(status)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"id":"c","model":%q,"choices":[{"message":{"content":"hi"}}],"usage":{"prompt_tokens":1000,"completion_tokens":200,"total_tokens":1200}}`, req.Model)
	}
}

func usdCall(t *testing.T, client *http.Client, model, customer string) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions",
		strings.NewReader(fmt.Sprintf(`{"model":%q,"max_tokens":200,"messages":[{"role":"user","content":"hello there"}]}`, model)))
	if customer != "" {
		req.Header.Set("X-RateGuard-Customer", customer)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = io.ReadAll(resp.Body)
	resp.Body.Close()
	return resp
}

func usdSDK(t *testing.T, cfg USDBudgetConfig, status int) (*SDK, *http.Client, *atomic.Int64) {
	t.Helper()
	calls := &atomic.Int64{}
	server := httptest.NewServer(echoModelHandler(status, calls))
	t.Cleanup(server.Close)
	sdk := New(Config{Preset: "dev", PricingProvider: usdTestPricing, USDBudget: &cfg})
	sdk.SetPolicy(PolicyUpdate{TokenBudgetPerHour: ptrInt64(0), TokenBudgetPerDay: ptrInt64(0), TokenBudgetPerMonth: ptrInt64(0)})
	return sdk, wrapForHost(t, sdk, server), calls
}

func ptrInt64(v int64) *int64 { return &v }

func TestUSDBudgetCommitsMeasuredCost(t *testing.T) {
	sdk, client, _ := usdSDK(t, USDBudgetConfig{DayLimitUSD: 1}, http.StatusOK)
	if r := usdCall(t, client, "vec-full", ""); r.StatusCode != 200 {
		t.Fatalf("status %d", r.StatusCode)
	}
	// 1000 * $3/M + 200 * $15/M = 6,000 micro-USD
	s := sdk.USDBudgetState("", "", "")
	if !s.Applied || s.LimitMicroUSD != 1_000_000 || s.RemainingMicroUSD != 1_000_000-6_000 || s.Key != "global:usd" {
		t.Fatalf("state %+v", s)
	}
}

func TestUSDBudgetDeniesBeforeTheNetwork(t *testing.T) {
	sdk, client, calls := usdSDK(t, USDBudgetConfig{DayLimitUSD: 0.005}, http.StatusOK)
	usdCall(t, client, "vec-full", "")
	r := usdCall(t, client, "vec-full", "")
	if r.StatusCode != http.StatusTooManyRequests || calls.Load() != 1 {
		t.Fatalf("status %d, upstream calls %d", r.StatusCode, calls.Load())
	}
	if ev := sdk.EnforcementEvents(1); len(ev) != 1 || ev[0].Type != "usd_budget_exceeded" {
		t.Fatalf("events %+v", ev)
	}
}

func TestUSDBudgetUnpricedModel(t *testing.T) {
	sdk, client, calls := usdSDK(t, USDBudgetConfig{DayLimitUSD: 1}, http.StatusOK)
	if r := usdCall(t, client, "mystery-model-9", ""); r.StatusCode != http.StatusTooManyRequests || calls.Load() != 0 {
		t.Fatalf("deny: status %d calls %d", r.StatusCode, calls.Load())
	}
	if ev := sdk.EnforcementEvents(1); ev[0].Type != "usd_price_unknown" {
		t.Fatalf("event %+v", ev)
	}
	sdk2, client2, calls2 := usdSDK(t, USDBudgetConfig{DayLimitUSD: 1, Unpriced: "allow-uncounted"}, http.StatusOK)
	usdCall(t, client2, "mystery-model-9", "")
	usdCall(t, client2, "mystery-model-9", "")
	if calls2.Load() != 2 || sdk2.USDBudgetState("", "", "").RemainingMicroUSD != 1_000_000 {
		t.Fatalf("allow-uncounted: calls %d state %+v", calls2.Load(), sdk2.USDBudgetState("", "", ""))
	}
	n := 0
	for _, e := range sdk2.EnforcementEvents(0) {
		if e.Type == "usd_unpriced_call" {
			n++
		}
	}
	if n != 2 {
		t.Fatalf("usd_unpriced_call events = %d, want 2", n)
	}
}

func TestUSDBudgetScopes(t *testing.T) {
	sdk, client, _ := usdSDK(t, USDBudgetConfig{DayLimitUSD: 1}, http.StatusOK)
	usdCall(t, client, "vec-full", "acme")
	usdCall(t, client, "vec-cheap", "acme")
	usdCall(t, client, "vec-full", "globex")
	if got := sdk.USDBudgetState("acme", "", "").RemainingMicroUSD; got != 1_000_000-6_000-270 {
		t.Fatalf("acme remaining %d", got)
	}
	if got := sdk.USDBudgetState("globex", "", "").RemainingMicroUSD; got != 1_000_000-6_000 {
		t.Fatalf("globex remaining %d", got)
	}
	sdkM, clientM, _ := usdSDK(t, USDBudgetConfig{DayLimitUSD: 1, Scope: "model"}, http.StatusOK)
	usdCall(t, clientM, "vec-full", "")
	if got := sdkM.USDBudgetState("", "openai", "vec-full").RemainingMicroUSD; got != 1_000_000-6_000 {
		t.Fatalf("model scope remaining %d", got)
	}
	if got := sdkM.USDBudgetState("", "openai", "vec-cheap").RemainingMicroUSD; got != 1_000_000 {
		t.Fatalf("other model remaining %d", got)
	}
}

func TestUSDBudgetReleasesOnProviderFailure(t *testing.T) {
	sdk, client, _ := usdSDK(t, USDBudgetConfig{DayLimitUSD: 1}, http.StatusInternalServerError)
	usdCall(t, client, "vec-full", "")
	if got := sdk.USDBudgetState("", "", "").RemainingMicroUSD; got != 1_000_000 {
		t.Fatalf("remaining after failure %d", got)
	}
}

func TestUSDBudgetSoftStopWarnsNeverDenies(t *testing.T) {
	sdk, client, calls := usdSDK(t, USDBudgetConfig{DayLimitUSD: 0.007, Mode: TokenBudgetModeSoftStop}, http.StatusOK)
	usdCall(t, client, "vec-full", "")
	if r := usdCall(t, client, "vec-full", ""); r.StatusCode != 200 || calls.Load() != 2 {
		t.Fatalf("soft-stop denied: %d", r.StatusCode)
	}
	if s := sdk.USDBudgetState("", "", ""); !s.Warning || !s.Allowed {
		t.Fatalf("state %+v", s)
	}
}

func TestUSDBudgetPeekNeverReserves(t *testing.T) {
	sdk, _, _ := usdSDK(t, USDBudgetConfig{DayLimitUSD: 1}, http.StatusOK)
	for i := 0; i < 5; i++ {
		sdk.USDBudgetState("acme", "", "")
	}
	if got := sdk.USDBudgetState("acme", "", "").RemainingMicroUSD; got != 1_000_000 {
		t.Fatalf("peek consumed: %d", got)
	}
}

func TestUSDBudgetConfig(t *testing.T) {
	if s := New(Config{Preset: "dev"}).USDBudgetState("", "", ""); s.Applied {
		t.Fatal("applied without a config")
	}
	if s := New(Config{Preset: "dev", USDBudget: &USDBudgetConfig{}}).USDBudgetState("", "", ""); s.Applied {
		t.Fatal("applied with zero limits")
	}
	for _, bad := range []USDBudgetConfig{{DayLimitUSD: -1}, {DayLimitUSD: 1, Scope: "galaxy"}, {DayLimitUSD: 1, Unpriced: "maybe"}} {
		if bad.Validate() == nil {
			t.Fatalf("Validate accepted %+v", bad)
		}
		func() {
			defer func() {
				if recover() == nil {
					t.Fatalf("New accepted %+v", bad)
				}
			}()
			New(Config{USDBudget: &bad})
		}()
	}
}

func TestUSDBudgetMCPToolPeeksAndListLimitsCarriesIt(t *testing.T) {
	sdk, client, _ := usdSDK(t, USDBudgetConfig{DayLimitUSD: 1}, http.StatusOK)
	usdCall(t, client, "vec-full", "acme")
	call := func(name string, args map[string]any) map[string]any {
		t.Helper()
		for _, tool := range sdk.MCPTools() {
			if tool.Name == name {
				out, err := tool.Handler(args)
				if err != nil {
					t.Fatal(err)
				}
				return out
			}
		}
		t.Fatalf("no tool %s", name)
		return nil
	}
	for i := 0; i < 3; i++ { // peeking never reserves
		call("get_usd_budget", map[string]any{"customer": "acme", "estimated_usd": 0.5})
	}
	got := call("get_usd_budget", map[string]any{"customer": "acme", "estimated_usd": 2.0})
	if got["remaining_micro_usd"] != int64(994_000) || got["would_fit"] != false || got["estimated"] != true || got["estimated_micro_usd"] != int64(2_000_000) {
		t.Fatalf("get_usd_budget = %+v", got)
	}
	limits := call("list_limits", map[string]any{"key": "k", "customer": "acme"})
	usd, ok := limits["usd_budget"].(map[string]any)
	if !ok || usd["remaining_micro_usd"] != int64(994_000) {
		t.Fatalf("list_limits usd_budget = %+v", limits["usd_budget"])
	}
	off := New(Config{Preset: "dev"})
	for _, tool := range off.MCPTools() {
		if tool.Name == "get_usd_budget" {
			out, _ := tool.Handler(map[string]any{})
			if out["applied"] != false {
				t.Fatalf("unconfigured = %+v", out)
			}
		}
	}
}

func TestUSDBudgetPrometheusCounters(t *testing.T) {
	sdk, client, _ := usdSDK(t, USDBudgetConfig{DayLimitUSD: 0.005}, http.StatusOK)
	usdCall(t, client, "vec-full", "")
	usdCall(t, client, "vec-full", "")
	usdCall(t, client, "mystery-model-9", "")
	text := sdk.metrics.prometheusText()
	// call 1 settles 6,000 micro; call 2 is denied; call 3 is unpriced
	for _, want := range []string{"rateguard_usd_budget_exhausted_total 1\n", "rateguard_usd_unpriced_calls_total 1\n", "rateguard_usd_budget_spent_micro_usd_total 6000\n"} {
		if !strings.Contains(text, want) {
			t.Fatalf("metrics missing %q", want)
		}
	}
}
