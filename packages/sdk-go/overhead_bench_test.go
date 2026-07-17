package rateguard

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// ── Overhead benchmarks ──
//
// "No proxy. No extra service. No latency overhead." is the headline claim and
// it was, until this file, entirely unmeasured. An adjective is not a number,
// and the first question any technical reader asks is "how much?".
//
// These measure what a USER actually pays, through the public surface, against
// the same handler/transport without RateGuard. The delta is the answer.
//
// The comparison that matters is not "is it zero" — nothing is zero. It is
// "how does it compare to the gateway hop it replaces", which is a network
// round trip: ~1-30ms. Anything in the microsecond range wins by 3-4 orders of
// magnitude, and saying so honestly beats claiming a zero we cannot deliver.
//
// Run:
//   go test -bench=Overhead -benchmem -run='^$' ./...

// benchNoopHandler is the floor: what the same request costs with no RateGuard.
var benchNoopHandler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
})

// BenchmarkOverheadBaselineHandler measures the harness itself, so the
// RateGuard numbers below can be read as a delta rather than an absolute.
func BenchmarkOverheadBaselineHandler(b *testing.B) {
	req := httptest.NewRequest(http.MethodGet, "/api/thing", nil)

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rec := httptest.NewRecorder()
		benchNoopHandler.ServeHTTP(rec, req)
	}
}

// BenchmarkOverheadMiddlewareAdmission is the inbound hot path: one admission
// decision (rate limit + token budget) per request.
func BenchmarkOverheadMiddlewareAdmission(b *testing.B) {
	sdk := New(Config{Preset: "high-throughput", TokenBudgetPerHour: 1_000_000_000})
	handler := sdk.HTTPMiddleware(benchNoopHandler)
	req := httptest.NewRequest(http.MethodGet, "/api/thing", nil)

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
	}
}

// BenchmarkOverheadMiddlewareAdmissionParallel: the same decision under
// contention, which is the shape a real server sees.
func BenchmarkOverheadMiddlewareAdmissionParallel(b *testing.B) {
	sdk := New(Config{Preset: "high-throughput", TokenBudgetPerHour: 1_000_000_000})
	handler := sdk.HTTPMiddleware(benchNoopHandler)

	b.ReportAllocs()
	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		req := httptest.NewRequest(http.MethodGet, "/api/thing", nil)
		for pb.Next() {
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
		}
	})
}

// ── Outbound: the flagship path ──

func benchLLMServer(b *testing.B) *httptest.Server {
	b.Helper()
	body, err := json.Marshal(map[string]any{
		"id":    "chatcmpl-bench",
		"model": "gpt-4o",
		"usage": map[string]int{"prompt_tokens": 40, "completion_tokens": 15, "total_tokens": 55},
	})
	if err != nil {
		b.Fatal(err)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}))
	b.Cleanup(srv.Close)
	return srv
}

func benchChatBody(promptChars int) string {
	payload, _ := json.Marshal(map[string]any{
		"model":      "gpt-4o",
		"messages":   []map[string]string{{"role": "user", "content": strings.Repeat("a", promptChars)}},
		"max_tokens": 500,
	})
	return string(payload)
}

// benchOutbound drives a wrapped client against a local server. Passing a nil
// sdk measures the unwrapped floor.
func benchOutbound(b *testing.B, sdk *SDK, opts *OutboundOptions, body string) {
	b.Helper()
	srv := benchLLMServer(b)

	client := srv.Client()
	if sdk != nil {
		if opts != nil {
			client = sdk.WrapClient(client, *opts)
		} else {
			client = sdk.WrapClient(client)
		}
	}

	// The URL must look like a provider or detection skips it entirely — and a
	// skipped call would measure nothing while looking fast.
	url := srv.URL + "/v1/chat/completions"

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		req, err := http.NewRequest(http.MethodPost, url, strings.NewReader(body))
		if err != nil {
			b.Fatal(err)
		}
		req.Host = "api.openai.com" // detection keys on the host
		resp, err := client.Do(req)
		if err != nil {
			b.Fatal(err)
		}
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
	}
}

// BenchmarkOverheadOutboundBaseline: the same call, unwrapped. Includes a real
// loopback HTTP round trip, which is the point — it is the denominator.
func BenchmarkOverheadOutboundBaseline(b *testing.B) {
	benchOutbound(b, nil, nil, benchChatBody(200))
}

// BenchmarkOverheadOutboundWrapped: budget + breaker + limiter + usage
// metering + the per-request estimate.
func BenchmarkOverheadOutboundWrapped(b *testing.B) {
	sdk := New(Config{Preset: "high-throughput", TokenBudgetPerHour: 1_000_000_000})
	benchOutbound(b, sdk, nil, benchChatBody(200))
}

// BenchmarkOverheadOutboundFixedEstimate isolates the cost of the change made
// in 45dce5c: measuring the reservation from the body instead of using a
// constant. A fixed positive estimate skips EstimateRequestTokens entirely, so
// the delta against Wrapped IS the price of measuring.
//
// This benchmark exists to hold that change honest. It added JSON parsing and
// a prompt walk to every outbound call — real CPU, on the hot path, in service
// of correctness. If the price is not worth the 25x overshoot it fixes, that
// should be visible here rather than assumed away.
func BenchmarkOverheadOutboundFixedEstimate(b *testing.B) {
	sdk := New(Config{Preset: "high-throughput", TokenBudgetPerHour: 1_000_000_000})
	opts := OutboundOptions{EstimatedTokens: 4096} // the old constant
	benchOutbound(b, sdk, &opts, benchChatBody(200))
}

// BenchmarkOverheadOutboundLongContext: the estimate walks the prompt, so its
// cost scales with prompt size. This is the expensive end — a 100K-char
// context — and the one that would hurt if the walk were slow.
func BenchmarkOverheadOutboundLongContext(b *testing.B) {
	sdk := New(Config{Preset: "high-throughput", TokenBudgetPerHour: 1_000_000_000})
	benchOutbound(b, sdk, nil, benchChatBody(100_000))
}

// ── Component benchmarks: where the time actually goes ──

func BenchmarkOverheadEstimateTokens(b *testing.B) {
	for _, tc := range []struct {
		name string
		text string
	}{
		{"ascii_200", strings.Repeat("a", 200)},
		{"ascii_100k", strings.Repeat("a", 100_000)},
		{"cjk_10k", strings.Repeat("字", 10_000)},
	} {
		b.Run(tc.name, func(b *testing.B) {
			b.ReportAllocs()
			b.SetBytes(int64(len(tc.text)))
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_ = EstimateTokens(tc.text)
			}
		})
	}
}

func BenchmarkOverheadEstimateRequestTokens(b *testing.B) {
	for _, chars := range []int{200, 10_000, 100_000} {
		body := []byte(benchChatBody(chars))
		b.Run(fmt.Sprintf("prompt_%d_chars", chars), func(b *testing.B) {
			b.ReportAllocs()
			b.SetBytes(int64(len(body)))
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_ = EstimateRequestTokens(body, nil)
			}
		})
	}
}

func BenchmarkOverheadExtractUsage(b *testing.B) {
	jsonBody := `{"id":"c1","model":"gpt-4o","usage":{"prompt_tokens":40,"completion_tokens":15,"total_tokens":55}}`
	sse := strings.Join([]string{
		`data: {"choices":[{"delta":{"content":"a"}}],"usage":null}`, ``,
		`data: {"choices":[],"usage":{"prompt_tokens":120,"completion_tokens":30,"total_tokens":150}}`, ``,
		`data: [DONE]`, ``,
	}, "\n")

	b.Run("json", func(b *testing.B) {
		body := []byte(jsonBody)
		b.ReportAllocs()
		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			_, _ = extractTokenUsageFromBody(body)
		}
	})
	b.Run("sse", func(b *testing.B) {
		body := []byte(sse)
		b.ReportAllocs()
		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			_, _ = extractTokenUsageFromBody(body)
		}
	})
}
